import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { ToolController } from '../openpublica/src/tools/ToolController';
import { InspectTool } from '../openpublica/src/tools/InspectTool';
import { RoadTool, ROAD_COST } from '../openpublica/src/tools/RoadTool';
import { BulldozeTool, BULLDOZE_COST } from '../openpublica/src/tools/BulldozeTool';
import {
  ZoneBrushTool,
  ZONE_COST,
  createResidentialLowBrush,
  createCommercialLowBrush,
  createIndustrialLightBrush,
} from '../openpublica/src/tools/ZoneBrushTool';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSim(money = 10_000): CitySim {
  const sim = CitySim.createCity(16, 16);
  sim.stats.money = money;
  return sim;
}

const ORIGIN = { x: 0, y: 0 };
const TILE_A = { x: 3, y: 4 };
const TILE_B = { x: 5, y: 6 };

// ── ToolController ────────────────────────────────────────────────────────────

describe('ToolController', () => {
  describe('initial state', () => {
    it('should use the default tool', () => {
      const inspect = new InspectTool();
      const ctrl    = new ToolController(inspect);
      expect(ctrl.activeTool).toBe(inspect);
    });
  });

  describe('setActiveTool', () => {
    it('should switch to a registered tool', () => {
      const inspect = new InspectTool();
      const road    = new RoadTool();
      const ctrl    = new ToolController(inspect);
      ctrl.register(road);
      ctrl.setActiveTool('road');
      expect(ctrl.activeTool).toBe(road);
    });

    it('should be a no-op for an unknown tool name', () => {
      const inspect = new InspectTool();
      const ctrl    = new ToolController(inspect);
      ctrl.setActiveTool('nonexistent');
      expect(ctrl.activeTool).toBe(inspect);
    });
  });

  describe('applyToTile', () => {
    it('should call the active tool and fire onTileChanged on mutation', () => {
      const road = new RoadTool();
      const ctrl = new ToolController(road);
      const sim  = makeSim();

      const changed: typeof ORIGIN[] = [];
      ctrl.onTileChanged((coord) => changed.push(coord));

      ctrl.applyToTile(TILE_A, sim);

      expect(changed).toHaveLength(1);
      expect(changed[0]).toEqual(TILE_A);
    });

    it('should NOT fire onTileChanged when the tool returns false', () => {
      const inspect = new InspectTool();
      const ctrl    = new ToolController(inspect);
      const sim     = makeSim();

      const changed: typeof ORIGIN[] = [];
      ctrl.onTileChanged((coord) => changed.push(coord));

      ctrl.applyToTile(TILE_A, sim);

      expect(changed).toHaveLength(0);
    });

    it('should deduplicate consecutive drag events on the same tile', () => {
      const road = new RoadTool();
      const ctrl = new ToolController(road);
      const sim  = makeSim();

      const changed: typeof ORIGIN[] = [];
      ctrl.onTileChanged((coord) => changed.push(coord));

      ctrl.applyToTile(TILE_A, sim);
      ctrl.applyToTile(TILE_A, sim); // same tile — should be suppressed
      ctrl.applyToTile(TILE_A, sim); // same tile — should be suppressed

      expect(changed).toHaveLength(1);
    });

    it('should allow different tiles during the same drag', () => {
      const road = new RoadTool();
      const ctrl = new ToolController(road);
      const sim  = makeSim();

      const changed: typeof ORIGIN[] = [];
      ctrl.onTileChanged((coord) => changed.push(coord));

      ctrl.applyToTile(TILE_A, sim);
      ctrl.applyToTile(TILE_B, sim); // different tile — should go through

      expect(changed).toHaveLength(2);
    });
  });

  describe('resetDrag', () => {
    it('should allow re-applying the tool to the same tile after reset', () => {
      const road = new RoadTool();
      const ctrl = new ToolController(road);
      const sim  = makeSim();

      const changed: typeof ORIGIN[] = [];
      ctrl.onTileChanged((coord) => changed.push(coord));

      ctrl.applyToTile(TILE_A, sim);
      ctrl.resetDrag();
      ctrl.applyToTile(TILE_A, sim); // new drag — should go through

      expect(changed).toHaveLength(2);
    });
  });
});

// ── InspectTool ───────────────────────────────────────────────────────────────

describe('InspectTool', () => {
  it('should return false (no mutation)', () => {
    const sim  = makeSim();
    const tool = new InspectTool();
    expect(tool.apply(ORIGIN, sim)).toBe(false);
  });

  it('should not modify the tile', () => {
    const sim  = makeSim();
    const tool = new InspectTool();
    tool.apply(ORIGIN, sim);
    const tile = sim.getTile(0, 0)!;
    expect(tile.roadType).toBe(RoadType.None);
    expect(tile.zoneType).toBe(ZoneType.None);
  });

  it('should handle out-of-bounds coordinates gracefully', () => {
    const sim  = makeSim();
    const tool = new InspectTool();
    expect(() => tool.apply({ x: 99, y: 99 }, sim)).not.toThrow();
  });
});

// ── RoadTool ──────────────────────────────────────────────────────────────────

describe('RoadTool', () => {
  it('should place a Street road and return true', () => {
    const sim  = makeSim();
    const tool = new RoadTool(RoadType.Street);
    const result = tool.apply(ORIGIN, sim);
    expect(result).toBe(true);
    expect(sim.getTile(0, 0)?.roadType).toBe(RoadType.Street);
  });

  it('should deduct the correct cost from city funds', () => {
    const sim  = makeSim(1_000);
    const tool = new RoadTool(RoadType.Street);
    tool.apply(ORIGIN, sim);
    expect(sim.stats.money).toBe(1_000 - ROAD_COST[RoadType.Street]);
  });

  it('should place a Highway road with the correct cost', () => {
    const sim  = makeSim(1_000);
    const tool = new RoadTool(RoadType.Highway);
    tool.apply(ORIGIN, sim);
    expect(sim.getTile(0, 0)?.roadType).toBe(RoadType.Highway);
    expect(sim.stats.money).toBe(1_000 - ROAD_COST[RoadType.Highway]);
  });

  it('should default to Street road type', () => {
    const sim  = makeSim();
    const tool = new RoadTool(); // default
    tool.apply(ORIGIN, sim);
    expect(sim.getTile(0, 0)?.roadType).toBe(RoadType.Street);
  });

  it('should return false and not modify the tile when funds are insufficient', () => {
    const sim  = makeSim(0);
    const tool = new RoadTool(RoadType.Street);
    const result = tool.apply(ORIGIN, sim);
    expect(result).toBe(false);
    expect(sim.getTile(0, 0)?.roadType).toBe(RoadType.None);
  });

  it('should not deduct money when placement is rejected', () => {
    const sim  = makeSim(0);
    const tool = new RoadTool();
    tool.apply(ORIGIN, sim);
    expect(sim.stats.money).toBe(0);
  });
});

// ── ZoneBrushTool ─────────────────────────────────────────────────────────────

describe('ZoneBrushTool', () => {
  it('createResidentialLowBrush should have name "zoneResidentialLow"', () => {
    expect(createResidentialLowBrush().name).toBe('zoneResidentialLow');
  });

  it('createCommercialLowBrush should have name "zoneCommercialLow"', () => {
    expect(createCommercialLowBrush().name).toBe('zoneCommercialLow');
  });

  it('createIndustrialLightBrush should have name "zoneIndustrialLight"', () => {
    expect(createIndustrialLightBrush().name).toBe('zoneIndustrialLight');
  });

  it('should set the correct zone type and return true', () => {
    const sim  = makeSim();
    const tool = createResidentialLowBrush();
    const result = tool.apply(ORIGIN, sim);
    expect(result).toBe(true);
    expect(sim.getTile(0, 0)?.zoneType).toBe(ZoneType.Residential);
  });

  it('should deduct ZONE_COST from city funds', () => {
    const sim  = makeSim(1_000);
    const tool = createCommercialLowBrush();
    tool.apply(ORIGIN, sim);
    expect(sim.stats.money).toBe(1_000 - ZONE_COST);
  });

  it('should return false and not modify the tile when funds are insufficient', () => {
    const sim  = makeSim(0);
    const tool = createIndustrialLightBrush();
    const result = tool.apply(ORIGIN, sim);
    expect(result).toBe(false);
    expect(sim.getTile(0, 0)?.zoneType).toBe(ZoneType.None);
  });

  it('should return false (and not charge) when the tile already has the zone', () => {
    const sim  = makeSim(1_000);
    const tool = createResidentialLowBrush();
    tool.apply(ORIGIN, sim); // first paint — charges
    const moneyAfterFirst = sim.stats.money;
    const result = tool.apply(ORIGIN, sim); // same tile same zone — no-op
    expect(result).toBe(false);
    expect(sim.stats.money).toBe(moneyAfterFirst); // no extra charge
  });

  it('should set Industrial zone for industrial brush', () => {
    const sim  = makeSim();
    const tool = createIndustrialLightBrush();
    tool.apply(ORIGIN, sim);
    expect(sim.getTile(0, 0)?.zoneType).toBe(ZoneType.Industrial);
  });

  it('ZoneBrushTool with ZoneType.None should not charge', () => {
    const sim  = makeSim(0); // no money
    const tool = new ZoneBrushTool(ZoneType.None);
    const result = tool.apply(ORIGIN, sim);
    // ZoneType.None is already the default — tile has None zone, so result is false (no change)
    expect(result).toBe(false);
  });
});

// ── BulldozeTool ──────────────────────────────────────────────────────────────

describe('BulldozeTool', () => {
  it('should clear road and zone from a tile and return true', () => {
    const sim = makeSim();
    sim.placeRoad(0, 0, RoadType.Street);
    sim.setZone(0, 0, ZoneType.Residential);

    const tool   = new BulldozeTool();
    const result = tool.apply(ORIGIN, sim);

    expect(result).toBe(true);
    expect(sim.getTile(0, 0)?.roadType).toBe(RoadType.None);
    expect(sim.getTile(0, 0)?.zoneType).toBe(ZoneType.None);
    expect(sim.getTile(0, 0)?.buildingId).toBeNull();
  });

  it('should deduct BULLDOZE_COST from city funds', () => {
    const sim  = makeSim(1_000);
    const tool = new BulldozeTool();
    tool.apply(ORIGIN, sim);
    expect(sim.stats.money).toBe(1_000 - BULLDOZE_COST);
  });

  it('should return false when funds are insufficient', () => {
    const sim    = makeSim(0);
    const tool   = new BulldozeTool();
    const result = tool.apply(ORIGIN, sim);
    expect(result).toBe(false);
  });

  it('should not deduct money when placement is rejected', () => {
    const sim  = makeSim(0);
    const tool = new BulldozeTool();
    tool.apply(ORIGIN, sim);
    expect(sim.stats.money).toBe(0);
  });
});

// ── CitySim.canAfford / deductMoney ──────────────────────────────────────────

describe('CitySim economy', () => {
  it('canAfford returns true when funds are sufficient', () => {
    const sim = makeSim(100);
    expect(sim.canAfford(100)).toBe(true);
    expect(sim.canAfford(99)).toBe(true);
  });

  it('canAfford returns false when funds are insufficient', () => {
    const sim = makeSim(5);
    expect(sim.canAfford(6)).toBe(false);
    expect(sim.canAfford(100)).toBe(false);
  });

  it('deductMoney reduces money and returns true on success', () => {
    const sim = makeSim(200);
    const ok  = sim.deductMoney(50);
    expect(ok).toBe(true);
    expect(sim.stats.money).toBe(150);
  });

  it('deductMoney returns false and does not modify money when insufficient', () => {
    const sim = makeSim(10);
    const ok  = sim.deductMoney(20);
    expect(ok).toBe(false);
    expect(sim.stats.money).toBe(10);
  });
});
