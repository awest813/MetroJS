import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { SAVE_VERSION } from '../openpublica/src/save/SaveGame';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

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

  it('should use safe defaults for missing stat fields (simulate older save)', () => {
    const sim  = makeSim();
    const save = SaveCodec.encode(sim);
    // Simulate an older save that lacks the transitAccess field.
    (save.stats as unknown as Record<string, unknown>)['transitAccess'] = undefined;
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.stats.transitAccess).toBe(0);
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
        happiness: 100, walkability: 0, transitAccess: 0,
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
