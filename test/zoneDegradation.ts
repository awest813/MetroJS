import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  STRESS_MONTHS_TO_CHANGE,
  demandExodusCap,
  formatGrowthHint,
  zoneBuildingIsStressed,
  zoneStress,
} from '../openpublica/src/sim/zoneGrowthHints';

function tickMonths(sim: CitySim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick(MONTH_SECONDS);
}

function plantHouseNoPower(): CitySim {
  const sim = CitySim.createCity(16, 16);
  sim.stats.money = 100_000;
  sim.placeRoad(4, 4, RoadType.Street);
  sim.getTile(4, 5)!.zoneType = ZoneType.Residential;
  sim.getTile(4, 5)!.buildingId = 'small_house';
  sim.growth.buildings.set('4,5', { defId: 'small_house', x: 4, y: 5 });
  return sim;
}

describe('building degradation', () => {
  it('should treat unpowered lots as stressed', () => {
    const sim = plantHouseNoPower();
    const tile = sim.getTile(4, 5)!;
    expect(zoneBuildingIsStressed(tile, sim.map, sim.stats)).toBe(true);
  });

  it('should keep an unpowered house for three months then leave on the fourth', () => {
    const sim = plantHouseNoPower();
    tickMonths(sim, STRESS_MONTHS_TO_CHANGE - 1);
    expect(sim.getTile(4, 5)!.buildingId).toBe('small_house');
    tickMonths(sim, 1);
    expect(sim.getTile(4, 5)!.buildingId).toBeNull();
    expect(sim.growth.buildings.has('4,5')).toBe(false);
    expect(sim.getTile(4, 5)!.zoneType).toBe(ZoneType.Residential);
  });

  it('should thin a zone a few houses a month when demand alone is gone', () => {
    // 30 lit houses along a street, a plant well away, taxes high enough to hold demand at 0.
    const sim = CitySim.createCity(48, 8);
    sim.stats.money = 100_000;
    sim.stats.resTaxRate = 20;
    sim.batch(() => {
      for (let x = 0; x < 48; x++) sim.placeRoad(x, 3, RoadType.Street);
      for (let x = 0; x < 30; x++) {
        const tile = sim.getTile(x, 4)!;
        tile.zoneType = ZoneType.Residential;
        tile.buildingId = 'small_house';
        sim.growth.buildings.set(`${x},4`, { defId: 'small_house', x, y: 4 });
      }
      sim.placeServiceBuilding(47, 4, 'small_power_plant', 0);
    });
    sim.refreshDerivedState({ includeMonthlyOverlays: true }); // count the residents first
    sim.stats.residentialDemand = 0;
    const houses = (): number => [...sim.growth.buildings.values()].filter((b) => b.defId === 'small_house').length;
    expect(zoneStress(sim.getTile(10, 4)!, sim.map, sim.stats)).toBe('demand');

    tickMonths(sim, STRESS_MONTHS_TO_CHANGE);
    // Every house hit its fourth stressed month together; only a few leave.
    expect(houses()).toBe(30 - demandExodusCap(30));
    tickMonths(sim, 1);
    expect(houses()).toBeGreaterThanOrEqual(30 - 2 * demandExodusCap(30));
    expect(houses()).toBeLessThan(30 - demandExodusCap(30));
  });

  it('should not abandon a power plant', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);
    tickMonths(sim, 6);
    expect(sim.getTile(8, 8)!.buildingId).toBe('small_power_plant');
  });

  it('should downgrade a rowhouse before leaving the lot', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeRoad(4, 4, RoadType.Street);
    sim.getTile(4, 5)!.zoneType = ZoneType.Residential;
    sim.getTile(4, 5)!.buildingId = 'rowhouse';
    sim.growth.buildings.set('4,5', { defId: 'rowhouse', x: 4, y: 5 });
    tickMonths(sim, STRESS_MONTHS_TO_CHANGE);
    expect(sim.getTile(4, 5)!.buildingId).toBe('small_house');
    tickMonths(sim, STRESS_MONTHS_TO_CHANGE);
    expect(sim.getTile(4, 5)!.buildingId).toBeNull();
  });

  it('should skip growth during the abandon cooldown even if chance is 100%', () => {
    const sim = plantHouseNoPower();
    tickMonths(sim, STRESS_MONTHS_TO_CHANGE);
    expect(sim.getTile(4, 5)!.buildingId).toBeNull();
    const original = Math.random;
    Math.random = () => 0;
    try {
      tickMonths(sim, 2);
      expect(sim.getTile(4, 5)!.buildingId).toBeNull();
    } finally {
      Math.random = original;
    }
  });

  it('should hint when a building is struggling', () => {
    const sim = plantHouseNoPower();
    const tile = sim.getTile(4, 5)!;
    tile.neglectMonths = 2;
    expect(formatGrowthHint(tile, sim.map, sim.stats)).toMatch(/struggling/);
  });
});
