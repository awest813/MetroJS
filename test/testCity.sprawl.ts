import { RoadType } from '../openpublica/src/sim/CityTile';
import { city, describeCityBasics, tiles } from './support/testCityChecks';

/** Scenario tests for the Sprawl test city (see `openpublica/src/scenarios/testCities.ts`). */

describeCityBasics('sprawl');

describe('sprawl', () => {
  it('should wait at the grid\'s capacity until more plants come, without houses going dark and leaving', () => {
    const { sim, months } = city('sprawl');
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
