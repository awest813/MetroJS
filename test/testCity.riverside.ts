import { RoadType, TerrainType, ZoneType, type CityTile } from '../openpublica/src/sim/CityTile';
import { waterfrontDistance } from '../openpublica/src/sim/shoreline';
import { hasFreightAccess } from '../openpublica/src/sim/zoneGrowthHints';
import { city, describeCityBasics, isZoneBuilding, mean, tiles } from './support/testCityChecks';

/** Scenario tests for the Riverside test city (see `openpublica/src/scenarios/testCities.ts`). */

describeCityBasics('riverside');

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
