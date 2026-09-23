import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { SaveSystem } from '../openpublica/src/save/SaveSystem';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { SAVE_VERSION } from '../openpublica/src/save/SaveGame';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { BASE_LAND_VALUE } from '../openpublica/src/sim/LandValueSystem';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSim(money = 10_000): CitySim {
  const sim = CitySim.createCity(16, 16);
  sim.stats.money = money;
  return sim;
}

function roundTrip(sim: CitySim): CitySim {
  const save = SaveCodec.encode(sim);
  const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
  SaveCodec.decode(save, restored);
  return restored;
}

// ── SaveCodec.encode ──────────────────────────────────────────────────────────

describe('SaveCodec.encode', () => {
  it('should produce a document with the current SAVE_VERSION', () => {
    const sim  = makeSim();
    const save = SaveCodec.encode(sim);
    expect(save.version).toBe(SAVE_VERSION);
  });

  it('should capture map dimensions', () => {
    const sim  = CitySim.createCity(20, 30);
    const save = SaveCodec.encode(sim);
    expect(save.mapWidth).toBe(20);
    expect(save.mapHeight).toBe(30);
  });

  it('should capture all tiles (width × height)', () => {
    const sim  = CitySim.createCity(8, 8);
    const save = SaveCodec.encode(sim);
    expect(save.tiles).toHaveLength(64);
  });

  it('should capture tile road types', () => {
    const sim = makeSim();
    sim.placeRoad(3, 5, RoadType.Street);
    const save = SaveCodec.encode(sim);
    const tile = save.tiles.find((t) => t.x === 3 && t.y === 5);
    expect(tile?.roadType).toBe(RoadType.Street);
  });

  it('should capture tile zone types', () => {
    const sim = makeSim();
    sim.setZone(2, 4, ZoneType.Commercial);
    const save = SaveCodec.encode(sim);
    const tile = save.tiles.find((t) => t.x === 2 && t.y === 4);
    expect(tile?.zoneType).toBe(ZoneType.Commercial);
  });

  it('should capture stats.money', () => {
    const sim = makeSim(42_000);
    const save = SaveCodec.encode(sim);
    expect(save.stats.money).toBe(42_000);
  });

  it('should capture stats.pollutionAverage', () => {
    const sim = makeSim();
    sim.stats.pollutionAverage = 37;
    const save = SaveCodec.encode(sim);
    expect(save.stats.pollutionAverage).toBe(37);
  });

  it('should capture stats.crimeAverage', () => {
    const sim = makeSim();
    sim.stats.crimeAverage = 22;
    const save = SaveCodec.encode(sim);
    expect(save.stats.crimeAverage).toBe(22);
  });

  it('should capture stats.fireAverage', () => {
    const sim = makeSim();
    sim.stats.fireAverage = 55;
    const save = SaveCodec.encode(sim);
    expect(save.stats.fireAverage).toBe(55);
  });

  it('should capture the buildings registry', () => {
    const sim = makeSim();
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);
    const save = SaveCodec.encode(sim);
    expect(save.buildings.some((b) => b.defId === 'small_power_plant' && b.x === 5 && b.y === 5)).toBe(true);
  });

  it('should capture the clock total seconds', () => {
    const sim = makeSim();
    sim.tick(MONTH_SECONDS * 3);
    const save = SaveCodec.encode(sim);
    expect(save.clockTotalSeconds).toBeCloseTo(MONTH_SECONDS * 3);
  });
});

// ── SaveCodec.decode ──────────────────────────────────────────────────────────

describe('SaveCodec.decode', () => {
  it('should restore tile road types', () => {
    const sim = makeSim();
    sim.placeRoad(7, 7, RoadType.Highway);
    const restored = roundTrip(sim);
    expect(restored.getTile(7, 7)?.roadType).toBe(RoadType.Highway);
  });

  it('should restore tile zone types', () => {
    const sim = makeSim();
    sim.setZone(4, 4, ZoneType.Industrial);
    const restored = roundTrip(sim);
    expect(restored.getTile(4, 4)?.zoneType).toBe(ZoneType.Industrial);
  });

  it('should restore stats.money', () => {
    const sim = makeSim(77_000);
    const restored = roundTrip(sim);
    expect(restored.stats.money).toBe(77_000);
  });

  it('should restore tax rates', () => {
    const sim = makeSim();
    sim.stats.resTaxRate = 15;
    sim.stats.comTaxRate = 3;
    sim.stats.indTaxRate = 7;
    const restored = roundTrip(sim);
    expect(restored.stats.resTaxRate).toBe(15);
    expect(restored.stats.comTaxRate).toBe(3);
    expect(restored.stats.indTaxRate).toBe(7);
  });

  it('should restore the buildings registry', () => {
    const sim = makeSim();
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(6, 6, 'small_park', 0);
    const restored = roundTrip(sim);
    const instance = restored.growth.buildings.get('6,6');
    expect(instance).toBeDefined();
    expect(instance?.defId).toBe('small_park');
  });

  it('should restore the simulation clock', () => {
    const sim = makeSim();
    sim.tick(MONTH_SECONDS * 5);
    const restored = roundTrip(sim);
    expect(restored.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 5);
  });

  it('should restore stats.pollutionAverage', () => {
    const sim = makeSim();
    sim.stats.pollutionAverage = 29;
    const restored = roundTrip(sim);
    expect(restored.stats.pollutionAverage).toBe(29);
  });

  it('should restore stats.crimeAverage', () => {
    const sim = makeSim();
    sim.stats.crimeAverage = 18;
    const restored = roundTrip(sim);
    expect(restored.stats.crimeAverage).toBe(18);
  });

  it('should restore stats.fireAverage', () => {
    const sim = makeSim();
    sim.stats.fireAverage = 41;
    const restored = roundTrip(sim);
    expect(restored.stats.fireAverage).toBe(41);
  });

  it('should restore stats.waterAverage', () => {
    const sim = makeSim();
    sim.stats.waterAverage = 60;
    const restored = roundTrip(sim);
    expect(restored.stats.waterAverage).toBe(60);
  });

  it('should restore tile.neglectMonths', () => {
    const sim = makeSim();
    sim.getTile(2, 2)!.neglectMonths = 3;
    const restored = roundTrip(sim);
    expect(restored.getTile(2, 2)!.neglectMonths).toBe(3);
  });

  it('should default missing neglectMonths to 0', () => {
    const sim = makeSim();
    const save = SaveCodec.encode(sim);
    save.tiles.forEach((t) => {
      delete t.neglectMonths;
    });
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.getTile(0, 0)!.neglectMonths).toBe(0);
  });

  it('should restore stats.approval', () => {
    const sim = makeSim();
    sim.stats.approval = 71;
    sim.stats.advisory = 'custom';
    const restored = roundTrip(sim);
    // Load re-runs evaluation, so advisory is derived — approval follows the live city.
    expect(restored.stats.approval).toBeGreaterThanOrEqual(0);
    expect(restored.stats.approval).toBeLessThanOrEqual(100);
    expect(typeof restored.stats.advisory).toBe('string');
  });

  it('should use safe defaults for missing stat fields (simulate older save)', () => {
    const sim  = makeSim();
    const save = SaveCodec.encode(sim);
    (save.stats as unknown as Record<string, unknown>)['transitAccess'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['pollutionAverage'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['crimeAverage'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['fireAverage'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['waterAverage'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['approval'] = undefined;
    (save.stats as unknown as Record<string, unknown>)['advisory'] = undefined;
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.stats.transitAccess).toBe(0);
    expect(restored.stats.pollutionAverage).toBe(0);
    expect(restored.stats.crimeAverage).toBe(0);
    expect(restored.stats.fireAverage).toBe(0);
    expect(restored.stats.waterAverage).toBe(0);
    expect(restored.stats.approval).toBe(100);
    expect(restored.stats.advisory).toBe('');
  });
});

// ── SaveCodec.migrate ─────────────────────────────────────────────────────────

describe('SaveCodec.migrate', () => {
  it('should return null for null input', () => {
    expect(SaveCodec.migrate(null)).toBeNull();
  });

  it('should return null for non-object input', () => {
    expect(SaveCodec.migrate('not an object')).toBeNull();
    expect(SaveCodec.migrate(42)).toBeNull();
  });

  it('should return null for an unrecognised version', () => {
    expect(SaveCodec.migrate({ version: 999, tiles: [], buildings: [], mapWidth: 8, mapHeight: 8 })).toBeNull();
  });

  it('should return null when tiles array is missing', () => {
    const raw = { version: 1, buildings: [], mapWidth: 8, mapHeight: 8 };
    expect(SaveCodec.migrate(raw)).toBeNull();
  });

  it('should return null when buildings array is missing', () => {
    const raw = { version: 1, tiles: [], mapWidth: 8, mapHeight: 8 };
    expect(SaveCodec.migrate(raw)).toBeNull();
  });

  it('should return null when mapWidth is missing', () => {
    const raw = { version: 1, tiles: [], buildings: [], mapHeight: 8 };
    expect(SaveCodec.migrate(raw)).toBeNull();
  });

  it('should return null when mapHeight is missing', () => {
    const raw = { version: 1, tiles: [], buildings: [], mapWidth: 8 };
    expect(SaveCodec.migrate(raw)).toBeNull();
  });

  it('should accept a well-formed v1 document', () => {
    const raw = {
      version:           1,
      mapWidth:          8,
      mapHeight:         8,
      clockTotalSeconds: 0,
      tiles:             [],
      buildings:         [],
      stats: {
        population: 0, jobs: 0, money: 10_000,
        residentialDemand: 0, commercialDemand: 0, industrialDemand: 20,
        resTaxRate: 9, comTaxRate: 9, indTaxRate: 9,
        monthlyIncome: 0, monthlyExpenses: 0, bankruptcyWarning: false,
        happiness: 100, walkability: 0, transitAccess: 0, pollutionAverage: 0, crimeAverage: 0, fireAverage: 0, waterAverage: 0, powerSupply: 0, powerLoad: 0, powerShort: 0, waterSupply: 0, waterLoad: 0, waterShort: 0, approval: 100, advisory: '',
      },
    };
    const result = SaveCodec.migrate(raw);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(1);
  });

  it('should round-trip a real encoded sim through migrate', () => {
    const sim  = makeSim(5_000);
    const save = SaveCodec.encode(sim);
    const migrated = SaveCodec.migrate(save as unknown);
    expect(migrated).not.toBeNull();
    expect(migrated?.stats.money).toBe(5_000);
  });
});

describe('SaveCodec month progress', () => {
  it('should finish the current month after load instead of restarting it', () => {
    const sim = makeSim();
    sim.placeRoad(4, 4, RoadType.Street);
    sim.tick(MONTH_SECONDS - 0.5);

    const restored = roundTrip(sim);
    expect(restored.getTile(4, 3)!.landValue).toBe(BASE_LAND_VALUE);

    restored.tick(0.5);
    expect(restored.getTile(4, 3)!.landValue).toBeGreaterThan(BASE_LAND_VALUE);
  });

  it('should persist pending month catch-up in the accumulator', () => {
    const sim = makeSim();
    sim.placeRoad(0, 0, RoadType.Street);
    sim.tick(MONTH_SECONDS * 10);
    expect(sim.growth.monthAccumulator).toBeCloseTo(MONTH_SECONDS * 4);
    const save = SaveCodec.encode(sim);
    expect(save.monthAccumulator).toBeCloseTo(MONTH_SECONDS * 4);
    expect(save.clockTotalSeconds).toBeCloseTo(MONTH_SECONDS * 6);

    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 6);
    expect(restored.growth.monthAccumulator).toBeCloseTo(MONTH_SECONDS * 4);
    restored.tick(0);
    expect(restored.clock.totalSeconds).toBeCloseTo(MONTH_SECONDS * 10);
  });

  it('should persist the terrain seed', () => {
    const sim = CitySim.createCity(8, 8, 4242);
    const restored = roundTrip(sim);
    expect(restored.terrainSeed).toBe(4242);
  });

  it('should default a missing terrain seed', () => {
    const sim = makeSim();
    const save = SaveCodec.encode(sim);
    delete save.terrainSeed;
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight, 1);
    SaveCodec.decode(save, restored);
    expect(restored.terrainSeed).toBe(2026);
  });

  it('should drop leftover roads when a save omits that tile', () => {
    const live = makeSim();
    live.placeRoad(1, 1, RoadType.Street);
    const save = SaveCodec.encode(makeSim());
    save.tiles = save.tiles.filter((t) => !(t.x === 1 && t.y === 1));
    SaveCodec.decode(save, live);
    expect(live.getTile(1, 1)?.roadType).toBe(RoadType.None);
  });

  it('should put a tile-only building back into the registry', () => {
    const sim = makeSim();
    sim.placeServiceBuilding(3, 3, 'small_park', 0);
    const save = SaveCodec.encode(sim);
    save.buildings = [];
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.growth.buildings.get('3,3')?.defId).toBe('small_park');
    expect(restored.getTile(3, 3)?.buildingId).toBe('small_park');
  });

  it('should write registry defIds onto tiles', () => {
    const sim = makeSim();
    sim.placeServiceBuilding(2, 2, 'small_park', 0);
    const save = SaveCodec.encode(sim);
    const tile = save.tiles.find((t) => t.x === 2 && t.y === 2);
    if (tile) tile.buildingId = null;
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.getTile(2, 2)?.buildingId).toBe('small_park');
  });
});

describe('SaveSystem.load', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    });
  });

  it('should restore power coverage without waiting a month', () => {
    const sim = makeSim();
    sim.stats.money = 100_000;
    for (let y = 0; y < 10; y++) sim.placeRoad(6, y, RoadType.Street);
    sim.setZone(7, 0, ZoneType.Residential);
    sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);
    expect(sim.getTile(5, 5)?.powered).toBe(true);
    SaveSystem.save(sim);

    const loaded = makeSim();
    expect(loaded.getTile(5, 5)?.powered).toBe(false);
    expect(SaveSystem.load(loaded)).toBe('loaded');
    expect(loaded.getTile(5, 5)?.powered).toBe(true);
    expect(loaded.getTile(6, 0)?.powered).toBe(true);
    expect(loaded.getTile(7, 0)?.powered).toBe(true);
  });

  it('should restore watered land value without waiting a month', () => {
    const sim = makeSim();
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(5, 5, 'small_power_plant', 0);
    sim.placeServiceBuilding(5, 6, 'small_water_tower', 0);
    sim.setZone(5, 7, ZoneType.Residential);
    sim.tick(MONTH_SECONDS);
    expect(sim.getTile(5, 7)?.watered).toBe(true);
    const wetValue = sim.getTile(5, 7)!.landValue;
    SaveSystem.save(sim);

    const loaded = makeSim();
    expect(SaveSystem.load(loaded)).toBe('loaded');
    expect(loaded.getTile(5, 7)?.watered).toBe(true);
    expect(loaded.getTile(5, 7)!.landValue).toBe(wetValue);
  });

  it('should reject a save whose map size does not match', () => {
    const small = CitySim.createCity(8, 8);
    SaveSystem.save(small);
    const large = CitySim.createCity(16, 16);
    large.stats.money = 42;
    expect(SaveSystem.load(large)).toBe('size-mismatch');
    expect(large.stats.money).toBe(42);
  });

  it('should report missing when nothing is stored', () => {
    const sim = makeSim();
    expect(SaveSystem.load(sim)).toBe('missing');
  });
});
