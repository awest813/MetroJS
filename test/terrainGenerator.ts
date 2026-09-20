import { CityMap } from '../openpublica/src/sim/CityMap';
import { TerrainType } from '../openpublica/src/sim/CityTile';
import { generateTerrain } from '../openpublica/src/sim/TerrainGenerator';
import { CitySim, RoadType, ZoneType } from '../openpublica/src/sim/CitySim';
import { HeightField, WATER_BED_Y, WATER_SURFACE_Y } from '../openpublica/src/sim/HeightField';

describe('generateTerrain', () => {
  it('should paint both water and land on a large map', () => {
    const map = new CityMap(64, 64);
    generateTerrain(map, 2026);
    let water = 0;
    let land = 0;
    map.forEach((tile) => {
      if (tile.terrain === TerrainType.Water) water += 1;
      else land += 1;
    });
    expect(water).toBeGreaterThan(40);
    expect(land).toBeGreaterThan(water);
    expect(water + land).toBe(64 * 64);
  });

  it('should be deterministic for a seed', () => {
    const a = new CityMap(32, 32);
    const b = new CityMap(32, 32);
    generateTerrain(a, 7);
    generateTerrain(b, 7);
    a.forEach((tile) => {
      expect(b.getTile(tile.x, tile.y)?.terrain).toBe(tile.terrain);
    });
  });

  it('should ring water with dirt beaches', () => {
    const map = new CityMap(64, 64);
    generateTerrain(map, 2026);
    let beachNextToWater = false;
    map.forEach((tile) => {
      if (tile.terrain !== TerrainType.Dirt) return;
      const n = map.getTile(tile.x + 1, tile.y);
      const w = map.getTile(tile.x - 1, tile.y);
      if (n?.terrain === TerrainType.Water || w?.terrain === TerrainType.Water) {
        beachNextToWater = true;
      }
    });
    expect(beachNextToWater).toBe(true);
  });
});

describe('HeightField', () => {
  it('should keep land above the water surface and beds below it', () => {
    const map = new CityMap(64, 64);
    generateTerrain(map, 2026);
    const heights = HeightField.fromMap(map, 2026);
    let sawWater = false;
    let sawLand = false;
    map.forEach((tile) => {
      const h = heights.tileCenter(tile.x, tile.y);
      if (tile.terrain === TerrainType.Water) {
        expect(h).toBeLessThan(WATER_SURFACE_Y);
        expect(h).toBeGreaterThan(WATER_BED_Y - 0.15);
        sawWater = true;
      } else if (tile.terrain === TerrainType.Grass) {
        expect(h).toBeGreaterThan(WATER_SURFACE_Y);
        sawLand = true;
      }
    });
    expect(sawWater).toBe(true);
    expect(sawLand).toBe(true);
  });
});

describe('water is not buildable', () => {
  it('should reject roads, zones, and service buildings on water', () => {
    const sim = CitySim.createCity(64, 64);
    generateTerrain(sim.map, 2026);
    const water = findTerrain(sim, TerrainType.Water);
    expect(water).toBeDefined();
    const { x, y } = water!;
    expect(sim.isBuildable(x, y)).toBe(false);

    sim.placeRoad(x, y, RoadType.Street);
    expect(sim.getTile(x, y)?.roadType).toBe(RoadType.None);

    sim.setZone(x, y, ZoneType.Residential);
    expect(sim.getTile(x, y)?.zoneType).toBe(ZoneType.None);

    expect(sim.placeServiceBuilding(x, y, 'small_power_plant', 1)).toBe(false);
    expect(sim.getTile(x, y)?.buildingId).toBeNull();
  });
});

function findTerrain(sim: CitySim, kind: TerrainType): { x: number; y: number } | undefined {
  let found: { x: number; y: number } | undefined;
  sim.map.forEach((tile) => {
    if (!found && tile.terrain === kind) found = { x: tile.x, y: tile.y };
  });
  return found;
}
