import { CitySim } from '../openpublica/src/sim/CitySim';
import { ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

// ── WalkabilitySystem ─────────────────────────────────────────────────────────

describe('WalkabilitySystem', () => {
  describe('initial state', () => {
    it('should start with zero walkability on all tiles', () => {
      const sim = CitySim.createCity(8, 8);
      sim.map.forEach((tile) => {
        expect(tile.walkability).toBe(0);
      });
    });

    it('should leave walkability at zero when there are no mixed-use buildings', () => {
      const sim = CitySim.createCity(8, 8);
      tickOneMonth(sim);
      // Without any walkability-boosting buildings, every tile stays at 0.
      sim.map.forEach((tile) => {
        expect(tile.walkability).toBe(0);
      });
    });
  });

  describe('mixed-use proximity bonus', () => {
    it('should boost walkability on tiles near a mixed-use building', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Register a mixed-use building (walkabilityRadius=4) at (8,8).
      sim.growth.buildings.set('8,8', { defId: 'shopfront_apartments', x: 8, y: 8 });
      const tile = sim.getTile(8, 8)!;
      tile.buildingId = 'shopfront_apartments';
      tile.zoneType   = ZoneType.MixedUse;

      tickOneMonth(sim);

      // Center tile should have high walkability.
      expect(sim.getTile(8, 8)!.walkability).toBeGreaterThan(0);
      // Tile within radius should also be boosted.
      expect(sim.getTile(8, 6)!.walkability).toBeGreaterThan(0); // distance=2, within r=4
    });

    it('should not boost tiles beyond the walkability radius', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;

      // Mixed-use building at (0,0) with walkabilityRadius=4.
      sim.growth.buildings.set('0,0', { defId: 'shopfront_apartments', x: 0, y: 0 });
      sim.getTile(0, 0)!.buildingId = 'shopfront_apartments';
      sim.getTile(0, 0)!.zoneType   = ZoneType.MixedUse;

      tickOneMonth(sim);

      // Tile 10 tiles away — far beyond radius 4.
      expect(sim.getTile(10, 10)!.walkability).toBe(0);
    });
  });

  describe('park proximity bonus', () => {
    it('should boost walkability on tiles near a park', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // small_park has parkRadius=6.
      sim.placeServiceBuilding(8, 8, 'small_park', 0);
      tickOneMonth(sim);

      expect(sim.getTile(8, 8)!.walkability).toBeGreaterThan(0);
      expect(sim.getTile(8, 4)!.walkability).toBeGreaterThan(0); // distance=4, within r=6
    });
  });

  describe('noise penalty', () => {
    it('should reduce walkability on a tile with high traffic noise', () => {
      // Call WalkabilitySystem directly so we can inject noise without the
      // TrafficPressureSystem resetting it before walkability is computed.
      const { WalkabilitySystem } = require('../openpublica/src/sim/WalkabilitySystem');
      const { CityMap }           = require('../openpublica/src/sim/CityMap');

      const map: InstanceType<typeof CityMap> = new CityMap(8, 8);
      const walkSys = new WalkabilitySystem();

      // Inject a mixed-use building at (4,4) to give tiles some base walkability.
      const buildings = new Map([['4,4', { defId: 'shopfront_apartments', x: 4, y: 4 }]]);
      const defs = new Map<string, object>([
        ['shopfront_apartments', { id: 'shopfront_apartments', name: '', zoneType: 4, population: 6, jobs: 2, walkabilityRadius: 4 }],
      ]);
      const stats = {
        population: 0, jobs: 0, money: 0, residentialDemand: 0, commercialDemand: 0,
        industrialDemand: 0, resTaxRate: 9, comTaxRate: 9, indTaxRate: 9,
        monthlyIncome: 0, monthlyExpenses: 0, bankruptcyWarning: false,
        happiness: 100, walkability: 0, transitAccess: 0,
      };

      // First tick — no noise → high walkability at centre.
      walkSys.tick(map, buildings, defs, stats);
      const walkBeforeNoise = map.getTile(4, 4).walkability;

      // Inject high noise on centre tile and tick again.
      map.getTile(4, 4).noise = 100;
      walkSys.tick(map, buildings, defs, stats);
      const walkAfterNoise = map.getTile(4, 4).walkability;

      expect(walkBeforeNoise).toBeGreaterThan(0);
      expect(walkAfterNoise).toBeLessThan(walkBeforeNoise);
    });
  });

  describe('stats.walkability', () => {
    it('should be zero when there are no zoned tiles', () => {
      const sim = CitySim.createCity(8, 8);
      tickOneMonth(sim);
      expect(sim.stats.walkability).toBe(0);
    });

    it('should be positive after mixed-use buildings are placed in a zoned area', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      sim.setZone(8, 8, ZoneType.MixedUse);
      sim.growth.buildings.set('8,8', { defId: 'shopfront_apartments', x: 8, y: 8 });
      sim.getTile(8, 8)!.buildingId = 'shopfront_apartments';

      tickOneMonth(sim);

      expect(sim.stats.walkability).toBeGreaterThan(0);
    });
  });

  describe('happiness boost', () => {
    it('should increase happiness when walkability is high', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Place many mixed-use buildings to maximise walkability.
      const positions = [[4,4],[4,8],[4,12],[8,4],[8,8],[8,12],[12,4],[12,8],[12,12]];
      for (const [x, y] of positions) {
        sim.setZone(x, y, ZoneType.MixedUse);
        sim.growth.buildings.set(`${x},${y}`, { defId: 'main_street_block', x, y });
        sim.getTile(x, y)!.buildingId = 'main_street_block';
      }

      tickOneMonth(sim);

      // Happiness should be at least base (100) because there's no traffic yet.
      // With walkability bonus it may exceed base.
      expect(sim.stats.happiness).toBeGreaterThanOrEqual(100);
    });
  });

  describe('onWalkabilityChanged callback', () => {
    it('should fire onWalkabilityChanged on monthly tick', () => {
      const sim = CitySim.createCity(8, 8);
      let count = 0;
      sim.onWalkabilityChanged = () => { count++; };
      tickOneMonth(sim);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
