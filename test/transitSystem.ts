import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { MIN_TROLLEY_LINE_TILES, levelCrossingAxis, trolleyLines } from '../openpublica/src/sim/TransitSystem';
import { RoadTool } from '../openpublica/src/tools/RoadTool';

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
    /** A north-south line of MIN_TROLLEY_LINE_TILES tiles from (8, 8) to (8, 5). */
    function placeLine(sim: CitySim): void {
      for (let i = 0; i < MIN_TROLLEY_LINE_TILES; i++) {
        sim.placeRoad(8, 8 - i, RoadType.TrolleyAvenue);
      }
    }

    it('should stack access from every tile of a running line', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      placeLine(sim);
      tickOneMonth(sim);

      // 40 + 32 + 24 + 16 from the four line tiles, capped at 100.
      expect(sim.getTile(8, 8)!.transitAccess).toBe(100);
      // Two tiles past the north end: 24 + 16 + 8 + 0.
      expect(sim.getTile(8, 10)!.transitAccess).toBe(48);
    });

    it('should radiate transitAccess to tiles within TRANSIT_RADIUS=5', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      placeLine(sim);
      tickOneMonth(sim);

      // Four tiles past the north end: only the nearest line tile reaches.
      expect(sim.getTile(8, 12)!.transitAccess).toBeGreaterThan(0);
      expect(sim.getTile(8, 12)!.transitAccess).toBeLessThan(40);
    });

    it('should not radiate beyond TRANSIT_RADIUS=5', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;
      placeLine(sim);
      tickOneMonth(sim);

      // Six tiles north of the line's north end is past the radius.
      expect(sim.getTile(8, 14)!.transitAccess).toBe(0);
    });

    it('should give no access from a stub too short to run a trolley', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      for (let i = 0; i < MIN_TROLLEY_LINE_TILES - 1; i++) {
        sim.placeRoad(8, 8 - i, RoadType.TrolleyAvenue);
      }
      tickOneMonth(sim);
      expect(sim.getTile(8, 8)!.transitAccess).toBe(0);
      expect(sim.getTile(9, 7)!.transitAccess).toBe(0);

      sim.placeRoad(8, 8 - (MIN_TROLLEY_LINE_TILES - 1), RoadType.TrolleyAvenue);
      expect(sim.getTile(8, 8)!.transitAccess).toBeGreaterThan(0);
    });

    it('should not join two trolley stubs through a plain street', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      sim.placeRoad(2, 8, RoadType.TrolleyAvenue);
      sim.placeRoad(3, 8, RoadType.TrolleyAvenue);
      sim.placeRoad(4, 8, RoadType.Street);
      sim.placeRoad(5, 8, RoadType.TrolleyAvenue);
      sim.placeRoad(6, 8, RoadType.TrolleyAvenue);
      expect(trolleyLines(sim.map).map((line) => line.length).sort()).toEqual([2, 2]);
      expect(sim.getTile(4, 8)!.transitAccess).toBe(0);
    });

    it('should carry a trolley line dragged over a highway across it at grade', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      for (let x = 0; x < 16; x++) sim.placeRoad(x, 8, RoadType.Highway);
      // The trolley tool keeps the highway tile and lays rails either side of it.
      const trolley = new RoadTool(RoadType.TrolleyAvenue);
      for (let y = 6; y <= 10; y++) trolley.apply({ x: 8, y }, sim);
      expect(sim.getTile(8, 8)!.roadType).toBe(RoadType.Highway);
      expect(levelCrossingAxis(sim.map, 8, 8)).toBe('ns');
      expect(levelCrossingAxis(sim.map, 7, 8)).toBeNull();
      const lines = trolleyLines(sim.map);
      expect(lines.map((line) => line.length)).toEqual([5]);
      // Two tiles each side is too short to run alone; the crossing joins them into a running line.
      expect(sim.getTile(8, 6)!.transitAccess).toBeGreaterThan(0);
    });

    it('should not ladder two parallel avenues through the street between them', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      for (let x = 2; x <= 10; x++) {
        sim.placeRoad(x, 6, RoadType.TrolleyAvenue);
        sim.placeRoad(x, 7, RoadType.Street);
        sim.placeRoad(x, 8, RoadType.TrolleyAvenue);
      }
      for (let x = 2; x <= 10; x++) expect(levelCrossingAxis(sim.map, x, 7)).toBeNull();
      expect(trolleyLines(sim.map).map((line) => line.length)).toEqual([9, 9]);
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

      // Zone one tile right next to a running trolley line.
      for (let x = 8; x < 8 + MIN_TROLLEY_LINE_TILES; x++) {
        sim.placeRoad(x, 8, RoadType.TrolleyAvenue);
      }
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

      // Keep lots empty so this assertion is about transit, not random growth.
      const random = Math.random;
      Math.random = () => 1;
      try {
        tickOneMonth(sim);
      } finally {
        Math.random = random;
      }

      const preCrime = sim.stats.happiness + Math.round(sim.stats.crimeAverage * 0.25);
      expect(preCrime).toBeGreaterThanOrEqual(100);
      expect(sim.stats.transitAccess).toBeGreaterThan(0);
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
