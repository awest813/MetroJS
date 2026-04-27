import { CitySim, createCity, RoadType, ZoneType } from '../openpublica/src/sim/CitySim';
import { TerrainType } from '../openpublica/src/sim/CityTile';
import { SimulationClock } from '../openpublica/src/sim/SimulationClock';
import { CityMap } from '../openpublica/src/sim/CityMap';

// ── CitySim ───────────────────────────────────────────────────────────────────

describe('CitySim', () => {
  describe('createCity', () => {
    it('should instantiate via the static factory', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim).toBeInstanceOf(CitySim);
    });

    it('should instantiate via the standalone createCity helper', () => {
      const sim = createCity(8, 8);
      expect(sim).toBeInstanceOf(CitySim);
    });

    it('should expose a CityMap with the requested dimensions', () => {
      const sim = CitySim.createCity(20, 30);
      expect(sim.map.width).toBe(20);
      expect(sim.map.height).toBe(30);
    });

    it('should initialise city stats with sensible defaults', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim.stats.population).toBe(0);
      expect(sim.stats.jobs).toBe(0);
      expect(sim.stats.money).toBeGreaterThanOrEqual(0);
      expect(sim.stats.residentialDemand).toBe(0);
      expect(sim.stats.commercialDemand).toBe(0);
      // Industrial starts with a modest positive demand to seed early factory growth.
      expect(sim.stats.industrialDemand).toBe(20);
      expect(sim.stats.happiness).toBe(100);
      expect(sim.stats.walkability).toBe(0);
      expect(sim.stats.transitAccess).toBe(0);
      expect(sim.stats.pollutionAverage).toBe(0);
      expect(sim.stats.resTaxRate).toBe(9);
      expect(sim.stats.comTaxRate).toBe(9);
      expect(sim.stats.indTaxRate).toBe(9);
      expect(sim.stats.bankruptcyWarning).toBe(false);
    });
  });

  describe('getTile', () => {
    it('should return a tile for a valid coordinate', () => {
      const sim = CitySim.createCity(16, 16);
      const tile = sim.getTile(0, 0);
      expect(tile).toBeDefined();
    });

    it('should return the correct tile coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      const tile = sim.getTile(3, 7);
      expect(tile?.x).toBe(3);
      expect(tile?.y).toBe(7);
    });

    it('should return undefined for out-of-bounds coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim.getTile(-1, 0)).toBeUndefined();
      expect(sim.getTile(0, -1)).toBeUndefined();
      expect(sim.getTile(16, 0)).toBeUndefined();
      expect(sim.getTile(0, 16)).toBeUndefined();
    });

    it('should return a tile with default Grass terrain', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim.getTile(5, 5)?.terrain).toBe(TerrainType.Grass);
    });
  });

  describe('setZone', () => {
    it('should assign a zone type to the tile', () => {
      const sim = CitySim.createCity(16, 16);
      sim.setZone(4, 4, ZoneType.Residential);
      expect(sim.getTile(4, 4)?.zoneType).toBe(ZoneType.Residential);
    });

    it('should update the zone on subsequent calls', () => {
      const sim = CitySim.createCity(16, 16);
      sim.setZone(4, 4, ZoneType.Residential);
      sim.setZone(4, 4, ZoneType.Commercial);
      expect(sim.getTile(4, 4)?.zoneType).toBe(ZoneType.Commercial);
    });

    it('should be a no-op for out-of-bounds coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      expect(() => sim.setZone(99, 99, ZoneType.Industrial)).not.toThrow();
    });
  });

  describe('placeRoad', () => {
    it('should assign a road type to the tile', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(2, 2, RoadType.Street);
      expect(sim.getTile(2, 2)?.roadType).toBe(RoadType.Street);
    });

    it('should update the road type on subsequent calls', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(2, 2, RoadType.Street);
      sim.placeRoad(2, 2, RoadType.Highway);
      expect(sim.getTile(2, 2)?.roadType).toBe(RoadType.Highway);
    });

    it('should be a no-op for out-of-bounds coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      expect(() => sim.placeRoad(99, 99, RoadType.Street)).not.toThrow();
    });
  });

  describe('bulldoze', () => {
    it('should clear the road type', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(1, 1, RoadType.Street);
      sim.bulldoze(1, 1);
      expect(sim.getTile(1, 1)?.roadType).toBe(RoadType.None);
    });

    it('should clear the zone type', () => {
      const sim = CitySim.createCity(16, 16);
      sim.setZone(1, 1, ZoneType.Residential);
      sim.bulldoze(1, 1);
      expect(sim.getTile(1, 1)?.zoneType).toBe(ZoneType.None);
    });

    it('should clear the buildingId', () => {
      const sim = CitySim.createCity(16, 16);
      const tile = sim.getTile(1, 1)!;
      tile.buildingId = 'house-001';
      sim.bulldoze(1, 1);
      expect(sim.getTile(1, 1)?.buildingId).toBeNull();
    });

    it('should be a no-op for out-of-bounds coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      expect(() => sim.bulldoze(99, 99)).not.toThrow();
    });
  });

  describe('tick', () => {
    it('should advance the clock by the given delta', () => {
      const sim = CitySim.createCity(16, 16);
      sim.tick(1.5);
      expect(sim.clock.totalSeconds).toBeCloseTo(1.5);
    });

    it('should increment the tick counter', () => {
      const sim = CitySim.createCity(16, 16);
      sim.tick(1);
      sim.tick(1);
      expect(sim.clock.ticks).toBe(2);
    });

    it('should accumulate elapsed time over multiple ticks', () => {
      const sim = CitySim.createCity(16, 16);
      sim.tick(0.5);
      sim.tick(0.5);
      sim.tick(1.0);
      expect(sim.clock.totalSeconds).toBeCloseTo(2.0);
    });
  });
});

// ── SimulationClock ───────────────────────────────────────────────────────────

describe('SimulationClock', () => {
  it('should start at zero', () => {
    const clock = new SimulationClock();
    expect(clock.totalSeconds).toBe(0);
    expect(clock.ticks).toBe(0);
  });

  it('should accumulate seconds', () => {
    const clock = new SimulationClock();
    clock.tick(3);
    clock.tick(2);
    expect(clock.totalSeconds).toBeCloseTo(5);
  });

  it('should count ticks', () => {
    const clock = new SimulationClock();
    clock.tick(1);
    clock.tick(1);
    clock.tick(1);
    expect(clock.ticks).toBe(3);
  });
});

// ── CityMap ───────────────────────────────────────────────────────────────────

describe('CityMap', () => {
  it('should expose the requested dimensions', () => {
    const map = new CityMap(10, 20);
    expect(map.width).toBe(10);
    expect(map.height).toBe(20);
  });

  it('should contain width × height tiles', () => {
    const map = new CityMap(5, 5);
    let count = 0;
    map.forEach(() => count++);
    expect(count).toBe(25);
  });

  it('should return undefined for negative coordinates', () => {
    const map = new CityMap(8, 8);
    expect(map.getTile(-1, 0)).toBeUndefined();
    expect(map.getTile(0, -1)).toBeUndefined();
  });

  it('should return undefined for coordinates at or beyond the boundary', () => {
    const map = new CityMap(8, 8);
    expect(map.getTile(8, 0)).toBeUndefined();
    expect(map.getTile(0, 8)).toBeUndefined();
  });
});
