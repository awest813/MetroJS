import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  FREIGHT_REACH,
  POWERED_ROAD_GROWTH_BOOST,
  growthChance,
  hasFreightAccess,
  industrialTier,
  lotTier,
  nextDevelopmentDef,
  targetBuildingDef,
} from '../openpublica/src/sim/zoneGrowthHints';
import { INDUSTRY_BASELINE, nextIndustrialDemand } from '../openpublica/src/sim/ZoneGrowthSystem';
import { CityMap } from '../openpublica/src/sim/CityMap';

const HOUSE = { id: 'small_house', population: 4, jobs: 0 };
const ROW = { id: 'rowhouse', population: 8, jobs: 0 };
const BLOCK = { id: 'main_street_block', population: 10, jobs: 5 };
const FLATS = { id: 'corner_store_flats', population: 5, jobs: 3 };
const APARTMENTS = { id: 'shopfront_apartments', population: 6, jobs: 2 };

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

describe('development size', () => {
  const homes = [ROW, HOUSE];

  it('should keep a cheap lot on the smallest house', () => {
    expect(targetBuildingDef(homes, 28, 40)?.id).toBe('small_house');
  });

  it('should allow a rowhouse only when land value and demand are both high', () => {
    expect(targetBuildingDef(homes, 60, 20)?.id).toBe('small_house');
    expect(targetBuildingDef(homes, 30, 80)?.id).toBe('small_house');
    expect(targetBuildingDef(homes, 60, 40)?.id).toBe('rowhouse');
  });

  it('should step mixed-use one size at a time', () => {
    const mixed = [BLOCK, FLATS, APARTMENTS];
    expect(targetBuildingDef(mixed, 20, 20)?.id).toBe('corner_store_flats');
    expect(nextDevelopmentDef(mixed, FLATS, 80, 80)?.id).toBe('shopfront_apartments');
    expect(nextDevelopmentDef(mixed, BLOCK, 80, 80)).toBeUndefined();
  });

  it('should grow shops into shop rows and office blocks downtown', () => {
    const shops = CitySim.createCity(4, 4).growth.defs;
    const commercial = [...shops.values()].filter((d) => d.zoneType === ZoneType.Commercial);
    expect(commercial.map((d) => d.id).sort()).toEqual(['office_block', 'shop_row', 'small_shop']);
    expect(targetBuildingDef(commercial, 30, 90)?.id).toBe('small_shop');
    expect(targetBuildingDef(commercial, 50, 40)?.id).toBe('shop_row');
    expect(targetBuildingDef(commercial, 75, 70)?.id).toBe('office_block');
    const small = shops.get('small_shop')!;
    expect(nextDevelopmentDef(commercial, small, 75, 70)?.id).toBe('shop_row');
  });

  it('should grow workshops into factories on demand, and into works only near a highway', () => {
    const defs = CitySim.createCity(4, 4).growth.defs;
    const industry = [...defs.values()].filter((d) => d.zoneType === ZoneType.Industrial);
    expect(industry.map((d) => d.id).sort()).toEqual(['factory', 'industrial_works', 'light_workshop']);
    expect(industrialTier(30, true)).toBe(0);
    expect(industrialTier(40, false)).toBe(1);
    expect(industrialTier(70, false)).toBe(1);
    expect(industrialTier(70, true)).toBe(2);
    // Land value does not hold industry back (its own smog keeps it cheap).
    expect(targetBuildingDef(industry, 0, 70, industrialTier(70, true))?.id).toBe('industrial_works');
    expect(nextDevelopmentDef(industry, defs.get('light_workshop')!, 0, 70, 2)?.id).toBe('factory');

    const map = new CityMap(16, 16);
    map.getTile(8, 8)!.zoneType = ZoneType.Industrial;
    expect(hasFreightAccess(map, 8, 8)).toBe(false);
    map.getTile(8 + FREIGHT_REACH + 1, 8)!.roadType = RoadType.Highway;
    expect(hasFreightAccess(map, 8, 8)).toBe(false);
    map.getTile(8 + FREIGHT_REACH, 8)!.roadType = RoadType.Highway;
    expect(hasFreightAccess(map, 8, 8)).toBe(true);
    expect(lotTier(map, map.getTile(8, 8)!, 70)).toBe(2);
    // Other zones keep the land-value bars.
    map.getTile(8, 9)!.zoneType = ZoneType.Commercial;
    expect(lotTier(map, map.getTile(8, 9)!, 70)).toBe(0);
  });

  it('should grow faster when the demand bar is full', () => {
    expect(growthChance(50, 100)).toBeGreaterThan(growthChance(50, 10));
  });

  it('should raise the chance for a powered lot and keep the cap', () => {
    const base = growthChance(28, 40);
    const powered = growthChance(28, 40, 1, POWERED_ROAD_GROWTH_BOOST);
    expect(powered).toBeGreaterThan(base * 2);
    expect(powered).toBeLessThanOrEqual(0.9);
    expect(growthChance(100, 100, 1.3, POWERED_ROAD_GROWTH_BOOST)).toBe(0.9);
  });
});

describe('monthly zoning', () => {
  it('should grow a small house, not a rowhouse, on an ordinary lot', () => {
    const sim = CitySim.createCity(16, 16);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Residential);
    const original = Math.random;
    Math.random = () => 0;
    try {
      tickOneMonth(sim);
    } finally {
      Math.random = original;
    }
    expect(sim.getTile(4, 5)!.buildingId).toBe('small_house');
    expect(sim.stats.population).toBeGreaterThan(0);
  });

  it('should open a shop in the same month the first house arrives', () => {
    const sim = CitySim.createCity(16, 16);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Residential);
    sim.setZone(4, 3, ZoneType.Commercial);
    expect(sim.stats.commercialDemand).toBe(0);

    const original = Math.random;
    Math.random = () => 0;
    try {
      tickOneMonth(sim);
    } finally {
      Math.random = original;
    }

    expect(sim.getTile(4, 5)!.buildingId).toBe('small_house');
    expect(sim.getTile(4, 3)!.buildingId).toBe('small_shop');
    expect(sim.stats.population).toBeGreaterThan(0);
    expect(sim.stats.jobs).toBeGreaterThan(0);
    expect(sim.stats.commercialDemand).toBeGreaterThan(0);
  });

  it('should densify a powered house when the neighbourhood can support it', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(2, 8, 'small_power_plant', 0);
    sim.placeServiceBuilding(8, 5, 'small_park', 0);
    // The street from the plant carries its power to the house.
    for (let x = 3; x <= 8; x++) sim.placeRoad(x, 8, RoadType.Street);
    sim.setZone(8, 7, ZoneType.Residential);
    sim.getTile(8, 7)!.buildingId = 'small_house';
    sim.growth.buildings.set('8,7', { defId: 'small_house', x: 8, y: 7 });
    sim.stats.residentialDemand = 80;

    const original = Math.random;
    Math.random = () => 0;
    try {
      tickOneMonth(sim);
    } finally {
      Math.random = original;
    }

    expect(sim.getTile(8, 7)!.powered).toBe(true);
    expect(sim.getTile(8, 7)!.landValue).toBeGreaterThanOrEqual(45);
    expect(sim.getTile(8, 7)!.buildingId).toBe('rowhouse');
    expect(sim.stats.population).toBe(8);
    expect(sim.stats.darkPopulation).toBe(0);
  });

  it('should fill a powered lot on a roll that still misses a dark lot', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(4, 4, 'small_power_plant', 0);
    for (let y = 5; y <= 10; y++) sim.placeRoad(4, y, RoadType.Street);
    sim.setZone(5, 10, ZoneType.Residential);
    sim.placeRoad(20, 20, RoadType.Street);
    sim.setZone(21, 20, ZoneType.Residential);
    expect(sim.getTile(5, 10)!.powered).toBe(true);
    expect(sim.getTile(21, 20)!.powered).toBe(false);

    const original = Math.random;
    Math.random = () => 0.2;
    try {
      tickOneMonth(sim);
    } finally {
      Math.random = original;
    }

    expect(sim.getTile(5, 10)!.buildingId).not.toBeNull();
    expect(sim.getTile(21, 20)!.buildingId).toBeNull();
  });
});

describe('industrial demand', () => {
  const stats = (population: number, jobs: number, industrialDemand: number, indTaxRate = 9) =>
    ({ population, jobs, industrialDemand, indTaxRate });

  it('should settle at the baseline when everyone has a job', () => {
    expect(nextIndustrialDemand(stats(100, 120, INDUSTRY_BASELINE))).toBe(INDUSTRY_BASELINE);
    expect(nextIndustrialDemand(stats(100, 120, 10))).toBe(14);
    expect(nextIndustrialDemand(stats(0, 0, 20))).toBe(20);
  });

  it('should climb toward a target set by the residents without a job', () => {
    // 20% idle aims at 60: four points a month up.
    expect(nextIndustrialDemand(stats(100, 80, 20))).toBe(24);
    expect(nextIndustrialDemand(stats(100, 80, 58))).toBe(60);
    let demand = 20;
    for (let m = 0; m < 30; m++) demand = nextIndustrialDemand(stats(100, 80, demand));
    expect(demand).toBe(60);
  });

  it('should fall twice as fast once the jobs gap closes, whatever the tax', () => {
    expect(nextIndustrialDemand(stats(100, 100, 60))).toBe(52);
    // The tax scales what factories act on (taxes.ts), not the demand itself.
    expect(nextIndustrialDemand(stats(100, 80, 60, 14))).toBe(60);
  });
});
