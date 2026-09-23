import { CitySim } from '../openpublica/src/sim/CitySim';
import { TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { GROVE_THRESHOLD, groveStrengths, isOpenGrass, isWooded } from '../openpublica/src/sim/woods';
import { NEAR_WOODS_BONUS, WOODS_EDGE_BONUS } from '../openpublica/src/sim/LandValueSystem';
import { groveSlots } from '../openpublica/src/render/vegetationLayout';

/** A wooded tile with open grass east of it on a 32×32 all-grass map. */
function findEdge(sim: CitySim): { x: number; y: number } {
  const strengths = groveStrengths(sim.terrainSeed, 32, 32);
  for (let y = 4; y < 28; y++) {
    for (let x = 4; x < 25; x++) {
      const here = strengths[y * 32 + x] > GROVE_THRESHOLD;
      const clear = [1, 2, 3, 4].every((d) => strengths[y * 32 + x + d] <= GROVE_THRESHOLD);
      if (here && clear) return { x, y };
    }
  }
  throw new Error('no woods edge on this seed');
}

describe('woods', () => {
  it('should cover open grass where the grove noise runs high, fixed by the seed', () => {
    const a = groveStrengths(2026, 64, 64);
    expect(groveStrengths(2026, 64, 64)).toBe(a);
    const wooded = Array.from(a).filter((n) => n > GROVE_THRESHOLD).length / a.length;
    expect(wooded).toBeGreaterThan(0.1);
    expect(wooded).toBeLessThan(0.35);
    expect(groveStrengths(7, 64, 64)).not.toEqual(a);
  });

  it('should clear when the tile is zoned, paved, built on, or is not grass', () => {
    const sim = CitySim.createCity(32, 32);
    const edge = findEdge(sim);
    const tile = sim.getTile(edge.x, edge.y)!;
    const strengths = groveStrengths(sim.terrainSeed, 32, 32);
    expect(isWooded(tile, strengths, 32)).toBe(true);
    tile.terrain = TerrainType.Dirt;
    expect(isOpenGrass(tile)).toBe(false);
    tile.terrain = TerrainType.Grass;
    sim.setZone(edge.x, edge.y, ZoneType.Residential);
    expect(isWooded(tile, strengths, 32)).toBe(false);
  });

  it('should raise land value at the edge of the woods, and drop it when they are cleared', () => {
    const sim = CitySim.createCity(32, 32);
    const edge = findEdge(sim);
    sim.refreshDerivedState();
    const beside = sim.getTile(edge.x + 1, edge.y)!.landValue;
    const twoAway = sim.getTile(edge.x + 2, edge.y)!.landValue;
    const far = sim.getTile(edge.x + 4, edge.y)!.landValue;
    expect(beside - far).toBeGreaterThanOrEqual(WOODS_EDGE_BONUS - NEAR_WOODS_BONUS);
    expect(twoAway).toBeGreaterThanOrEqual(far);

    // Zone every wooded tile within reach: the premium goes with the trees.
    const strengths = groveStrengths(sim.terrainSeed, 32, 32);
    sim.batch(() => {
      for (let y = edge.y - 3; y <= edge.y + 3; y++) {
        for (let x = edge.x - 3; x <= edge.x + 4; x++) {
          if (strengths[y * 32 + x] > GROVE_THRESHOLD) sim.setZone(x, y, ZoneType.Industrial);
        }
      }
    });
    expect(beside - sim.getTile(edge.x + 1, edge.y)!.landValue).toBe(WOODS_EDGE_BONUS);
  });

  it('should plant two or three trees in a grove, and rarely one outside', () => {
    expect(groveSlots(3, 4, 1, 0.9)).toHaveLength(3);
    expect(groveSlots(3, 4, 1, 0.5)).toHaveLength(2);
    let lone = 0;
    for (let x = 0; x < 400; x++) lone += groveSlots(x, 0, 1, 0).length;
    expect(lone).toBeGreaterThan(0);
    expect(lone).toBeLessThan(40);
  });
});
