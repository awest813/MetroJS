import { testCityById, type BuiltCity } from '../../openpublica/src/scenarios/testCities';
import { CitySim } from '../../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType, type CityTile } from '../../openpublica/src/sim/CityTile';
import { SaveCodec } from '../../openpublica/src/save/SaveCodec';
import { MAP_SIZE } from '../../openpublica/src/data/constants';
import { ROAD_STEPS, isRoadTile } from '../../openpublica/src/sim/roadConnections';

/**
 * Shared by the scenario tests (one file per test city, so Jest builds the
 * cities in parallel). Each city is built once per file, with a snapshot of
 * every month on the way.
 */

export interface MonthSnapshot {
  readonly population: number;
  readonly load: number;
  readonly supply: number;
  readonly held: number;
  readonly dark: number;
}

export interface CheckedCity extends BuiltCity {
  /** One snapshot per simulated month, in order. */
  readonly months: readonly MonthSnapshot[];
}

export function tiles(sim: CitySim, keep: (tile: CityTile) => boolean): CityTile[] {
  const out: CityTile[] = [];
  sim.map.forEach((tile) => {
    if (keep(tile)) out.push(tile);
  });
  return out;
}

const SERVICES = new Set(['small_power_plant', 'small_water_tower', 'small_park', 'small_police_station', 'small_fire_station']);
export const isZoneBuilding = (tile: CityTile): boolean => tile.buildingId !== null && !SERVICES.has(tile.buildingId);
export const darkBuildings = (sim: CitySim): CityTile[] => tiles(sim, (t) => isZoneBuilding(t) && !t.powered);
export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
export const deadEnds = (sim: CitySim): CityTile[] => tiles(sim, (t) =>
  t.roadType !== RoadType.None && ROAD_STEPS.filter(([dx, dy]) => isRoadTile(sim.map, t.x + dx, t.y + dy)).length <= 1);

const built = new Map<string, CheckedCity>();

/** The test city `id`, built once (with its monthly snapshots). */
export function city(id: string): CheckedCity {
  let result = built.get(id);
  if (!result) {
    const months: MonthSnapshot[] = [];
    const { sim, refused } = testCityById(id)!.build((s) => {
      months.push({
        population: s.stats.population,
        load: s.stats.powerLoad,
        supply: s.stats.powerSupply,
        held: s.stats.powerHeld ?? 0,
        dark: darkBuildings(s).length,
      });
    });
    result = { sim, refused, months };
    built.set(id, result);
  }
  return result;
}

/** The checks every test city must pass: it builds cleanly, adds up, and survives a save. */
export function describeCityBasics(id: string): void {
  describe(`${id} basics`, () => {
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
}
