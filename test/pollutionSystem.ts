import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { PollutionSystem } from '../openpublica/src/sim/PollutionSystem';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

describe('PollutionSystem', () => {
  describe('initial state', () => {
    it('should start with zero pollution on all tiles', () => {
      const sim = CitySim.createCity(8, 8);
      sim.map.forEach((tile) => {
        expect(tile.pollution).toBe(0);
      });
    });

    it('should leave pollutionAverage at zero when there are no sources', () => {
      const sim = CitySim.createCity(8, 8);
      tickOneMonth(sim);
      expect(sim.stats.pollutionAverage).toBe(0);
    });
  });

  describe('building emissions', () => {
    it('should radiate pollution from industrial buildings', () => {
      const sim = CitySim.createCity(24, 24);
      sim.growth.buildings.set('12,12', { defId: 'light_workshop', x: 12, y: 12 });
      sim.getTile(12, 12)!.buildingId = 'light_workshop';
      sim.getTile(12, 12)!.zoneType   = ZoneType.Industrial;

      tickOneMonth(sim);

      expect(sim.getTile(12, 12)!.pollution).toBeGreaterThan(0);
      expect(sim.getTile(12, 9)!.pollution).toBeGreaterThan(0);
      expect(sim.getTile(12, 20)!.pollution).toBe(0);
      expect(sim.stats.pollutionAverage).toBeGreaterThan(0);
    });

    it('should penalise land value near a power plant immediately after placement', () => {
      const sim = CitySim.createCity(24, 24);
      sim.stats.money = 100_000;

      tickOneMonth(sim);
      const baselineLandValue = sim.getTile(12, 13)!.landValue;

      sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);

      expect(sim.getTile(12, 12)!.pollution).toBeGreaterThan(0);
      expect(sim.getTile(12, 13)!.landValue).toBeLessThan(baselineLandValue);
      expect(sim.stats.pollutionAverage).toBeGreaterThan(0);
    });
  });

  describe('traffic pollution', () => {
    it('should smog a new street beside a house before the next month', () => {
      const sim = CitySim.createCity(16, 16);
      sim.growth.buildings.set('4,4', { defId: 'small_house', x: 4, y: 4 });
      sim.getTile(4, 4)!.buildingId = 'small_house';
      sim.getTile(4, 4)!.zoneType = ZoneType.Residential;

      sim.placeRoad(4, 5, RoadType.Street);

      expect(sim.getTile(4, 5)!.trafficPressure).toBeGreaterThan(0);
      expect(sim.getTile(4, 5)!.pollution).toBeGreaterThan(0);
      expect(sim.stats.pollutionAverage).toBeGreaterThan(0);
    });

    it('should publish traffic smog in the same month a house appears', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(4, 5, RoadType.Street);
      expect(sim.getTile(4, 5)!.pollution).toBe(0);

      sim.growth.buildings.set('4,4', { defId: 'small_house', x: 4, y: 4 });
      sim.getTile(4, 4)!.buildingId = 'small_house';
      sim.getTile(4, 4)!.zoneType = ZoneType.Residential;

      tickOneMonth(sim);

      expect(sim.getTile(4, 5)!.trafficPressure).toBeGreaterThan(0);
      expect(sim.getTile(4, 5)!.pollution).toBeGreaterThan(0);
    });

    it('should convert traffic pressure into local road pollution', () => {
      const map = new CityMap(8, 8);
      const system = new PollutionSystem();
      const road = map.getTile(4, 4)!;
      road.roadType = RoadType.Street;
      road.trafficPressure = 10;

      const stats = {
        population: 0, jobs: 0, money: 0, residentialDemand: 0, commercialDemand: 0,
        industrialDemand: 0, resTaxRate: 9, comTaxRate: 9, indTaxRate: 9,
        monthlyIncome: 0, monthlyExpenses: 0, serviceExpenses: 0,
        projectedIncome: 0, projectedExpenses: 0, bankruptcyWarning: false,
        happiness: 100, walkability: 0, transitAccess: 0, pollutionAverage: 0, crimeAverage: 0, fireAverage: 0, waterAverage: 0, approval: 100, advisory: '',
      };

      system.tick(map, new Map(), new Map(), stats);

      expect(map.getTile(4, 4)!.pollution).toBeGreaterThan(0);
      expect(map.getTile(4, 5)!.pollution).toBeGreaterThan(0);
      expect(map.getTile(4, 7)!.pollution).toBe(0);
      expect(stats.pollutionAverage).toBeGreaterThan(0);
    });

    it('should average developed tiles including clean lots at pollution 0', () => {
      const sim = CitySim.createCity(8, 8);
      sim.growth.buildings.set('1,1', { defId: 'light_workshop', x: 1, y: 1 });
      sim.getTile(1, 1)!.buildingId = 'light_workshop';
      sim.getTile(1, 1)!.zoneType = ZoneType.Industrial;
      for (let x = 2; x < 8; x++) {
        sim.setZone(x, 1, ZoneType.Residential);
      }
      tickOneMonth(sim);
      const hot = sim.getTile(1, 1)!.pollution;
      expect(hot).toBeGreaterThan(0);
      expect(sim.stats.pollutionAverage).toBeLessThan(hot);
      expect(sim.stats.pollutionAverage).toBeGreaterThan(0);
    });
  });
});
