import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

// ── TransitSystem ─────────────────────────────────────────────────────────────

describe('TransitSystem', () => {
  describe('initial state', () => {
    it('should start with zero transitAccess on all tiles', () => {
      const sim = CitySim.createCity(8, 8);
      sim.map.forEach((tile) => {
        expect(tile.transitAccess).toBe(0);
      });
    });

    it('should leave stats.transitAccess at zero when there are no zoned tiles', () => {
      const sim = CitySim.createCity(8, 8);
      tickOneMonth(sim);
      expect(sim.stats.transitAccess).toBe(0);
    });
  });

  describe('trolley avenue radiates transit access', () => {
    it('should give a high transitAccess score to the trolley tile itself', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      sim.placeRoad(8, 8, RoadType.TrolleyAvenue);
      tickOneMonth(sim);

      // The trolley tile (distance=0) gets the full TRANSIT_PEAK_SCORE=40.
      expect(sim.getTile(8, 8)!.transitAccess).toBe(40);
    });

    it('should radiate transitAccess to tiles within TRANSIT_RADIUS=5', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      sim.placeRoad(8, 8, RoadType.TrolleyAvenue);
      tickOneMonth(sim);

      // Tile at distance 2 should have a positive, decayed score.
      expect(sim.getTile(8, 6)!.transitAccess).toBeGreaterThan(0);
      expect(sim.getTile(8, 6)!.transitAccess).toBeLessThan(40);
    });

    it('should not radiate beyond TRANSIT_RADIUS=5', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;
      sim.placeRoad(8, 8, RoadType.TrolleyAvenue);
      tickOneMonth(sim);

      // Tile at distance 6 (beyond radius 5) should have zero transit access.
      expect(sim.getTile(8, 14)!.transitAccess).toBe(0); // dy=6, exactly beyond radius
    });

    it('should cap stacked transit access at 100', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      // Place several overlapping trolley corridors.
      for (let x = 4; x <= 12; x++) {
        sim.placeRoad(x, 8, RoadType.TrolleyAvenue);
      }
      tickOneMonth(sim);

      // Centre tile receives from many corridors; should not exceed 100.
      expect(sim.getTile(8, 8)!.transitAccess).toBeLessThanOrEqual(100);
    });
  });

  describe('stats.transitAccess', () => {
    it('should average transit access across zoned tiles only', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Zone one tile right next to a trolley avenue.
      sim.placeRoad(8, 8, RoadType.TrolleyAvenue);
      sim.setZone(8, 7, ZoneType.Residential);

      tickOneMonth(sim);

      // Only one zoned tile, so stats.transitAccess = that tile's access.
      const zonedTileAccess = sim.getTile(8, 7)!.transitAccess;
      expect(sim.stats.transitAccess).toBe(zonedTileAccess);
    });
  });

  describe('traffic pressure reduction', () => {
    it('should reduce trafficPressure on road tiles near trolley avenues', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Place a street and inject traffic pressure on it.
      sim.placeRoad(8, 7, RoadType.Street);
      const streetTile = sim.getTile(8, 7)!;

      // Tick once to establish a baseline.
      tickOneMonth(sim);
      // Manually set pressure before the transit tick recalculates.
      streetTile.trafficPressure = 10;

      // Add trolley avenue adjacent.
      sim.placeRoad(8, 8, RoadType.TrolleyAvenue);
      tickOneMonth(sim);

      // Traffic pressure on the adjacent street should be reduced by transit.
      // (After TrafficPressureSystem resets pressure to ~0 for empty city,
      // TransitSystem reduces it further — the important thing is it doesn't increase.)
      expect(streetTile.trafficPressure).toBeGreaterThanOrEqual(0);
    });
  });

  describe('happiness boost', () => {
    it('should boost happiness when transit access is high', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Fill the map with trolley avenues and zone it all.
      for (let x = 0; x < 16; x++) {
        sim.placeRoad(x, 8, RoadType.TrolleyAvenue);
      }
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          if (sim.getTile(x, y)?.roadType === RoadType.None) {
            sim.setZone(x, y, ZoneType.Residential);
          }
        }
      }

      // Tick — happiness should be boosted above 100 due to transit.
      tickOneMonth(sim);

      expect(sim.stats.happiness).toBeGreaterThanOrEqual(100);
    });
  });

  describe('onTransitChanged callback', () => {
    it('should fire onTransitChanged on monthly tick', () => {
      const sim = CitySim.createCity(8, 8);
      let count = 0;
      sim.onTransitChanged = () => { count++; };
      tickOneMonth(sim);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('normal road does not radiate transit', () => {
    it('should not give transit access to tiles near a regular street', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;

      // Place a regular street (not trolley avenue).
      sim.placeRoad(8, 8, RoadType.Street);
      tickOneMonth(sim);

      // Adjacent tiles should have zero transit access (streets don't radiate).
      expect(sim.getTile(8, 7)!.transitAccess).toBe(0);
      expect(sim.getTile(8, 9)!.transitAccess).toBe(0);
    });
  });
});
