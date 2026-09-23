import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { GRID_SERVED, GRID_SHORT, distributeAlongStreets } from '../openpublica/src/sim/utilityGrid';

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
  describe('street grid', () => {
    it('should power lots along every street joined to a plant', () => {
      const sim = makeSim();
      for (let x = 0; x < 16; x++) sim.placeRoad(x, 8, RoadType.Street);
      sim.setZone(15, 9, ZoneType.Residential);
      sim.setZone(3, 3, ZoneType.Residential);
      sim.placeServiceBuilding(0, 9, 'small_power_plant', 0);

      expect(sim.getTile(0, 9)?.powered).toBe(true);    // the plant
      expect(sim.getTile(15, 8)?.powered).toBe(true);   // the line runs to the end of the street
      expect(sim.getTile(15, 9)?.powered).toBe(true);   // 15 tiles away, but on the street
      expect(sim.getTile(3, 3)?.powered).toBe(false);   // near, but no street reaches it
    });

    it('should leave a street the plant does not touch dark', () => {
      const sim = makeSim();
      for (let x = 0; x < 16; x++) sim.placeRoad(x, 4, RoadType.Street);
      for (let x = 0; x < 16; x++) sim.placeRoad(x, 10, RoadType.Street);
      sim.setZone(8, 11, ZoneType.Residential);
      sim.placeServiceBuilding(8, 5, 'small_power_plant', 0);
      expect(sim.getTile(8, 4)?.powered).toBe(true);
      expect(sim.getTile(8, 10)?.powered).toBe(false);
      expect(sim.getTile(8, 11)?.powered).toBe(false);
      // Joining the streets joins the grid.
      for (let y = 5; y < 10; y++) sim.placeRoad(0, y, RoadType.Street);
      expect(sim.getTile(8, 11)?.powered).toBe(true);
    });

    it('should cut power at once when the plant is bulldozed', () => {
      const sim = makeSim();
      for (let x = 0; x < 16; x++) sim.placeRoad(x, 8, RoadType.Street);
      sim.setZone(12, 9, ZoneType.Residential);
      sim.placeServiceBuilding(2, 9, 'small_power_plant', 0);
      expect(sim.getTile(12, 9)?.powered).toBe(true);
      sim.bulldoze(2, 9);
      expect(sim.getTile(12, 9)?.powered).toBe(false);
      expect(sim.getTile(2, 8)?.powered).toBe(false);
    });

    it('should start with all tiles unpowered before any plant is placed', () => {
      const sim = makeSim();
      let anyPowered = false;
      sim.map.forEach((tile) => { if (tile.powered) anyPowered = true; });
      expect(anyPowered).toBe(false);
    });
  });

  describe('capacity', () => {
    it('should serve the nearest lots first and leave the far end dark', () => {
      const map = new CityMap(12, 3);
      for (let x = 0; x < 12; x++) map.getTile(x, 1)!.roadType = RoadType.Street;
      for (let x = 1; x < 12; x++) map.getTile(x, 0)!.zoneType = ZoneType.Residential;
      const grid = distributeAlongStreets(map, [{ x: 0, y: 0, capacity: 12 }], (t) => (t.zoneType !== ZoneType.None ? 4 : null));
      const served = (x: number) => grid.state[x] === GRID_SERVED;
      expect([1, 2, 3].every(served)).toBe(true);
      expect(grid.state[4]).toBe(GRID_SHORT);
      expect(grid.networks[0]).toMatchObject({ supply: 12, load: 12, served: 3 });
      expect(grid.networks[0].shortfall).toBe(8);
    });

    it('should pool plants on one network and keep separate networks apart', () => {
      const map = new CityMap(12, 3);
      for (let x = 0; x < 5; x++) map.getTile(x, 1)!.roadType = RoadType.Street;
      for (let x = 7; x < 12; x++) map.getTile(x, 1)!.roadType = RoadType.Street;
      const sources = [
        { x: 0, y: 0, capacity: 10 },
        { x: 4, y: 0, capacity: 10 },
        { x: 11, y: 0, capacity: 5 },
      ];
      const grid = distributeAlongStreets(map, sources, () => null);
      expect(grid.networks.map((n) => n.supply)).toEqual([20, 5]);
      expect(grid.networkOf[1 * 12 + 2]).toBe(grid.networkOf[0]);
      expect(grid.networkOf[1 * 12 + 9]).not.toBe(grid.networkOf[0]);
    });

    it('should report load and supply, and buildings a full grid cannot serve', () => {
      const sim = CitySim.createCity(64, 4);
      sim.stats.money = 1_000_000;
      sim.batch(() => {
        for (let x = 0; x < 64; x++) sim.placeRoad(x, 1, RoadType.Street);
      });
      for (let x = 1; x < 64; x++) {
        for (const y of [0, 2]) {
          sim.growth.buildings.set(`${x},${y}`, { defId: 'rowhouse', x, y });
          sim.getTile(x, y)!.zoneType = ZoneType.Residential;
          sim.getTile(x, y)!.buildingId = 'rowhouse';
        }
      }
      sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
      // 126 rowhouses at 8 load each want 1,008; the plant carries 400.
      expect(sim.stats.powerSupply).toBe(400);
      expect(sim.stats.powerLoad).toBe(400);
      expect(sim.stats.powerShort).toBe(126 - 50);
      expect(sim.getTile(1, 0)!.powered).toBe(true);
      expect(sim.getTile(63, 2)!.powered).toBe(false);
      expect(sim.stats.advisory).toMatch(/at capacity \(400\/400\)/);
    });
  });

  describe('monthly recalculation', () => {
    it('should recalculate power after a monthly tick', () => {
      const sim = makeSim();
      sim.placeServiceBuilding(8, 8, 'small_power_plant', 0);

      // Power was set immediately on placement.
      expect(sim.getTile(8, 8)?.powered).toBe(true);

      // After bulldozing the plant, coverage must drop immediately — not next month.
      sim.bulldoze(8, 8);

      expect(sim.getTile(8, 8)?.powered).toBe(false);
      expect(sim.getTile(8, 0)?.powered).toBe(false);
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

    it('should fire onPowerChanged when a plant is bulldozed', () => {
      const sim = makeSim();
      sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);
      let count = 0;
      sim.onPowerChanged = () => { count++; };
      sim.bulldoze(5, 5);
      expect(count).toBe(1);
      expect(sim.getTile(5, 5)?.powered).toBe(false);
    });

    it('should fire onPowerChanged on a monthly tick', () => {
      const sim = makeSim();
      let count = 0;
      sim.onPowerChanged = () => { count++; };

      tickOneMonth(sim);

      expect(count).toBeGreaterThanOrEqual(1);
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
    expect(sim.stats.darkPopulation).toBe(3);
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
    expect(sim.stats.darkPopulation).toBe(0);
  });
});
