import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { BulldozeTool, isBulldozeTool } from '../openpublica/src/tools/BulldozeTool';
import { RoadTool } from '../openpublica/src/tools/RoadTool';
import { ToolController, type StrokeSummary } from '../openpublica/src/tools/ToolController';
import {
  formatBulldozePlan,
  formatBulldozeResult,
  planBulldozeArea,
  type ClearPlan,
} from '../openpublica/src/tools/bulldozeArea';
import { BulldozeAreaMode } from '../openpublica/src/app/plannedDrag';

/** A street along y = 2 with a house, a park, a zoned lot and a bridge span beside it. */
function block(money = 1000): CitySim {
  const sim = CitySim.createCity(12, 12);
  sim.stats.money = money;
  sim.getTile(6, 2)!.terrain = TerrainType.Water;
  for (let x = 1; x <= 7; x++) sim.placeRoad(x, 2, RoadType.Street);
  sim.getTile(2, 3)!.zoneType = ZoneType.Residential;
  sim.getTile(2, 3)!.buildingId = 'small_house';
  sim.growth.buildings.set('2,3', { defId: 'small_house', x: 2, y: 3 });
  sim.placeServiceBuilding(3, 3, 'small_park', 0);
  sim.setZone(4, 3, ZoneType.Residential);
  return sim;
}

describe('bulldoze areas', () => {
  it('should plan what a rectangle clears, tile by tile', () => {
    const sim = block();
    const plan = planBulldozeArea({ x: 1, y: 2 }, { x: 6, y: 3 }, sim);
    const at = (x: number, y: number) => plan.tiles.find((t) => t.x === x && t.y === y)!.verdict;
    expect(at(1, 2)).toBe('road');
    expect(at(6, 2)).toBe('bridge');
    expect(at(2, 3)).toBe('building');
    expect(at(3, 3)).toBe('building');
    expect(at(4, 3)).toBe('zone');
    expect(at(5, 3)).toBe('empty');
    expect(plan).toMatchObject({ buildings: 2, services: ['park'], roads: 5, bridges: 1, zones: 1, blocked: 0 });
    expect(plan.lots).toHaveLength(9);
    expect(plan.cost).toBe(9);
    expect(sim.stats.money).toBe(1000);
  });

  it('should say what comes down while dragging, and after release', () => {
    const sim = block();
    const plan = planBulldozeArea({ x: 1, y: 2 }, { x: 6, y: 3 }, sim);
    expect(formatBulldozePlan('Bulldoze', plan)).toBe(
      'Bulldoze: 1 building, a park, 5 road tiles, 1 bridge span, 1 zoned lot · $9 · ' +
      'release to clear · Esc cancels · Shift paints freehand',
    );
    expect(formatBulldozeResult(9, plan)).toBe(
      'Bulldozed 1 building, a park, 5 road tiles, 1 bridge span and 1 zoned lot for $9.',
    );
    const empty = planBulldozeArea({ x: 8, y: 8 }, { x: 10, y: 10 }, sim);
    expect(formatBulldozePlan('Bulldoze', empty)).toMatch(/^Bulldoze: nothing to clear here · release/);
  });

  it('should leave standing what the money does not reach, as release would', () => {
    const sim = block(3);
    const plan = planBulldozeArea({ x: 1, y: 2 }, { x: 6, y: 2 }, sim);
    expect(plan.lots).toHaveLength(3);
    expect(plan.blocked).toBe(3);
    expect(plan.tiles.filter((t) => t.verdict === 'funds').map((t) => t.x)).toEqual([4, 5, 6]);
    expect(formatBulldozePlan('Bulldoze', plan)).toMatch(/· \$3 · 3 left standing \(not enough money\) ·/);
    expect(formatBulldozeResult(3, plan)).toMatch(/Ran out of money partway\.$/);
  });

  it('should clear on release through the tool, for a dollar a tile, and nothing else', () => {
    const sim = block();
    const bulldoze = new BulldozeTool();
    const tools = new ToolController(bulldoze);
    let built: { summary: StrokeSummary; plan: ClearPlan } | null = null;
    const mode = new BulldozeAreaMode(sim, tools, (_tool, summary, plan) => {
      built = { summary, plan };
    });
    expect(mode.accepts(bulldoze)).toBe(true);
    expect(mode.accepts(new RoadTool())).toBe(false);
    expect(isBulldozeTool(bulldoze)).toBe(true);

    const preview = mode.preview(bulldoze, { x: 1, y: 2 }, { x: 6, y: 3 });
    expect(preview.tints).toHaveLength(12);
    expect(preview.targetBlocked).toBe(false);
    // The preview changes nothing.
    expect(sim.getTile(2, 3)!.buildingId).toBe('small_house');

    mode.build(bulldoze, { x: 1, y: 2 }, { x: 6, y: 3 });
    expect(built!.summary.applied).toBe(9);
    expect(built!.summary.spent).toBe(9);
    expect(sim.stats.money).toBe(991);
    for (let x = 1; x <= 6; x++) {
      expect(sim.getTile(x, 2)!.roadType).toBe(RoadType.None);
      expect(sim.getTile(x, 3)!.buildingId).toBeNull();
      expect(sim.getTile(x, 3)!.zoneType).toBe(ZoneType.None);
    }
    expect(sim.growth.buildings.has('2,3')).toBe(false);
    // Outside the rectangle, the street goes on.
    expect(sim.getTile(7, 2)!.roadType).toBe(RoadType.Street);
    expect(sim.getTile(6, 2)!.terrain).toBe(TerrainType.Water);
  });

  it('should mark an empty rectangle as nothing to do', () => {
    const sim = block();
    const mode = new BulldozeAreaMode(sim, new ToolController(new BulldozeTool()), () => {});
    expect(mode.preview(new BulldozeTool(), { x: 8, y: 8 }, { x: 9, y: 9 }).targetBlocked).toBe(true);
  });
});
