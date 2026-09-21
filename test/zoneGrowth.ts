import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  growthChance,
  nextDevelopmentDef,
  targetBuildingDef,
} from '../openpublica/src/sim/zoneGrowthHints';

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

  it('should grow faster when the demand bar is full', () => {
    expect(growthChance(50, 100)).toBeGreaterThan(growthChance(50, 10));
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
    sim.placeRoad(8, 8, RoadType.Street);
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
  });
});
