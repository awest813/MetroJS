import { CitySim, createCity, RoadType, ZoneType } from '../openpublica/src/sim/CitySim';
import { TerrainType } from '../openpublica/src/sim/CityTile';
import { SimulationClock } from '../openpublica/src/sim/SimulationClock';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { BASE_LAND_VALUE } from '../openpublica/src/sim/LandValueSystem';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { testCityById } from '../openpublica/src/scenarios/testCities';

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
      expect(sim.stats.residentialDemand).toBe(40);
      expect(sim.stats.commercialDemand).toBe(0);
      // Industrial starts with a modest positive demand to seed early factory growth.
      expect(sim.stats.industrialDemand).toBe(20);
      expect(sim.stats.happiness).toBe(100);
      expect(sim.stats.walkability).toBe(0);
      expect(sim.stats.transitAccess).toBe(0);
      expect(sim.stats.pollutionAverage).toBe(0);
      expect(sim.stats.crimeAverage).toBe(0);
      expect(sim.stats.fireAverage).toBe(0);
      expect(sim.stats.waterAverage).toBe(0);
      expect(sim.stats.approval).toBe(50);
      expect(sim.stats.advisory).toMatch(/power plant/i);
      expect(sim.stats.resTaxRate).toBe(9);
      expect(sim.stats.comTaxRate).toBe(9);
      expect(sim.stats.indTaxRate).toBe(9);
      expect(sim.stats.bankruptcyWarning).toBe(false);
    });

    it('should start land value at the LandValueSystem baseline', () => {
      const sim = CitySim.createCity(8, 8);
      expect(sim.getTile(0, 0)?.landValue).toBe(BASE_LAND_VALUE);
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

    it('should not zone a road tile at the sim layer', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(4, 4, RoadType.Street);
      sim.setZone(4, 4, ZoneType.Residential);
      expect(sim.getTile(4, 4)?.zoneType).toBe(ZoneType.None);
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

    it('should clear zoning when a road is paved over an empty lot', () => {
      const sim = CitySim.createCity(16, 16);
      sim.setZone(2, 2, ZoneType.Residential);
      sim.placeRoad(2, 2, RoadType.Street);
      expect(sim.getTile(2, 2)?.roadType).toBe(RoadType.Street);
      expect(sim.getTile(2, 2)?.zoneType).toBe(ZoneType.None);
    });

    it('should update the road type on subsequent calls', () => {
      const sim = CitySim.createCity(16, 16);
      sim.placeRoad(2, 2, RoadType.Street);
      sim.placeRoad(2, 2, RoadType.Highway);
      expect(sim.getTile(2, 2)?.roadType).toBe(RoadType.Highway);
    });

    it('should not pave over a building', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim.placeServiceBuilding(2, 2, 'small_park', 0)).toBe(true);
      sim.placeRoad(2, 2, RoadType.Street);
      expect(sim.getTile(2, 2)?.roadType).toBe(RoadType.None);
      expect(sim.getTile(2, 2)?.buildingId).toBe('small_park');
    });

    it('should be a no-op for out-of-bounds coordinates', () => {
      const sim = CitySim.createCity(16, 16);
      expect(() => sim.placeRoad(99, 99, RoadType.Street)).not.toThrow();
    });

    it('should put traffic pressure on a new street beside a house immediately', () => {
      const sim = CitySim.createCity(16, 16);
      sim.growth.buildings.set('4,4', { defId: 'small_house', x: 4, y: 4 });
      sim.getTile(4, 4)!.buildingId = 'small_house';
      sim.getTile(4, 4)!.zoneType = ZoneType.Residential;
      sim.placeRoad(4, 5, RoadType.Street);
      expect(sim.getTile(4, 5)?.roadType).toBe(RoadType.Street);
      expect(sim.getTile(4, 5)!.trafficPressure).toBeGreaterThan(0);
      expect(sim.getTile(4, 5)!.noise).toBeGreaterThan(0);
    });

    it('should fire onTrafficChanged when a road is paved', () => {
      const sim = CitySim.createCity(8, 8);
      let fires = 0;
      sim.onTrafficChanged = () => { fires += 1; };
      sim.placeRoad(2, 2, RoadType.Street);
      expect(fires).toBe(1);
    });

    it('should drop traffic pressure after the nearby house is bulldozed', () => {
      const sim = CitySim.createCity(16, 16);
      sim.growth.buildings.set('4,4', { defId: 'small_house', x: 4, y: 4 });
      sim.getTile(4, 4)!.buildingId = 'small_house';
      sim.getTile(4, 4)!.zoneType = ZoneType.Residential;
      sim.placeRoad(4, 5, RoadType.Street);
      expect(sim.getTile(4, 5)!.trafficPressure).toBeGreaterThan(0);
      sim.bulldoze(4, 4);
      expect(sim.getTile(4, 5)?.roadType).toBe(RoadType.Street);
      expect(sim.getTile(4, 5)!.trafficPressure).toBe(0);
    });
  });

  describe('placeServiceBuilding', () => {
    it('should clear zoning so civic buildings are not hybrid lots', () => {
      const sim = CitySim.createCity(16, 16);
      sim.setZone(3, 3, ZoneType.Residential);
      expect(sim.placeServiceBuilding(3, 3, 'small_park', 0)).toBe(true);
      expect(sim.getTile(3, 3)?.buildingId).toBe('small_park');
      expect(sim.getTile(3, 3)?.zoneType).toBe(ZoneType.None);
    });

    it('should reject an unknown building def', () => {
      const sim = CitySim.createCity(16, 16);
      expect(sim.placeServiceBuilding(1, 1, 'not_a_building', 0)).toBe(false);
      expect(sim.getTile(1, 1)?.buildingId).toBeNull();
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

    it('should not treat civic staffing as private jobs', () => {
      const sim = CitySim.createCity(16, 16);
      sim.stats.money = 100_000;
      sim.placeServiceBuilding(4, 4, 'small_power_plant', 0);
      sim.placeServiceBuilding(6, 4, 'small_police_station', 0);
      sim.tick(MONTH_SECONDS);
      expect(sim.stats.jobs).toBe(0);
    });

    it('should catch up multiple due months in one tick', () => {
      const sim = CitySim.createCity(8, 8);
      sim.pinWeather('clear');
      sim.placeRoad(0, 0, RoadType.Street);
      sim.placeRoad(1, 0, RoadType.Street);
      sim.placeRoad(2, 0, RoadType.Street);
      sim.placeRoad(3, 0, RoadType.Street);
      const start = sim.stats.money;
      sim.tick(MONTH_SECONDS * 2);
      // 4 streets × $3 × 2 months
      expect(sim.stats.money).toBe(start - 24);
      expect(sim.stats.monthlyExpenses).toBe(12);
      expect(sim.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 2);
    });

    it('should not advance the calendar past months that have not run yet', () => {
      const sim = CitySim.createCity(8, 8);
      sim.pinWeather('clear');
      sim.placeRoad(0, 0, RoadType.Street);
      const start = sim.stats.money;
      sim.tick(MONTH_SECONDS * 10);
      // 1 street × $3 × 6 catch-up months
      expect(sim.stats.money).toBe(start - 18);
      expect(sim.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 6);
      expect(sim.growth.monthAccumulator).toBeCloseTo(MONTH_SECONDS * 4);

      sim.tick(0);
      expect(sim.stats.money).toBe(start - 30);
      expect(sim.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 10);
      expect(sim.growth.monthAccumulator).toBeCloseTo(0);
    });

    it('should fire onMonth after a monthly pass', () => {
      const sim = CitySim.createCity(8, 8);
      let months = 0;
      sim.onMonth = () => { months += 1; };
      sim.tick(MONTH_SECONDS);
      expect(months).toBe(1);
    });

    it('should publish the traffic routed on the layout the month ended with', () => {
      // A month end reuses the traffic its last step routed instead of routing
      // it again; a fresh recompute must find nothing to change.
      const { sim } = testCityById('hamlet')!.build();
      sim.tick(MONTH_SECONDS);
      const layers = (): number[] => {
        const out: number[] = [];
        sim.map.forEach((t) => out.push(t.trafficPressure, t.noise, t.walkability, t.transitAccess));
        return out;
      };
      const published = layers();
      const flow = Array.from(sim.traffic.commutes!.flow);
      const stats = [sim.stats.walkability, sim.stats.transitAccess];
      expect(published.some((v) => v > 0)).toBe(true);

      sim.refreshDerivedState({ notify: false });
      expect(layers()).toEqual(published);
      expect(Array.from(sim.traffic.commutes!.flow)).toEqual(flow);
      expect([sim.stats.walkability, sim.stats.transitAccess]).toEqual(stats);
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
