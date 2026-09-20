import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  STRESS_MONTHS_TO_CHANGE,
  formatGrowthHint,
  zoneBuildingIsStressed,
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
