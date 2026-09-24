import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType } from '../openpublica/src/sim/CityTile';
import { STARTING_MONEY } from '../openpublica/src/sim/EconomySystem';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance the sim by one full simulated month. */
function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

/** A city whose months all have clear weather, so upkeep and loads are the base rates. */
function clearCity(width: number, height: number): CitySim {
  const sim = CitySim.createCity(width, height);
  sim.pinWeather('clear');
  return sim;
}

// ── STARTING_MONEY ────────────────────────────────────────────────────────────

describe('STARTING_MONEY', () => {
  it('should equal the initial city treasury', () => {
    const sim = CitySim.createCity(16, 16);
    expect(sim.stats.money).toBe(STARTING_MONEY);
  });
});

// ── EconomySystem — income ────────────────────────────────────────────────────

describe('EconomySystem income', () => {
  it('should produce zero income when the city is empty', () => {
    const sim = CitySim.createCity(8, 8);
    tickOneMonth(sim);
    expect(sim.stats.monthlyIncome).toBe(0);
  });

  it('should generate residential tax income proportional to population and rate', () => {
    // Register a residential building to give the city a population.
    // small_house: population=4, zoneType=Residential.
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 100_000;
    sim.stats.resTaxRate = 10;
    sim.stats.comTaxRate = 0;
    sim.stats.indTaxRate = 0;

    // Register 25 small houses — enough to hit population=100 (25 × 4).
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        sim.growth.buildings.set(`${x},${y}`, { defId: 'small_house', x, y });
        sim.getTile(x, y)!.buildingId = 'small_house';
      }
    }

    // Power them all so the full population is counted (not UNPOWERED_FACTOR × 0.75).
    // These houses have no street for power lines to reach; this test is about
    // taxes, so the plant (and its upkeep) stays and the houses get power directly.
    sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);
    const distribute = sim.power.tick.bind(sim.power);
    sim.power.tick = (map, buildings, defs) => {
      distribute(map, buildings, defs);
      map.forEach((tile) => { if (tile.buildingId === 'small_house') tile.powered = true; });
    };

    tickOneMonth(sim);

    // income_res = 100 × 10 × 0.3 = 300; road-maintenance is 0 (no road tiles).
    expect(sim.stats.monthlyIncome).toBe(300);
    expect(sim.budget.resIncome).toBe(300);
  });

  it('should generate road-maintenance expenses per street tile', () => {
    const sim = clearCity(8, 8);
    // 4 street tiles
    sim.placeRoad(0, 0, RoadType.Street);
    sim.placeRoad(1, 0, RoadType.Street);
    sim.placeRoad(2, 0, RoadType.Street);
    sim.placeRoad(3, 0, RoadType.Street);
    sim.stats.population = 0;

    tickOneMonth(sim);

    // 4 tiles × $3/tile = $12
    expect(sim.stats.monthlyExpenses).toBe(12);
  });

  it('should project next-month upkeep when streets are paved before the first bill', () => {
    const sim = clearCity(8, 8);
    sim.placeRoad(0, 0, RoadType.Street);
    sim.placeRoad(1, 0, RoadType.Street);
    sim.placeRoad(2, 0, RoadType.Street);
    sim.placeRoad(3, 0, RoadType.Street);
    expect(sim.stats.monthlyExpenses).toBe(0);
    expect(sim.stats.projectedExpenses).toBe(12);
    tickOneMonth(sim);
    expect(sim.stats.monthlyExpenses).toBe(12);
    expect(sim.stats.projectedExpenses).toBe(12);
  });

  it('should charge higher maintenance for trolley avenue tiles', () => {
    const sim = clearCity(8, 8);
    // 2 trolley tiles + 1 street
    sim.placeRoad(0, 0, RoadType.TrolleyAvenue);
    sim.placeRoad(1, 0, RoadType.TrolleyAvenue);
    sim.placeRoad(2, 0, RoadType.Street);
    sim.stats.population = 0;

    tickOneMonth(sim);

    // 2 × $8 + 1 × $3 = $19
    expect(sim.stats.monthlyExpenses).toBe(19);
  });

  it('should charge highway tiles more than streets and less than trolley', () => {
    const sim = clearCity(8, 8);
    sim.placeRoad(0, 0, RoadType.Highway);
    sim.placeRoad(1, 0, RoadType.Highway);
    sim.stats.population = 0;
    tickOneMonth(sim);
    // 2 × $6 = $12
    expect(sim.stats.monthlyExpenses).toBe(12);
  });

  it('should charge each service building its own monthly cost', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(2, 2, 'small_power_plant', 0);
    sim.placeServiceBuilding(3, 3, 'small_park', 0);
    expect(sim.stats.serviceExpenses).toBe(100);
    tickOneMonth(sim);
    // plant $80 + park $20
    expect(sim.stats.serviceExpenses).toBe(100);
    expect(sim.stats.monthlyExpenses).toBe(100);
  });

  it('should raise projected civic cost when a station is placed mid-month', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 100_000;
    tickOneMonth(sim);
    expect(sim.stats.monthlyExpenses).toBe(0);
    sim.placeServiceBuilding(2, 2, 'small_power_plant', 0);
    expect(sim.stats.monthlyExpenses).toBe(0);
    expect(sim.stats.serviceExpenses).toBe(80);
    expect(sim.stats.projectedExpenses).toBe(80);
  });

  it('should set bankruptcyWarning when treasury goes negative', () => {
    const sim = CitySim.createCity(8, 8);
    // Place enough streets to drain all money before income arrives.
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        sim.placeRoad(x, y, RoadType.Street);
      }
    }
    // 64 streets × $3 = $192 expenses, income = 0 → net -$192 per month.
    // Drain money manually to trigger the warning on the first tick.
    sim.stats.money = 50;

    tickOneMonth(sim);

    expect(sim.stats.bankruptcyWarning).toBe(true);
    expect(sim.stats.money).toBeLessThan(0);
  });

  it('should clear bankruptcyWarning when treasury is non-negative', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 10_000;
    sim.stats.bankruptcyWarning = true;

    tickOneMonth(sim);

    expect(sim.stats.bankruptcyWarning).toBe(false);
  });
});

// ── EconomySystem — MixedUse job income ──────────────────────────────────────

describe('EconomySystem MixedUse job income', () => {
  it('should count mixed-use jobs toward commercial tax income', () => {
    // Manually inject a placed mixed-use building by bypassing the growth system
    // and using placeServiceBuilding (which accepts any def including mixed-use).
    const sim = CitySim.createCity(8, 8);
    // shopfront_apartments: jobs=2, zoneType=MixedUse
    // Use placeServiceBuilding to register the building instance.
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(4, 4, 'shopfront_apartments', 0);

    sim.stats.population = 0;
    sim.stats.comTaxRate = 10;
    sim.stats.resTaxRate = 0;
    sim.stats.indTaxRate = 0;

    tickOneMonth(sim);

    // 2 commercial jobs × 10% × 0.25 = $5
    expect(sim.stats.monthlyIncome).toBe(5);
    expect(sim.budget.comIncome).toBe(5);
  });
});

// ── Tax rate sensitivity ──────────────────────────────────────────────────────

describe('EconomySystem tax rate sensitivity', () => {
  it('should produce more income at a higher tax rate', () => {
    function buildSim(rate: number): CitySim {
      const s = CitySim.createCity(8, 8);
      s.stats.money    = 100_000;
      s.stats.resTaxRate = rate;
      s.stats.comTaxRate = 0;
      s.stats.indTaxRate = 0;
      // Register one powered small_house (population=4) at (0,0).
      s.growth.buildings.set('0,0', { defId: 'small_house', x: 0, y: 0 });
      s.getTile(0, 0)!.buildingId = 'small_house';
      s.placeServiceBuilding(4, 4, 'small_power_plant', 0);
      return s;
    }

    const sim5  = buildSim(5);
    tickOneMonth(sim5);
    const income5 = sim5.stats.monthlyIncome;

    const sim15 = buildSim(15);
    tickOneMonth(sim15);
    const income15 = sim15.stats.monthlyIncome;

    expect(income15).toBeGreaterThan(income5);
  });

  it('should produce zero residential income at a 0% tax rate', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money    = 100_000;
    sim.stats.resTaxRate = 0;
    sim.stats.comTaxRate = 0;
    sim.stats.indTaxRate = 0;
    // One powered residential building.
    sim.growth.buildings.set('0,0', { defId: 'small_house', x: 0, y: 0 });
    sim.getTile(0, 0)!.buildingId = 'small_house';
    sim.placeServiceBuilding(4, 4, 'small_power_plant', 0);
    tickOneMonth(sim);
    expect(sim.stats.monthlyIncome).toBe(0);
  });
});

// ── Weather on the books ──────────────────────────────────────────────────────

describe('EconomySystem weather', () => {
  function streets(sim: CitySim): void {
    for (let x = 0; x < 4; x++) sim.placeRoad(x, 0, RoadType.Street);
  }

  it('should add snow clearing to road upkeep in a snowy month', () => {
    const snowy = CitySim.createCity(8, 8);
    snowy.pinWeather('snow');
    streets(snowy);
    // 4 streets × $3 = $12, plowing half again.
    expect(snowy.budget.roadExpenses).toBe(18);
    expect(snowy.budget.weatherRoadExpenses).toBe(6);
    tickOneMonth(snowy);
    expect(snowy.stats.monthlyExpenses).toBe(18);

    const clear = clearCity(8, 8);
    streets(clear);
    expect(clear.budget.roadExpenses).toBe(12);
    expect(clear.budget.weatherRoadExpenses).toBe(0);
  });
});
