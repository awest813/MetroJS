import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSim(size = 16, money = 100_000): CitySim {
  const sim = CitySim.createCity(size, size);
  sim.stats.money = money;
  return sim;
}

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

// ── PowerSystem ───────────────────────────────────────────────────────────────

describe('PowerSystem', () => {
  describe('coverage radius', () => {
    it('should mark tiles powered within the plant radius', () => {
      const sim = makeSim();
      // small_power_plant has powerRadius=8 — place it at (8,8).
      sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);

      // The plant tile itself and tiles within radius 8 should be powered.
      expect(sim.getTile(8, 8)?.powered).toBe(true);
      expect(sim.getTile(8, 0)?.powered).toBe(true);  // distance = 8 (boundary)
      expect(sim.getTile(0, 8)?.powered).toBe(true);  // distance = 8 (boundary)
    });

    it('should leave tiles outside the radius unpowered', () => {
      const sim = makeSim();
      // Place plant at (0,0) with radius 8. Tile (9,9) is at distance ~12.7.
      sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);

      expect(sim.getTile(15, 15)?.powered).toBe(false);
    });

    it('should start with all tiles unpowered before any plant is placed', () => {
      const sim = makeSim();
      let anyPowered = false;
      sim.map.forEach((tile) => { if (tile.powered) anyPowered = true; });
      expect(anyPowered).toBe(false);
    });
  });

  describe('monthly recalculation', () => {
    it('should recalculate power after a monthly tick', () => {
      const sim = makeSim();
      sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);

      // Power was set immediately on placement.
      expect(sim.getTile(8, 8)?.powered).toBe(true);

      // After bulldozing the plant and running a monthly tick, power should clear.
      sim.bulldoze(8, 8);
      tickOneMonth(sim);

      expect(sim.getTile(8, 8)?.powered).toBe(false);
    });
  });

  describe('onPowerChanged callback', () => {
    it('should fire onPowerChanged when a power plant is placed', () => {
      const sim = makeSim();
      let fired = false;
      sim.onPowerChanged = () => { fired = true; };

      sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);

      expect(fired).toBe(true);
    });

    it('should fire onPowerChanged on a monthly tick', () => {
      const sim = makeSim();
      let count = 0;
      sim.onPowerChanged = () => { count++; };

      tickOneMonth(sim);

      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('multiple plants', () => {
    it('should stack coverage from two power plants', () => {
      const sim = CitySim.createCity(32, 32);
      sim.stats.money = 100_000;
      // Plant at (0,0) covers tiles up to (8,0).
      // Plant at (16,16) covers tiles near center.
      sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
      sim.placeServiceBuilding(16, 16, 'small_power_plant', 0);

      // Tile (16,16) should be covered by the second plant.
      expect(sim.getTile(16, 16)?.powered).toBe(true);
      // Tile (0,0) should still be covered by the first plant.
      expect(sim.getTile(0, 0)?.powered).toBe(true);
    });
  });
});

// ── PowerSystem interaction with ZoneGrowth ────────────────────────────────

describe('PowerSystem and zone growth', () => {
  it('unpowered buildings should contribute less population', () => {
    // After one month, buildings that grew without power should be penalised.
    // This is hard to isolate without mocking Math.random, so we verify
    // the power flag state correctly flows through the stats.
    const sim = CitySim.createCity(10, 10);
    sim.stats.money = 100_000;

    // Zone and road — buildings can grow but nothing is powered.
    sim.placeRoad(5, 5, RoadType.Street);
    sim.setZone(5, 4, ZoneType.Residential);

    // Manually register a building at the zoned tile to bypass random growth.
    sim.growth.buildings.set('5,4', { defId: 'small_house', x: 5, y: 4 });
    const tile = sim.getTile(5, 4)!;
    tile.buildingId = 'small_house';

    // No power plant — tile should be unpowered.
    tickOneMonth(sim);

    expect(tile.powered).toBe(false);
    // Population should be floor(4 × 0.75) = 3 (unpowered factor).
    expect(sim.stats.population).toBe(3);
  });

  it('powered buildings should contribute full population', () => {
    const sim = CitySim.createCity(10, 10);
    sim.stats.money = 100_000;

    // Place power plant first.
    sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);

    // Register a residential building.
    sim.growth.buildings.set('5,4', { defId: 'small_house', x: 5, y: 4 });
    const tile = sim.getTile(5, 4)!;
    tile.buildingId = 'small_house';

    tickOneMonth(sim);

    expect(tile.powered).toBe(true);
    // Population should be full 4 (powered).
    expect(sim.stats.population).toBe(4);
  });
});
