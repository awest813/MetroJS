import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

// ── LandValueSystem ───────────────────────────────────────────────────────────

describe('LandValueSystem', () => {
  describe('baseline', () => {
    it('should set all tiles to a non-zero baseline after the first monthly tick', () => {
      const sim = CitySim.createCity(8, 8);
      tickOneMonth(sim);
      sim.map.forEach((tile) => {
        expect(tile.landValue).toBeGreaterThan(0);
      });
    });

    it('should clamp land value to [0, 100]', () => {
      const sim = CitySim.createCity(8, 8);
      // Place many parks to drive land value toward the cap.
      sim.stats.money = 1_000_000;
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          sim.placeServiceBuilding(x, y, 'small_park', 0);
        }
      }
      tickOneMonth(sim);
      sim.map.forEach((tile) => {
        expect(tile.landValue).toBeGreaterThanOrEqual(0);
        expect(tile.landValue).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('park bonus', () => {
    it('should increase land value on tiles near a park', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Tick once to establish baseline land values.
      tickOneMonth(sim);
      const baselineLv = sim.getTile(8, 8)!.landValue;

      // Place a park at (8,8).  parkRadius=6 means tiles within 6 get a bonus.
      sim.placeServiceBuilding(8, 8, 'small_park', 0);
      tickOneMonth(sim);

      // The park itself and nearby tiles should have higher LV than baseline.
      expect(sim.getTile(8, 8)!.landValue).toBeGreaterThan(baselineLv);
      expect(sim.getTile(8, 7)!.landValue).toBeGreaterThan(baselineLv);
    });

    it('should not boost tiles beyond the park radius', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;

      tickOneMonth(sim);
      const farTileBaseline = sim.getTile(31, 31)!.landValue;

      // Park at (0,0) with radius 6 — tile (31,31) is far away.
      sim.placeServiceBuilding(0, 0, 'small_park', 0);
      tickOneMonth(sim);

      // Tile very far from the park should not receive a bonus.
      expect(sim.getTile(31, 31)!.landValue).toBe(farTileBaseline);
    });
  });

  describe('road adjacency bonus', () => {
    it('should give road-adjacent tiles a higher land value than isolated tiles', () => {
      const sim = CitySim.createCity(8, 8);

      // Place a road in the middle.
      sim.placeRoad(4, 4, RoadType.Street);
      tickOneMonth(sim);

      // Tile adjacent to road vs. corner tile.
      const adjacentLv = sim.getTile(4, 3)!.landValue;
      const isolatedLv = sim.getTile(0, 0)!.landValue;

      expect(adjacentLv).toBeGreaterThan(isolatedLv);
    });
  });

  describe('industrial penalty', () => {
    it('should reduce land value near an industrial building', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;

      tickOneMonth(sim);
      const nearTileBaseline = sim.getTile(16, 14)!.landValue;

      // Register an industrial building at (16,16).
      sim.growth.buildings.set('16,16', { defId: 'light_workshop', x: 16, y: 16 });
      const tile = sim.getTile(16, 16)!;
      tile.buildingId = 'light_workshop';
      tile.zoneType   = ZoneType.Industrial;

      tickOneMonth(sim);

      // Tile 2 tiles away from the industrial building should be penalised.
      expect(sim.getTile(16, 14)!.landValue).toBeLessThan(nearTileBaseline);
    });
  });

  describe('onLandValueChanged callback', () => {
    it('should fire onLandValueChanged on monthly tick', () => {
      const sim = CitySim.createCity(8, 8);
      let count = 0;
      sim.onLandValueChanged = () => { count++; };

      tickOneMonth(sim);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should fire onLandValueChanged immediately when a park is placed', () => {
      const sim = CitySim.createCity(8, 8);
      sim.stats.money = 100_000;
      let count = 0;
      sim.onLandValueChanged = () => { count++; };

      sim.placeServiceBuilding(4, 4, 'small_park', 0);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
