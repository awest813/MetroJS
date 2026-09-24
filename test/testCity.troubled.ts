import { city, describeCityBasics } from './support/testCityChecks';

/** Scenario tests for the Troubled test city (see `openpublica/src/scenarios/testCities.ts`). */

describeCityBasics('troubled');

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
