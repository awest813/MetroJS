import { ZoneType } from '../openpublica/src/sim/CityTile';
import { levelCrossingAxis, trolleyLines } from '../openpublica/src/sim/TransitSystem';
import { city, darkBuildings, deadEnds, describeCityBasics, isZoneBuilding, mean, tiles } from './support/testCityChecks';

/** Scenario tests for the Metro test city (see `openpublica/src/scenarios/testCities.ts`). */

describeCityBasics('metro');

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
