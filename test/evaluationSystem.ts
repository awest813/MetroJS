import { CitySim } from '../openpublica/src/sim/CitySim';
import { ZoneType, RoadType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

describe('EvaluationSystem', () => {
  it('should start a blank city at full approval with a plant advisory', () => {
    const sim = CitySim.createCity(8, 8);
    expect(sim.stats.approval).toBe(100);
    expect(sim.stats.advisory).toMatch(/paint a street/i);
    expect(sim.stats.advisory).toMatch(/power plant/i);
  });

  it('should ask for zones once a street exists', () => {
    const sim = CitySim.createCity(8, 8);
    sim.placeRoad(2, 2, RoadType.Street);
    expect(sim.stats.advisory).toMatch(/zone empty lots/i);
  });

  it('should tell the player when zoned lots have no plant', () => {
    const sim = CitySim.createCity(8, 8);
    sim.setZone(2, 2, ZoneType.Residential);
    sim.evaluate();
    expect(sim.stats.approval).toBe(88);
    expect(sim.stats.advisory).toMatch(/lots stay dark/i);
  });

  it('should clear the no-plant advisory after placing a generator', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.setZone(4, 4, ZoneType.Residential);
    sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);
    expect(sim.stats.advisory).not.toMatch(/power plant/i);
    expect(sim.stats.approval).toBeGreaterThanOrEqual(50);
    expect(sim.stats.approval).toBeLessThanOrEqual(100);
  });

  it('should flag zoned lots that need a neighbouring road', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);
    sim.setZone(2, 2, ZoneType.Residential);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/road next door/i);
  });

  it('should cut approval for high taxes', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    const baseline = sim.stats.approval;
    sim.stats.resTaxRate = 18;
    sim.evaluate();
    expect(sim.stats.approval).toBe(baseline - (18 - 9) * 3);
    expect(sim.stats.advisory).toMatch(/taxes are high/i);
  });

  it('should cut approval when bankrupt', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.bankruptcyWarning = true;
    sim.evaluate();
    expect(sim.stats.approval).toBe(65);
    expect(sim.stats.advisory).toMatch(/bankrupt/i);
  });

  it('should mention unpowered buildings', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(20, 20, 'small_power_plant', 0);
    sim.growth.buildings.set('1,1', { defId: 'small_house', x: 1, y: 1 });
    sim.getTile(1, 1)!.buildingId = 'small_house';
    sim.getTile(1, 1)!.powered = false;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/unpowered/i);
  });

  it('should mention a smog spike', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 50;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/smog/i);
  });

  it('should mention high crime', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    sim.stats.crimeAverage = 40;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/crime/i);
  });

  it('should mention jammed traffic', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    for (let x = 10; x < 14; x++) {
      sim.placeRoad(x, 10, RoadType.Street);
      sim.getTile(x, 10)!.trafficPressure = 10;
    }
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/traffic/i);
  });

  it('should mention dry lots only after people live in the city', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.setZone(10, 11, ZoneType.Residential);
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/waiting for growth/i);

    sim.stats.population = 40;
    sim.stats.fireAverage = 100;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/water tower/i);
  });

  it('should mention thin fire coverage only after people live in the city', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.setZone(10, 11, ZoneType.Residential);
    sim.stats.population = 40;
    sim.stats.fireAverage = 0;
    sim.stats.waterAverage = 100;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/fire station/i);
  });

  it('should tell shop-only cities to zone housing', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Commercial);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/wait for residents/i);
  });

  it('should mention emptying buildings when lots are struggling', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.getTile(10, 11)!.zoneType = ZoneType.Residential;
    sim.getTile(10, 11)!.buildingId = 'small_house';
    sim.getTile(10, 11)!.powered = true;
    sim.getTile(10, 11)!.neglectMonths = 2;
    sim.growth.buildings.set('10,11', { defId: 'small_house', x: 10, y: 11 });
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/emptying/i);
  });

  it('should warn when a station sits outside the plant radius', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
    sim.placeServiceBuilding(20, 20, 'small_police_station', 0);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/unpowered/i);
    expect(sim.stats.advisory).toMatch(/coverage is off/i);
  });

  it('should keep approval in 0–100 after a dirty month', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.pollutionAverage = 100;
    sim.stats.crimeAverage = 100;
    sim.stats.bankruptcyWarning = true;
    sim.stats.resTaxRate = 20;
    tickOneMonth(sim);
    expect(sim.stats.approval).toBeGreaterThanOrEqual(0);
    expect(sim.stats.approval).toBeLessThanOrEqual(100);
  });
});
