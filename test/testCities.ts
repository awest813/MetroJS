import { TEST_CITIES, testCityById, type BuiltCity } from '../openpublica/src/scenarios/testCities';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType, type CityTile } from '../openpublica/src/sim/CityTile';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { MAP_SIZE } from '../openpublica/src/data/constants';
import { waterfrontDistance } from '../openpublica/src/sim/shoreline';

/**
 * Scenario tests: each scripted test city is built once (with the player's
 * tools and seeded growth) and checked for what it is meant to show.
 */

const built = new Map<string, BuiltCity>();
function city(id: string): BuiltCity {
  let result = built.get(id);
  if (!result) {
    result = testCityById(id)!.build();
    built.set(id, result);
  }
  return result;
}

function tiles(sim: CitySim, keep: (tile: CityTile) => boolean): CityTile[] {
  const out: CityTile[] = [];
  sim.map.forEach((tile) => {
    if (keep(tile)) out.push(tile);
  });
  return out;
}

const SERVICES = new Set(['small_power_plant', 'small_water_tower', 'small_park', 'small_police_station', 'small_fire_station']);
const isZoneBuilding = (tile: CityTile): boolean => tile.buildingId !== null && !SERVICES.has(tile.buildingId);
const darkBuildings = (sim: CitySim): CityTile[] => tiles(sim, (t) => isZoneBuilding(t) && !t.powered);
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

const ids = TEST_CITIES.map((c) => c.id);

describe('test cities', () => {
  it('should have unique ids, a summary, and what each covers', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of TEST_CITIES) {
      expect(c.summary.startsWith(c.title)).toBe(true);
      expect(c.covers.length).toBeGreaterThan(0);
      expect(testCityById(c.id)).toBe(c);
    }
    expect(testCityById('nowhere')).toBeUndefined();
  });

  describe.each(ids)('%s', (id) => {
    it('should build with every tool stroke landing', () => {
      expect(city(id).refused).toEqual([]);
    });

    it('should keep its books straight', () => {
      const { sim } = city(id);
      expect(sim.map.width).toBe(MAP_SIZE);
      for (const [key, value] of Object.entries(sim.stats)) {
        if (typeof value === 'number') expect([key, Number.isFinite(value)]).toEqual([key, true]);
      }
      expect(sim.stats.population).toBeGreaterThan(0);
      sim.map.forEach((tile) => {
        if (tile.buildingId !== null) {
          expect(sim.growth.buildings.get(`${tile.x},${tile.y}`)?.defId).toBe(tile.buildingId);
          expect(tile.terrain).not.toBe(TerrainType.Water);
          expect(tile.roadType).toBe(RoadType.None);
        }
        if (tile.zoneType !== ZoneType.None) expect(tile.roadType).toBe(RoadType.None);
      });
      expect(sim.growth.buildings.size).toBe(tiles(sim, (t) => t.buildingId !== null).length);
    });

    it('should come back the same from a save', () => {
      const { sim } = city(id);
      const restored = CitySim.createCity(MAP_SIZE, MAP_SIZE);
      SaveCodec.decode(JSON.parse(JSON.stringify(SaveCodec.encode(sim))), restored);
      restored.refreshDerivedState({ applyCrimeHappiness: true, notify: false, includeMonthlyOverlays: true });
      expect(restored.terrainSeed).toBe(sim.terrainSeed);
      expect(restored.growth.buildings.size).toBe(sim.growth.buildings.size);
      expect(restored.stats.population).toBe(sim.stats.population);
      expect(restored.stats.jobs).toBe(sim.stats.jobs);
      expect(restored.stats.powerSupply).toBe(sim.stats.powerSupply);
      expect(restored.stats.powerLoad).toBe(sim.stats.powerLoad);
      expect(restored.stats.money).toBe(sim.stats.money);
    });
  });

  it('should build the same city every time', () => {
    const again = testCityById('hamlet')!.build();
    expect(JSON.stringify(SaveCodec.encode(again.sim))).toBe(JSON.stringify(SaveCodec.encode(city('hamlet').sim)));
  });
});

describe('hamlet', () => {
  it('should be a small, lit, solvent village on one network', () => {
    const { sim } = city('hamlet');
    expect(sim.stats.population).toBeGreaterThan(50);
    expect(sim.stats.population).toBeLessThan(300);
    expect(sim.stats.money).toBeGreaterThan(10_000);
    expect(sim.power.grid!.networks.filter((n) => n.supply > 0)).toHaveLength(1);
    expect(darkBuildings(sim)).toEqual([]);
    expect(sim.stats.happiness).toBeGreaterThanOrEqual(50);
  });

  it('should keep woods standing around town', () => {
    const { sim } = city('hamlet');
    const open = tiles(sim, (t) => t.terrain === TerrainType.Grass && t.zoneType === ZoneType.None && t.roadType === RoadType.None && t.buildingId === null);
    expect(open.length).toBeGreaterThan(3000);
  });
});

describe('riverside', () => {
  it('should cross the river on a street bridge and a highway bridge', () => {
    const { sim } = city('riverside');
    const bridges = tiles(sim, (t) => t.terrain === TerrainType.Water && t.roadType !== RoadType.None);
    expect(bridges.some((t) => t.roadType === RoadType.Street)).toBe(true);
    expect(bridges.some((t) => t.roadType === RoadType.Highway)).toBe(true);
  });

  it('should light the far bank from plants across the bridge', () => {
    const { sim } = city('riverside');
    const plants = tiles(sim, (t) => t.buildingId === 'small_power_plant');
    expect(plants.length).toBeGreaterThan(0);
    expect(plants.every((t) => t.y < 32)).toBe(true);
    const farBank = tiles(sim, (t) => isZoneBuilding(t) && t.y >= 39);
    expect(farBank.length).toBeGreaterThan(10);
    expect(farBank.every((t) => t.powered)).toBe(true);
    expect(sim.stats.waterAverage).toBeGreaterThan(50);
  });

  it('should value waterfront lots above inland ones', () => {
    const { sim } = city('riverside');
    const nearWater = (t: CityTile): boolean => waterfrontDistance(sim.map, t.x, t.y) !== null;
    const lots = tiles(sim, (t) => t.zoneType === ZoneType.Residential);
    const shore = lots.filter(nearWater).map((t) => t.landValue);
    const inland = lots.filter((t) => !nearWater(t)).map((t) => t.landValue);
    expect(shore.length).toBeGreaterThan(3);
    expect(mean(shore)).toBeGreaterThan(mean(inland));
  });
});

describe('metro', () => {
  it('should grow into a city with every kind of building', () => {
    const { sim } = city('metro');
    expect(sim.stats.population).toBeGreaterThan(600);
    expect(sim.stats.jobs).toBeGreaterThan(400);
    const zones = new Set(tiles(sim, isZoneBuilding).map((t) => t.zoneType));
    expect([...zones].sort()).toEqual([ZoneType.Residential, ZoneType.Commercial, ZoneType.Industrial, ZoneType.MixedUse].sort());
    expect(tiles(sim, (t) => t.buildingId === 'rowhouse').length).toBeGreaterThan(0);
  });

  it('should run every service with power to spare', () => {
    const { sim } = city('metro');
    expect(sim.stats.powerShort).toBe(0);
    expect(sim.stats.powerLoad).toBeLessThan(sim.stats.powerSupply);
    expect(darkBuildings(sim)).toEqual([]);
    expect(sim.stats.waterAverage).toBeGreaterThan(80);
    expect(sim.stats.fireAverage).toBeGreaterThan(0);
    expect(tiles(sim, (t) => t.policeCoverage > 0).length).toBeGreaterThan(50);
    expect(sim.stats.transitAccess).toBeGreaterThan(0);
    expect(sim.stats.happiness).toBeGreaterThanOrEqual(60);
  });
});

describe('troubled', () => {
  it('should trip the warnings it was built to trip', () => {
    const { sim } = city('troubled');
    expect(sim.stats.advisory).toMatch(/need a road next door/);
    expect(sim.stats.powerLoad).toBeGreaterThanOrEqual(0.95 * sim.stats.powerSupply);
    expect(sim.stats.darkPopulation).toBeGreaterThan(0);
    expect(sim.stats.pollutionAverage).toBeGreaterThanOrEqual(40);
    expect(sim.stats.resTaxRate).toBeGreaterThanOrEqual(15);
    expect(sim.stats.approval).toBeLessThan(30);
  });

  it('should strand its tower and leave its police station dark', () => {
    const { sim } = city('troubled');
    expect(sim.getTile(34, 61)!.buildingId).toBe('small_water_tower');
    expect(sim.stats.waterSupply).toBe(0);
    expect(sim.getTile(24, 59)!.buildingId).toBe('small_police_station');
    expect(sim.getTile(24, 59)!.powered).toBe(false);
  });
});

describe('sprawl', () => {
  it('should run short toward the far end until the second plant, then light it all', () => {
    let beforeSecondPlant: { dark: number[]; lit: number[] } | null = null;
    let month = 0;
    const { sim } = testCityById('sprawl')!.build((s) => {
      month += 1;
      if (month !== 30) return;
      beforeSecondPlant = {
        dark: darkBuildings(s).map((t) => t.x),
        lit: tiles(s, (t) => isZoneBuilding(t) && t.powered).map((t) => t.x),
      };
    });
    const before = beforeSecondPlant!;
    expect(before.dark.length).toBeGreaterThan(0);
    // The plant is at the west end: lots nearest it are served first.
    expect(mean(before.dark)).toBeGreaterThan(mean(before.lit));
    expect(darkBuildings(sim)).toEqual([]);
    expect(sim.stats.powerSupply).toBe(800);
  });

  it('should load the highway and leave nobody walking or riding', () => {
    const { sim } = city('sprawl');
    expect(tiles(sim, (t) => t.roadType === RoadType.Highway && t.trafficPressure > 0).length).toBeGreaterThan(20);
    expect(sim.stats.transitAccess).toBe(0);
    expect(sim.stats.walkability).toBeLessThan(10);
  });
});
