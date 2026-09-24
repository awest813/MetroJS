import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { city, darkBuildings, describeCityBasics, tiles } from './support/testCityChecks';

/** Scenario tests for the Hamlet test city (see `openpublica/src/scenarios/testCities.ts`). */

describeCityBasics('hamlet');

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
