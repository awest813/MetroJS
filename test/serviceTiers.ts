import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType, type CityTile } from '../openpublica/src/sim/CityTile';
import {
  SERVICE_TIERS,
  budgetCarries,
  isTierUpgrade,
  tierOf,
  tierToBuild,
} from '../openpublica/src/sim/serviceTiers';
import {
  FIRE_HALL_SERVICE,
  FIRE_SERVICE,
  POLICE_POST_SERVICE,
  POLICE_SERVICE,
  WATER_PUMP_SERVICE,
  WATER_SERVICE,
} from '../openpublica/src/tools/serviceCatalog';
import { PlaceServiceTool } from '../openpublica/src/tools/PlaceServiceTool';
import { toolForKey } from '../openpublica/src/ui/Toolbar';

/** A plant on a one-tile street, so its power has somewhere to go. */
function placeConnectedPlant(sim: CitySim, x: number, y: number): void {
  sim.placeServiceBuilding(x, y, 'small_power_plant', 0);
  sim.placeRoad(x, y + 1, RoadType.Street);
}

/** A powered street of `houses` lit homes, stats set by hand, with this projected net. */
function village(houses: number, net: number): CitySim {
  const sim = CitySim.createCity(24, 24);
  sim.stats.money = 5_000;
  placeConnectedPlant(sim, 0, 0);
  for (let x = 2; x < 2 + houses; x++) {
    sim.placeRoad(x, 10, RoadType.Street);
    const lot = sim.getTile(x, 11)!;
    lot.zoneType = ZoneType.Residential;
    lot.buildingId = 'small_house';
  }
  sim.map.forEach((t) => { if (t.buildingId === 'small_house') t.powered = true; });
  Object.assign(sim.stats, {
    population: 100, jobs: 100, pollutionAverage: 0, crimeAverage: 0,
    fireAverage: 100, waterAverage: 100, waterShort: 0, waterLoad: 0, waterSupply: 0,
    projectedIncome: Math.max(0, net), projectedExpenses: Math.max(0, -net),
  });
  return sim;
}

const judge = (sim: CitySim): void => {
  sim.evaluation.tick(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats);
};

describe('small-town service tiers', () => {
  it('should make each small tier about half the price and far cheaper to run, with less reach', () => {
    const pairs = [[FIRE_HALL_SERVICE, FIRE_SERVICE], [POLICE_POST_SERVICE, POLICE_SERVICE], [WATER_PUMP_SERVICE, WATER_SERVICE]] as const;
    const sim = CitySim.createCity(8, 8);
    for (const [small, full] of pairs) {
      expect(small.cost).toBeLessThanOrEqual(full.cost / 2);
      const s = sim.growth.defs.get(small.defId)!;
      const f = sim.growth.defs.get(full.defId)!;
      expect(s.monthlyCost!).toBeLessThanOrEqual(f.monthlyCost! / 2);
      expect((s.fireRadius ?? 0) + (s.policeRadius ?? 0) + (s.waterCapacity ?? 0))
        .toBeLessThan((f.fireRadius ?? 0) + (f.policeRadius ?? 0) + (f.waterCapacity ?? 0));
    }
    expect(SERVICE_TIERS.water.small.upkeep).toBe(15);
    expect(SERVICE_TIERS.fire.full.upkeep).toBe(60);
  });

  it('should name the full tier once the budget carries twice its upkeep', () => {
    expect(budgetCarries({ projectedIncome: 500, projectedExpenses: 420 }, 40)).toBe(true);
    expect(budgetCarries({ projectedIncome: 500, projectedExpenses: 421 }, 40)).toBe(false);
    expect(tierToBuild('water', { projectedIncome: 100, projectedExpenses: 100 }).defId).toBe('water_pump');
    expect(tierToBuild('water', { projectedIncome: 180, projectedExpenses: 100 }).defId).toBe('small_water_tower');
    expect(tierToBuild('fire', { projectedIncome: 119, projectedExpenses: 0 }).defId).toBe('volunteer_fire_hall');
    expect(tierToBuild('fire', { projectedIncome: 120, projectedExpenses: 0 }).defId).toBe('small_fire_station');
    expect(tierToBuild('police', { projectedIncome: 0, projectedExpenses: 50 }).defId).toBe('police_post');
  });

  it('should tell a village of the cheap tiers, and a town that can carry them of the full ones', () => {
    const poor = village(10, -50);
    Object.assign(poor.stats, { waterAverage: 0, fireAverage: 100 });
    judge(poor);
    expect(poor.stats.advisory).toBe('Lots are dry — place a water pump beside a powered street.');
    Object.assign(poor.stats, { waterAverage: 100, crimeAverage: 50 });
    judge(poor);
    expect(poor.stats.advisory).toMatch(/add a powered police post/);

    const rich = village(10, 500);
    Object.assign(rich.stats, { waterAverage: 0 });
    judge(rich);
    expect(rich.stats.advisory).toBe('Lots are dry — place a water tower beside a powered street.');
  });

  it('should not ask for more fire cover once a hall reaches every building, until a station is affordable', () => {
    const sim = village(10, -20);
    sim.map.forEach((t: CityTile) => { if (t.buildingId === 'small_house') t.fireCoverage = 15; });
    sim.stats.fireAverage = 15;
    judge(sim);
    expect(sim.evaluation.advisories.some((a) => a.id === 'fire')).toBe(false);
    // Some buildings out of reach: ask for another hall.
    sim.getTile(2, 11)!.fireCoverage = 0;
    judge(sim);
    expect(sim.stats.advisory).toMatch(/Place a powered volunteer fire hall/);
    // Every building reached, but the budget now carries a station: ask for one.
    sim.getTile(2, 11)!.fireCoverage = 15;
    Object.assign(sim.stats, { projectedIncome: 500, projectedExpenses: 0 });
    judge(sim);
    expect(sim.stats.advisory).toMatch(/place a powered fire station/i);
  });

  it('should upgrade a small tier in place for the difference in price', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 10_000;
    placeConnectedPlant(sim, 0, 0);
    sim.placeRoad(5, 6, RoadType.Street);
    const pump = new PlaceServiceTool(WATER_PUMP_SERVICE);
    const tower = new PlaceServiceTool(WATER_SERVICE);
    const station = new PlaceServiceTool(FIRE_SERVICE);
    expect(pump.apply({ x: 5, y: 5 }, sim)).toBe(true);
    expect(sim.stats.money).toBe(10_000 - WATER_PUMP_SERVICE.cost);
    // A station cannot go on the pump, and a pump cannot go on a tower.
    expect(station.canApply({ x: 5, y: 5 }, sim)).toBe(false);
    expect(tower.upgrades({ x: 5, y: 5 }, sim)).toBe(true);
    expect(tower.costAt({ x: 5, y: 5 }, sim)).toBe(WATER_SERVICE.cost - WATER_PUMP_SERVICE.cost);
    expect(tower.apply({ x: 5, y: 5 }, sim)).toBe(true);
    expect(sim.getTile(5, 5)!.buildingId).toBe('small_water_tower');
    expect(sim.growth.buildings.get('5,5')!.defId).toBe('small_water_tower');
    expect(sim.stats.money).toBe(10_000 - WATER_SERVICE.cost);
    expect(pump.canApply({ x: 5, y: 5 }, sim)).toBe(false);
    expect(isTierUpgrade('small_water_tower', 'water_pump')).toBe(false);
    expect(tierOf('police_post')).toEqual({ service: 'police', small: true });
  });

  it('should advise the upgrade once the budget carries the full tier, pointing at the building', () => {
    const sim = village(10, 20);
    sim.placeServiceBuilding(3, 9, 'volunteer_fire_hall', 0);
    // Placing re-projects the budget: set it again.
    Object.assign(sim.stats, { projectedIncome: 20, projectedExpenses: 0 });
    judge(sim);
    expect(sim.evaluation.advisories.some((a) => a.id === 'upgrade:fire')).toBe(false);
    Object.assign(sim.stats, { projectedIncome: 200, projectedExpenses: 0 });
    judge(sim);
    const upgrade = sim.evaluation.advisories.find((a) => a.id === 'upgrade:fire');
    expect(upgrade?.at).toEqual({ x: 3, y: 9 });
    expect(upgrade?.message).toMatch(/place one on the volunteer fire hall to upgrade it/);
  });

  it('should pick the small tiers with Shift and the service key', () => {
    expect(toolForKey('f', false)).toBe('placeFireStation');
    expect(toolForKey('F', true)).toBe('placeFireHall');
    expect(toolForKey('W', true)).toBe('placeWaterPump');
    expect(toolForKey('O', true)).toBe('placePolicePost');
    // Other keys ignore Shift.
    expect(toolForKey('R', true)).toBe('road');
  });
});
