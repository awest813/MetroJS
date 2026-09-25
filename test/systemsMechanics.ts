import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import {
  COMMERCE_DEMAND_STEP,
  SHOP_JOBS_PER_RESIDENT,
  nextCommercialDemand,
} from '../openpublica/src/sim/ZoneGrowthSystem';
import { STARTER_RESIDENTIAL_DEMAND, formatGrowthHint, starterDemand } from '../openpublica/src/sim/zoneGrowthHints';
import { TAX_HINTS, commerceTooltip, industryTooltip } from '../openpublica/src/ui/chromeCopy';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { TEST_CITIES } from '../openpublica/src/scenarios/testCities';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

/** Seeded dice, so two sims roll the same growth. */
function dice(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('commercial demand', () => {
  const base = { population: 200, shopJobs: 0, commercialDemand: 50, comTaxRate: 9, walkability: 0, transitAccess: 0 };

  it('should head for full demand with no shops, and none once residents keep every shop busy', () => {
    expect(nextCommercialDemand({ ...base, shopJobs: 0 })).toBe(50 + COMMERCE_DEMAND_STEP);
    expect(nextCommercialDemand({ ...base, shopJobs: 200 * SHOP_JOBS_PER_RESIDENT, commercialDemand: 3 })).toBe(0);
    // Halfway to saturation, the target is 50: demand at 50 stays put.
    expect(nextCommercialDemand({ ...base, shopJobs: 100 * SHOP_JOBS_PER_RESIDENT })).toBe(50);
    // Too many shops for the town pulls it down a step a month.
    expect(nextCommercialDemand({ ...base, shopJobs: 400, commercialDemand: 60 })).toBe(60 - COMMERCE_DEMAND_STEP);
  });

  it('should be raised by walkable streets and transit, and lowered by tax', () => {
    const half = { ...base, shopJobs: 100 * SHOP_JOBS_PER_RESIDENT, commercialDemand: 50 };
    expect(nextCommercialDemand({ ...half, walkability: 30, transitAccess: 20 })).toBe(55);
    expect(nextCommercialDemand({ ...half, comTaxRate: 14 })).toBe(45);
    expect(nextCommercialDemand({ ...half, population: 0 })).toBe(45);
  });

  it('should count shop and mixed-use jobs in the census', () => {
    const sim = CitySim.createCity(12, 12);
    const put = (x: number, zone: ZoneType, defId: string): void => {
      Object.assign(sim.getTile(x, 3)!, { zoneType: zone, buildingId: defId, powered: true });
      sim.growth.buildings.set(`${x},3`, { defId, x, y: 3 });
    };
    put(2, ZoneType.Commercial, 'small_shop');
    put(3, ZoneType.Industrial, 'factory');
    put(4, ZoneType.MixedUse, 'shopfront_apartments');
    sim.growth.recomputeCensus(sim.stats, sim.map);
    const jobs = (id: string) => sim.growth.defs.get(id)!.jobs;
    expect(sim.stats.shopJobs).toBe(jobs('small_shop') + jobs('shopfront_apartments'));
    expect(sim.stats.jobs).toBe(sim.stats.shopJobs! + jobs('factory'));
  });

  it('should stop zoned shops growing past what the residents keep busy', () => {
    const sim = CitySim.createCity(40, 40);
    sim.stats.money = 1_000_000;
    sim.growth.random = dice(3);
    sim.batch(() => {
      for (let x = 2; x < 38; x++) sim.placeRoad(x, 10, RoadType.Street);
      sim.placeServiceBuilding(2, 11, 'small_power_plant', 0);
      for (let x = 3; x < 12; x++) sim.setZone(x, 11, ZoneType.Residential);
      for (let x = 3; x < 38; x++) sim.setZone(x, 9, ZoneType.Commercial);
    });
    for (let m = 0; m < 48; m++) sim.tick(MONTH_SECONDS);
    const shops = Array.from(sim.growth.buildings.values()).filter((b) => b.y === 9).length;
    // A street of shops for nine houses: most of it stays empty, and demand says why.
    expect(shops).toBeLessThan(35);
    expect(sim.stats.shopJobs!).toBeLessThanOrEqual(sim.stats.population * SHOP_JOBS_PER_RESIDENT + 7);
    expect(sim.stats.commercialDemand).toBeLessThan(60);
  });
});

describe('an emptied town at high tax', () => {
  it('should draw nobody back while the residential tax is high', () => {
    expect(starterDemand(9)).toBe(STARTER_RESIDENTIAL_DEMAND);
    expect(starterDemand(12)).toBe(22);
    expect(starterDemand(16)).toBe(0);
    expect(starterDemand(0)).toBe(94);
  });

  it('should say the tax keeps people out of an empty town', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeRoad(4, 4, RoadType.Street);
    sim.placeRoad(5, 4, RoadType.Street);
    sim.placeServiceBuilding(4, 3, 'small_power_plant', 0);
    sim.setZone(5, 5, ZoneType.Residential);
    Object.assign(sim.stats, { resTaxRate: 17, residentialDemand: 0, pollutionAverage: 0 });
    sim.evaluate();
    expect(sim.stats.advisory).toBe('Nobody will move in at 17% residential tax — cut it toward 9%.');
    sim.tick(MONTH_SECONDS);
    expect(sim.stats.residentialDemand).toBe(0);
    expect(sim.getTile(5, 5)!.buildingId).toBeNull();
  });
});

describe('save and load', () => {
  it('should carry a city on exactly as if it had never been saved', () => {
    const { sim } = TEST_CITIES.find((c) => c.id === 'troubled')!.build();
    sim.tick(MONTH_SECONDS * 0.4);
    const loaded = CitySim.createCity(sim.map.width, sim.map.height, sim.terrainSeed);
    SaveCodec.decode(SaveCodec.migrate(JSON.parse(JSON.stringify(SaveCodec.encode(sim))))!, loaded);
    loaded.refreshDerivedState({ applyCrimeHappiness: true, notify: false, includeMonthlyOverlays: true });
    expect(loaded.stats.advisory).toBe(sim.stats.advisory);
    expect(loaded.stats.powerHeld).toBe(sim.stats.powerHeld);

    sim.growth.random = dice(7);
    loaded.growth.random = dice(7);
    for (let m = 0; m < 12; m++) {
      sim.tick(MONTH_SECONDS);
      loaded.tick(MONTH_SECONDS);
    }
    const picture = (city: CitySim): string => {
      let out = '';
      city.map.forEach((t) => { out += `${t.buildingId ?? '-'}${t.neglectMonths}${t.landValue};`; });
      return out;
    };
    expect(loaded.stats.population).toBe(sim.stats.population);
    expect(loaded.stats.jobs).toBe(sim.stats.jobs);
    expect(loaded.stats.money).toBeCloseTo(sim.stats.money, 6);
    expect(picture(loaded)).toBe(picture(sim));
  });

  it('should save how long each building has outgrown its lot', () => {
    const sim = CitySim.createCity(8, 8);
    sim.getTile(3, 3)!.buildingId = 'office_block';
    sim.growth.buildings.set('3,3', { defId: 'office_block', x: 3, y: 3 });
    sim.growth.restoreOutgrownMonths([{ x: 3, y: 3, months: 4 }]);
    const save = SaveCodec.encode(sim);
    expect(save.tiles.find((t) => t.x === 3 && t.y === 3)!.outgrownMonths).toBe(4);
    expect(save.tiles.find((t) => t.x === 4 && t.y === 3)!.outgrownMonths).toBeUndefined();
    const loaded = CitySim.createCity(8, 8);
    SaveCodec.decode(save, loaded);
    expect(loaded.growth.outgrownMonths(3, 3)).toBe(4);
  });
});

describe('derived state order', () => {
  it('should count a new fire station in land value on the same refresh', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    for (let x = 2; x < 20; x++) sim.placeRoad(x, 10, RoadType.Street);
    sim.placeServiceBuilding(2, 11, 'small_power_plant', 0);
    sim.setZone(10, 11, ZoneType.Residential);
    const before = sim.getTile(10, 11)!.landValue;
    sim.placeServiceBuilding(12, 11, 'small_fire_station', 0);
    const lot = sim.getTile(10, 11)!;
    expect(lot.fireCoverage).toBeGreaterThan(0);
    expect(lot.landValue).toBeGreaterThan(before);
    // A second refresh with nothing changed moves nothing.
    const settled = lot.landValue;
    sim.refreshDerivedState();
    expect(lot.landValue).toBe(settled);
  });
});

describe('demand explained', () => {
  it('should say what sets shop and factory demand', () => {
    expect(commerceTooltip({ commercialDemand: 68, population: 972, shopJobs: 560, comTaxRate: 9 }, 1.5)).toBe(
      'Shop demand 68%: 972 residents keep up to 1,458 shop and office jobs busy; 560 are open. Walkable streets and transit raise it.',
    );
    expect(commerceTooltip({ commercialDemand: 0, population: 0, comTaxRate: 14 }, 1.5)).toBe(
      'Shop demand 0%: shops wait for residents. Commercial tax at 14% holds it down. Walkable streets and transit raise it.',
    );
    expect(industryTooltip({ industrialDemand: 40, population: 300, jobs: 250, indTaxRate: 9 })).toBe(
      'Factory demand 40%: 50 residents have no job, and factories open to hire them.',
    );
    expect(industryTooltip({ industrialDemand: 0, population: 300, jobs: 320, indTaxRate: 16 })).toBe(
      'Factory demand 0%: every resident has a job, so few new factories open. Industrial tax at 16% holds it down.',
    );
    expect(TAX_HINTS.com).toMatch(/shop demand target by 4/);
  });

  it('should tell an empty shop lot why it waits', () => {
    const sim = CitySim.createCity(12, 12);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Commercial);
    Object.assign(sim.stats, { commercialDemand: 0, comTaxRate: 9 });
    expect(formatGrowthHint(sim.getTile(4, 5)!, sim.map, sim.stats, {})).toMatch(/residents already keep every shop busy/);
    sim.stats.comTaxRate = 15;
    expect(formatGrowthHint(sim.getTile(4, 5)!, sim.map, sim.stats, {})).toMatch(/commercial tax at 15% keeps shops away/);
  });
});
