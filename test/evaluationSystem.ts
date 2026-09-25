import { CitySim } from '../openpublica/src/sim/CitySim';
import { ZoneType, RoadType, type CityTile } from '../openpublica/src/sim/CityTile';
import { SERVICE_ADVISORY_POPULATION, WATER_SHORT_ADVISORY } from '../openpublica/src/sim/EvaluationSystem';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

/** A plant on a one-tile street, so its power has somewhere to go. */
function placeConnectedPlant(sim: CitySim, x: number, y: number): void {
  sim.placeServiceBuilding(x, y, 'small_power_plant', 0);
  sim.placeRoad(x, y + 1, RoadType.Street);
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
    sim.placeRoad(2, 2, RoadType.Street);
    sim.setZone(2, 3, ZoneType.Residential);
    sim.evaluate();
    expect(sim.stats.approval).toBe(88);
    expect(sim.stats.advisory).toMatch(/place a power plant beside a street/i);
  });

  it('should name orphan lots before the generic plant line', () => {
    const sim = CitySim.createCity(8, 8);
    sim.setZone(2, 2, ZoneType.Residential);
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/road next door/i);
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
    placeConnectedPlant(sim, 0, 0);
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
    placeConnectedPlant(sim, 20, 20);
    sim.growth.buildings.set('1,1', { defId: 'small_house', x: 1, y: 1 });
    sim.getTile(1, 1)!.buildingId = 'small_house';
    sim.getTile(1, 1)!.powered = false;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/unpowered/i);
  });

  it('should mention a smog spike', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 50;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/smog/i);
  });

  it('should mention high crime', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.stats.crimeAverage = 40;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/crime/i);
  });

  it('should mention jammed traffic', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    for (let x = 10; x < 14; x++) {
      sim.placeRoad(x, 10, RoadType.Street);
    }
    for (let x = 10; x < 14; x++) {
      sim.getTile(x, 10)!.trafficPressure = 10;
    }
    sim.evaluate();
    expect(sim.stats.advisory).toBe(
      'Traffic is jammed on 4 roads — upgrade them to a highway or trolley line, or add a street behind the block.',
    );
  });

  it('should mention dry lots only after people live in the city', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.setZone(10, 11, ZoneType.Residential);
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/waiting for growth/i);

    sim.stats.population = 40;
    sim.stats.jobs = 0;
    sim.stats.fireAverage = 100;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/zone shops/i);

    sim.stats.jobs = 40;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/water tower/i);
  });

  describe('fire and water', () => {
    /** A powered town of `houses` homes on one street, with its stats set by hand. */
    function town(houses: number): CitySim {
      const sim = CitySim.createCity(24, 24);
      sim.stats.money = 100_000;
      placeConnectedPlant(sim, 0, 0);
      for (let x = 2; x < 2 + houses; x++) {
        sim.placeRoad(x, 10, RoadType.Street);
        const lot = sim.getTile(x, 11)!;
        lot.zoneType = ZoneType.Residential;
        lot.buildingId = 'small_house';
      }
      // Painting each road re-runs power; light the homes once the street is down.
      sim.map.forEach((t) => { if (t.buildingId === 'small_house') t.powered = true; });
      Object.assign(sim.stats, {
        population: 100, jobs: 100, pollutionAverage: 0, crimeAverage: 0,
        fireAverage: 100, waterAverage: 100, waterShort: 0, waterLoad: 0, waterSupply: 0,
      });
      return sim;
    }
    const judge = (sim: CitySim): void => {
      sim.evaluation.tick(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats);
    };
    const cover = (sim: CitySim, fire: number, watered: boolean, share = 1): void => {
      const lots: CityTile[] = [];
      sim.map.forEach((t) => { if (t.buildingId === 'small_house') lots.push(t); });
      lots.forEach((t, i) => {
        const on = i < lots.length * share;
        t.fireCoverage = on ? fire : 0;
        t.watered = on && watered;
      });
    };

    it('should cost approval for buildings no fire engine reaches and buildings left dry', () => {
      const sim = town(10);
      cover(sim, 60, true);
      judge(sim);
      const served = sim.stats.approval;
      cover(sim, 0, false);
      judge(sim);
      expect(sim.stats.approval).toBe(served - 10 - 5);
      cover(sim, 60, true, 0.5);
      judge(sim);
      expect(sim.stats.approval).toBe(served - 5 - 3);
    });

    it('should not count fire or water against a village too small to need them', () => {
      const sim = town(10);
      cover(sim, 60, true);
      sim.stats.population = SERVICE_ADVISORY_POPULATION - 1;
      judge(sim);
      const served = sim.stats.approval;
      cover(sim, 0, false);
      judge(sim);
      expect(sim.stats.approval).toBe(served);
    });

    it('should name dry buildings behind full towers, then thin fire cover, before chronic traffic', () => {
      const sim = town(10);
      cover(sim, 0, true);
      for (let x = 2; x < 5; x++) sim.getTile(x, 10)!.trafficPressure = 12;
      Object.assign(sim.stats, { fireAverage: 0, waterShort: WATER_SHORT_ADVISORY + 7, waterLoad: 600, waterSupply: 600, waterAverage: 60 });
      judge(sim);
      expect(sim.stats.advisory).toBe('Water towers are at capacity (600/600) — 12 buildings are dry. Add a tower on the mains.');

      sim.stats.waterShort = 0;
      judge(sim);
      expect(sim.stats.advisory).toBe(
        'Fire coverage is thin — 10 buildings have no fire engine in reach. Place a powered fire station on a street near them.',
      );

      sim.stats.fireAverage = 100;
      judge(sim);
      expect(sim.stats.advisory).toMatch(/Traffic is jammed on 3 roads/);
    });

    it('should leave a few dry buildings to the Water map', () => {
      const sim = town(10);
      cover(sim, 60, true);
      Object.assign(sim.stats, { waterShort: WATER_SHORT_ADVISORY - 1, waterLoad: 600, waterSupply: 600 });
      judge(sim);
      expect(sim.stats.advisory).not.toMatch(/water/i);
    });
  });

  it('should mention thin fire coverage only after people live in the city', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.setZone(10, 11, ZoneType.Residential);
    sim.stats.population = 40;
    sim.stats.jobs = 40;
    sim.stats.fireAverage = 0;
    sim.stats.waterAverage = 100;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/fire station/i);
  });

  it('should tell shop-only cities to zone housing', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 8, 8);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Commercial);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/wait for residents/i);
  });

  it('should mention emptying buildings when lots are struggling', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
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

  it('should name a want of jobs when houses empty for lack of demand', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.getTile(10, 11)!.zoneType = ZoneType.Residential;
    sim.getTile(10, 11)!.buildingId = 'small_house';
    sim.getTile(10, 11)!.powered = true;
    sim.getTile(10, 11)!.neglectMonths = 2;
    sim.growth.buildings.set('10,11', { defId: 'small_house', x: 10, y: 11 });
    sim.stats.residentialDemand = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/Houses are emptying — more homes than jobs/);
  });

  it('should warn when a station sits outside the plant radius', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.placeServiceBuilding(20, 20, 'small_police_station', 0);
    sim.stats.pollutionAverage = 0;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/unpowered/i);
    expect(sim.stats.advisory).toMatch(/coverage is off/i);
  });

  it('should keep waiting for growth after people arrive when jobs are keeping up', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(10, 10, RoadType.Street);
    sim.setZone(10, 11, ZoneType.Residential);
    sim.stats.population = 12;
    sim.stats.jobs = 12;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/waiting for growth/i);
  });

  it('should warn that dark houses will leave once people live there', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    placeConnectedPlant(sim, 0, 0);
    sim.stats.pollutionAverage = 0;
    sim.placeRoad(20, 20, RoadType.Street);
    sim.getTile(20, 21)!.zoneType = ZoneType.Residential;
    sim.getTile(20, 21)!.buildingId = 'small_house';
    sim.getTile(20, 21)!.powered = false;
    sim.growth.buildings.set('20,21', { defId: 'small_house', x: 20, y: 21 });
    sim.stats.population = 8;
    sim.stats.jobs = 8;
    sim.evaluate();
    expect(sim.stats.advisory).toMatch(/dark and will leave/i);
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

  it('should say when a plant has no street for its power to follow', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);
    expect(sim.stats.advisory).toMatch(/no street — power and water run along streets/);
    expect(sim.stats.powerSupply).toBe(0);
    sim.placeRoad(8, 9, RoadType.Street);
    expect(sim.stats.advisory).not.toMatch(/no street/);
    expect(sim.stats.powerSupply).toBe(400);
  });
});
