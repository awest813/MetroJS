import { TEST_CITIES, testCityById, type BuiltCity } from '../openpublica/src/scenarios/testCities';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType, type CityTile } from '../openpublica/src/sim/CityTile';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { MAP_SIZE } from '../openpublica/src/data/constants';
import { waterfrontDistance } from '../openpublica/src/sim/shoreline';
import { levelCrossingAxis, trolleyLines } from '../openpublica/src/sim/TransitSystem';
import { ROAD_STEPS, isRoadTile } from '../openpublica/src/sim/roadConnections';
import { hasFreightAccess } from '../openpublica/src/sim/zoneGrowthHints';

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
const deadEnds = (sim: CitySim): CityTile[] => tiles(sim, (t) =>
  t.roadType !== RoadType.None && ROAD_STEPS.filter(([dx, dy]) => isRoadTile(sim.map, t.x + dx, t.y + dy)).length <= 1);

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
  it('should turn its workshops into factories while villagers lack jobs, with no highway for works', () => {
    const { sim } = city('hamlet');
    expect(tiles(sim, (t) => t.buildingId === 'factory').length).toBeGreaterThan(0);
    expect(tiles(sim, (t) => t.buildingId === 'industrial_works')).toEqual([]);
  });

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

  it('should carry commuters from the far bank over the street bridge to work', () => {
    const { sim } = city('riverside');
    // Mid-span, farther from any lot than local trips spread: only commuters drive here.
    const span = tiles(sim, (t) => t.terrain === TerrainType.Water && t.roadType === RoadType.Street);
    const mid = span[Math.floor(span.length / 2)];
    expect(mid.trafficPressure).toBeGreaterThan(0);
  });

  it('should grow industrial works beside its highway, and only there', () => {
    const { sim } = city('riverside');
    const works = tiles(sim, (t) => t.buildingId === 'industrial_works');
    expect(works.length).toBeGreaterThan(0);
    expect(works.every((t) => hasFreightAccess(sim.map, t.x, t.y))).toBe(true);
    expect(sim.stats.jobs).toBeGreaterThan(0.8 * sim.stats.population);
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

  it('should grow a downtown of shop rows and office blocks where land is dear', () => {
    const { sim } = city('metro');
    expect(tiles(sim, (t) => t.buildingId === 'office_block').length).toBeGreaterThan(5);
    expect(tiles(sim, (t) => t.buildingId === 'shop_row').length).toBeGreaterThan(0);
    // Offices only grow on dear land (their own traffic can wear it down later).
    const value = (id: string): number => mean(tiles(sim, (t) => t.buildingId === id).map((t) => t.landValue));
    expect(value('office_block')).toBeGreaterThan(value('small_shop'));
  });

  it('should run one trolley line across the highway and close its blocks into loops', () => {
    const { sim } = city('metro');
    const lines = trolleyLines(sim.map);
    expect(lines).toHaveLength(1);
    expect(levelCrossingAxis(sim.map, 44, 18)).toBe('ns');
    expect(lines[0]).toContain(sim.getTile(44, 18));
    // Only the scripted roads end in the open (the line, the highway, the plant street): the auto streets loop.
    expect(deadEnds(sim).length).toBeLessThanOrEqual(6);
  });

  it('should police both halves of its west district', () => {
    const { sim } = city('metro');
    // A station on each spine: the east half (x 36–42) is patrolled too.
    for (const x of [30, 40]) expect(sim.getTile(x, 6)!.policeCoverage).toBeGreaterThan(0);
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
  it('should wait at the grid\'s capacity until more plants come, without houses going dark and leaving', () => {
    const months: Array<{ population: number; load: number; supply: number; held: number; dark: number }> = [];
    const { sim } = testCityById('sprawl')!.build((s) => {
      months.push({
        population: s.stats.population,
        load: s.stats.powerLoad,
        supply: s.stats.powerSupply,
        held: s.stats.powerHeld ?? 0,
        dark: darkBuildings(s).length,
      });
    });
    // Months 24–30, one plant: at capacity, lots waiting for power, and no churn.
    const onePlant = months.slice(23, 30);
    expect(onePlant.every((m) => m.supply === 400 && m.load >= 0.95 * m.supply)).toBe(true);
    expect(onePlant.some((m) => m.held > 0)).toBe(true);
    const pops = onePlant.map((m) => m.population);
    expect(Math.max(...pops) - Math.min(...pops)).toBeLessThanOrEqual(0.1 * Math.max(...pops));
    // The second plant lets growth go on.
    expect(months[35].population).toBeGreaterThan(months[29].population);
    // Two months after the third plant every lot is lit; the city then grows into the new supply.
    expect(months[37].dark).toBe(0);
    expect(sim.stats.powerSupply).toBe(1200);
    expect(sim.stats.powerLoad).toBeGreaterThan(800);
  });

  it('should load the highway and leave nobody walking or riding', () => {
    const { sim } = city('sprawl');
    expect(tiles(sim, (t) => t.roadType === RoadType.Highway && t.trafficPressure > 0).length).toBeGreaterThan(20);
    expect(sim.stats.transitAccess).toBe(0);
    expect(sim.stats.walkability).toBeLessThan(10);
  });
});
