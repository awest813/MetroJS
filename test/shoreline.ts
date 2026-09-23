import { CityMap } from '../openpublica/src/sim/CityMap';
import { TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { generateTerrain } from '../openpublica/src/sim/TerrainGenerator';
import {
  FOOTING_CLEARANCE,
  HeightField,
  WATER_BED_Y,
  WATER_SURFACE_Y,
} from '../openpublica/src/sim/HeightField';
import {
  shoreCornerHeight,
  smoothShoreline,
  waterfrontDistance,
} from '../openpublica/src/sim/shoreline';
import { NEAR_WATER_BONUS, WATERFRONT_BONUS } from '../openpublica/src/sim/LandValueSystem';

/** Paint a map from rows of '#' (water) and '.' (land), top row = highest y. */
function paint(rows: string[]): CityMap {
  const h = rows.length;
  const map = new CityMap(rows[0].length, h);
  rows.forEach((row, i) => {
    [...row].forEach((c, x) => {
      map.getTile(x, h - 1 - i)!.terrain = c === '#' ? TerrainType.Water : TerrainType.Grass;
    });
  });
  return map;
}

function water(map: CityMap, x: number, y: number): boolean {
  return map.getTile(x, y)!.terrain === TerrainType.Water;
}

describe('shoreCornerHeight', () => {
  it('should step from dry land through the waterline to the bed', () => {
    expect(shoreCornerHeight(0, 0.5)).toBe(0.5);
    expect(shoreCornerHeight(0.25, 0.5)).toBeGreaterThan(WATER_SURFACE_Y);
    expect(shoreCornerHeight(0.5, 0.5)).toBeLessThan(WATER_SURFACE_Y);
    expect(shoreCornerHeight(0.75, 0.5)).toBeLessThan(shoreCornerHeight(0.5, 0.5));
    expect(shoreCornerHeight(1, 0.5)).toBe(WATER_BED_Y);
  });
});

describe('smoothShoreline', () => {
  it('should sink a one-tile spit and an isthmus', () => {
    const map = paint([
      '#######',
      '###.###',
      '###.###',
      '.......',
      '.......',
      '#######',
      '###.###',
      '#######',
    ]);
    smoothShoreline(map);
    // The spit reaching up from the shore, then the tile it hung off.
    expect(water(map, 3, 6)).toBe(true);
    expect(water(map, 3, 5)).toBe(true);
    // A lone islet goes too.
    expect(water(map, 3, 1)).toBe(true);
    // The broad two-row strip stays land.
    expect(water(map, 1, 3)).toBe(false);
    expect(water(map, 1, 4)).toBe(false);
  });

  it('should fill a one-tile notch of water in the shore', () => {
    const map = paint([
      '#######',
      '#######',
      '...#...',
      '.......',
    ]);
    smoothShoreline(map);
    expect(water(map, 3, 1)).toBe(false);
    expect(water(map, 3, 2)).toBe(true);
  });

  it('should leave a straight shore and a two-wide river alone', () => {
    const rows = [
      '.......',
      '#######',
      '#######',
      '.......',
      '.......',
    ];
    const map = paint(rows);
    smoothShoreline(map);
    const again = paint(rows);
    map.forEach((tile) => expect(tile.terrain).toBe(again.getTile(tile.x, tile.y)!.terrain));
  });

  it('should keep a river mouth at the map edge', () => {
    const map = paint([
      '....',
      '..##',
      '..##',
      '....',
    ]);
    smoothShoreline(map);
    expect(water(map, 3, 1)).toBe(true);
    expect(water(map, 3, 2)).toBe(true);
  });
});

describe('generated shorelines', () => {
  // 37 and 192 grew points of land that sank before the eight-neighbour rule.
  it.each([2026, 7, 99, 1337, 37, 192])('should keep every dry tile above the water (seed %i)', (seed) => {
    const map = new CityMap(64, 64);
    generateTerrain(map, seed);
    const heights = HeightField.fromMap(map, seed);
    map.forEach((tile) => {
      const h = heights.tileCenter(tile.x, tile.y);
      if (tile.terrain === TerrainType.Water) expect(h).toBeLessThan(WATER_SURFACE_Y);
      else expect(h).toBeGreaterThan(WATER_SURFACE_Y);
    });
  });

  it('should stand things clear of the water even on a sunk legacy tile', () => {
    // A lone land tile in a lake, as an old save could hold.
    const map = paint(['###', '#.#', '###']);
    const heights = HeightField.fromMap(map, 1);
    expect(heights.tileCenter(1, 1)).toBeLessThan(WATER_SURFACE_Y);
    expect(heights.footing(1, 1)).toBeCloseTo(WATER_SURFACE_Y + FOOTING_CLEARANCE);
  });
});

describe('waterfront land value', () => {
  it('should measure how far a dry lot is from the water', () => {
    const map = paint(['.....', '.....', '#....']);
    expect(waterfrontDistance(map, 0, 0)).toBeNull();
    expect(waterfrontDistance(map, 1, 1)).toBe(1);
    expect(waterfrontDistance(map, 2, 2)).toBe(2);
    expect(waterfrontDistance(map, 3, 2)).toBeNull();
  });

  it('should add a premium to lots beside the water', () => {
    const sim = CitySim.createCity(16, 16);
    for (let y = 0; y < 16; y++) sim.getTile(0, y)!.terrain = TerrainType.Water;
    sim.setZone(1, 8, ZoneType.Residential);
    sim.setZone(2, 8, ZoneType.Residential);
    sim.setZone(8, 8, ZoneType.Residential);
    const inland = sim.getTile(8, 8)!.landValue;
    expect(sim.getTile(1, 8)!.landValue).toBe(inland + WATERFRONT_BONUS);
    expect(sim.getTile(2, 8)!.landValue).toBe(inland + NEAR_WATER_BONUS);
  });
});
