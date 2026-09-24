import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import {
  bridgeProblem,
  bridgeSpanAt,
  hasRoadFrontage,
  isBridge,
} from '../openpublica/src/sim/roadConnections';
import { HIGHWAY_CAPACITY, roadCapacity } from '../openpublica/src/sim/TrafficPressureSystem';
import { BRIDGE_UPKEEP_MULTIPLIER, roadUpkeep, tallyBudget } from '../openpublica/src/sim/EconomySystem';
import { formatGrowthHint, tileHasAdjacentRoad } from '../openpublica/src/sim/zoneGrowthHints';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import {
  BRIDGE_COST_MULTIPLIER,
  ROAD_COST,
  RoadTool,
  roadBuildCost,
  roadPaveCost,
} from '../openpublica/src/tools/RoadTool';
import { TrolleyAvenueTool, TROLLEY_AVENUE_COST } from '../openpublica/src/tools/TrolleyAvenueTool';
import { ToolController } from '../openpublica/src/tools/ToolController';
import { explainToolFailure } from '../openpublica/src/tools/toolFeedback';
import { formatInspectStatus } from '../openpublica/src/ui/inspectStatus';

function makeSim(size = 16, money = 100_000): CitySim {
  const sim = CitySim.createCity(size, size);
  sim.stats.money = money;
  return sim;
}

function water(sim: CitySim, coords: Array<[number, number]>): void {
  for (const [x, y] of coords) sim.getTile(x, y)!.terrain = TerrainType.Water;
}

function build(sim: CitySim, defId: string, x: number, y: number, zone: ZoneType): void {
  sim.growth.buildings.set(`${x},${y}`, { defId, x, y });
  sim.getTile(x, y)!.buildingId = defId;
  sim.getTile(x, y)!.zoneType = zone;
}

function street(sim: CitySim, coords: Array<[number, number]>, type = RoadType.Street): void {
  for (const [x, y] of coords) expect(sim.placeRoad(x, y, type)).toBe(true);
}

function row(x0: number, x1: number, y: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

function column(x: number, y0: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

describe('bridges at the sim layer', () => {
  it('should lay a road over water as a bridge', () => {
    const sim = makeSim();
    water(sim, [[5, 5]]);
    expect(sim.placeRoad(5, 5, RoadType.Street)).toBe(true);
    expect(isBridge(sim.getTile(5, 5))).toBe(true);
    expect(sim.getTile(5, 5)!.terrain).toBe(TerrainType.Water);
    expect(sim.isBuildable(5, 5)).toBe(false);
  });

  it('should keep bridges straight: no turns or junctions over water', () => {
    const sim = makeSim();
    water(sim, [[5, 5], [5, 6], [6, 5]]);
    street(sim, [[4, 5], [5, 5]]);
    expect(bridgeProblem(sim.map, 6, 5)).toBeNull();
    expect(bridgeProblem(sim.map, 5, 6)).toBe('bridge-turn');
    expect(sim.placeRoad(5, 6, RoadType.Street)).toBe(false);
    expect(sim.roadPlacementBlock(5, 6)).toBe('bridge-turn');
  });

  it('should refuse a side street onto a bridge from the bank', () => {
    const sim = makeSim();
    water(sim, [[5, 5], [6, 5]]);
    street(sim, [[4, 5], [5, 5], [6, 5], [7, 5]]);
    // (5, 4) is dry land beside the first span tile.
    expect(sim.roadPlacementBlock(5, 4)).toBe('bridge-branch');
    expect(sim.placeRoad(5, 4, RoadType.Street)).toBe(false);
    // Land beside the abutment is fine: the abutment is not a bridge.
    expect(sim.placeRoad(4, 4, RoadType.Street)).toBe(true);
  });

  it('should find the whole span and what lies past each end', () => {
    const sim = makeSim();
    water(sim, [[5, 5], [6, 5], [7, 5]]);
    street(sim, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]]);
    const span = bridgeSpanAt(sim.map, 6, 5)!;
    expect(span.axis).toBe('ew');
    expect(span.tiles).toEqual([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }]);
    expect(span.before).toEqual({ x: 4, y: 5 });
    expect(span.after).toEqual({ x: 8, y: 5 });
    expect(bridgeSpanAt(sim.map, 4, 5)).toBeNull();
  });

  it('should give lots no driveway onto a bridge deck', () => {
    const sim = makeSim();
    water(sim, [[5, 5]]);
    street(sim, [[5, 5]]);
    expect(hasRoadFrontage(sim.map, 5, 6)).toBe(false);
    expect(tileHasAdjacentRoad(sim.map, 5, 6)).toBe(false);
    sim.setZone(5, 6, ZoneType.Residential);
    expect(formatGrowthHint(sim.getTile(5, 6)!, sim.map, sim.stats)).toMatch(/bridge has no driveways/);
  });

  it('should survive a save and load', () => {
    const sim = makeSim();
    water(sim, [[5, 5]]);
    street(sim, [[4, 5], [5, 5], [6, 5]], RoadType.Highway);
    const restored = CitySim.createCity(16, 16);
    SaveCodec.decode(SaveCodec.encode(sim), restored);
    expect(restored.getTile(5, 5)!.roadType).toBe(RoadType.Highway);
    expect(isBridge(restored.getTile(5, 5))).toBe(true);
  });

  it('should charge bridge upkeep at the multiplier', () => {
    expect(roadUpkeep(RoadType.Street, false)).toBe(3);
    expect(roadUpkeep(RoadType.Street, true)).toBe(3 * BRIDGE_UPKEEP_MULTIPLIER);
    expect(roadUpkeep(RoadType.None, true)).toBe(0);

    const sim = makeSim();
    water(sim, [[5, 5]]);
    street(sim, [[4, 5], [5, 5]]);
    const tally = tallyBudget(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats);
    expect(tally.roadExpenses).toBe(3 + 3 * BRIDGE_UPKEEP_MULTIPLIER);
  });

  it('should say "bridge" when inspecting one', () => {
    const sim = makeSim();
    water(sim, [[5, 5]]);
    street(sim, [[5, 5]]);
    expect(formatInspectStatus('Inspect', sim.getTile(5, 5), null)).toMatch(/Street bridge/);
  });
});

describe('road tools', () => {
  it('should price a bridge tile at the multiplier', () => {
    expect(roadBuildCost(RoadType.Street, false)).toBe(ROAD_COST[RoadType.Street]);
    expect(roadBuildCost(RoadType.Street, true)).toBe(ROAD_COST[RoadType.Street] * BRIDGE_COST_MULTIPLIER);

    const sim = makeSim(16, 1000);
    water(sim, [[3, 3]]);
    const tool = new RoadTool();
    expect(tool.apply({ x: 3, y: 3 }, sim)).toBe(true);
    expect(sim.stats.money).toBe(1000 - ROAD_COST[RoadType.Street] * BRIDGE_COST_MULTIPLIER);
  });

  it('should explain a bridge the treasury cannot afford', () => {
    const sim = makeSim(16, 20);
    water(sim, [[3, 3]]);
    expect(new RoadTool().apply({ x: 3, y: 3 }, sim)).toBe(false);
    expect(explainToolFailure('road', { x: 3, y: 3 }, sim)).toBe('Need $50 for a bridge tile (have $20)');
  });

  it('should explain a bridge that would turn', () => {
    const sim = makeSim();
    water(sim, [[5, 5], [5, 6]]);
    street(sim, [[4, 5], [5, 5]]);
    expect(explainToolFailure('road', { x: 5, y: 6 }, sim)).toMatch(/Bridges run straight/);
    expect(explainToolFailure('road', { x: 5, y: 4 }, sim)).toMatch(/from the side/);
  });

  it('should upgrade a street to a highway or trolley line for the difference in price', () => {
    const sim = makeSim(16, 1000);
    street(sim, [[2, 2], [3, 2]]);
    const streetPrice = ROAD_COST[RoadType.Street];
    expect(new RoadTool(RoadType.Highway).costAt({ x: 2, y: 2 }, sim)).toBe(ROAD_COST[RoadType.Highway] - streetPrice);
    expect(new RoadTool(RoadType.Highway).apply({ x: 2, y: 2 }, sim)).toBe(true);
    expect(sim.getTile(2, 2)!.roadType).toBe(RoadType.Highway);
    expect(new TrolleyAvenueTool().apply({ x: 3, y: 2 }, sim)).toBe(true);
    expect(sim.getTile(3, 2)!.roadType).toBe(RoadType.TrolleyAvenue);
    expect(sim.stats.money).toBe(1000 - (ROAD_COST[RoadType.Highway] - streetPrice) - (TROLLEY_AVENUE_COST - streetPrice));
    // A street bridge upgrades for the difference between the bridge prices.
    expect(roadPaveCost(RoadType.Highway, RoadType.Street, true)).toBe(
      roadBuildCost(RoadType.Highway, true) - roadBuildCost(RoadType.Street, true),
    );
    expect(roadPaveCost(RoadType.Highway, RoadType.None, false)).toBe(ROAD_COST[RoadType.Highway]);
  });

  it('should never downgrade a highway or trolley line without a bulldoze', () => {
    const sim = makeSim();
    street(sim, [[2, 2]], RoadType.Highway);
    street(sim, [[3, 2]], RoadType.TrolleyAvenue);
    const before = sim.stats.money;
    expect(new RoadTool().apply({ x: 2, y: 2 }, sim)).toBe(false);
    expect(new RoadTool(RoadType.Highway).apply({ x: 3, y: 2 }, sim)).toBe(false);
    expect(sim.stats.money).toBe(before);
    expect(explainToolFailure('road', { x: 2, y: 2 }, sim)).toBe(
      'Already a highway — bulldoze it first to lay a street.',
    );
    expect(explainToolFailure('trolleyAvenue', { x: 2, y: 2 }, sim)).toBe(
      'Trolley lines cross a highway at grade — lay the line up to it on both sides.',
    );
  });

  it('should leave an intersection when a street stroke crosses a highway', () => {
    const sim = makeSim();
    street(sim, column(5, 0, 8), RoadType.Highway);
    const ctrl = new ToolController(new RoadTool());
    ctrl.applyToTile({ x: 2, y: 4 }, sim);
    ctrl.applyToTile({ x: 8, y: 4 }, sim);
    ctrl.resetDrag();
    expect(sim.getTile(5, 4)!.roadType).toBe(RoadType.Highway);
    expect(sim.getTile(4, 4)!.roadType).toBe(RoadType.Street);
    expect(sim.getTile(6, 4)!.roadType).toBe(RoadType.Street);
  });

  it('should keep the trolley tool a road tool with its own name and price', () => {
    const tool = new TrolleyAvenueTool();
    expect(tool.name).toBe('trolleyAvenue');
    expect(tool.stroke).toBe(true);
    expect(TROLLEY_AVENUE_COST).toBe(ROAD_COST[RoadType.TrolleyAvenue]);
  });
});

describe('traffic on the road network', () => {
  /** Five rowhouses fronting a street on y = 4, x = 1..9. */
  function housesOnStreet(): CitySim {
    const sim = makeSim(16);
    for (let x = 3; x <= 7; x++) build(sim, 'rowhouse', x, 5, ZoneType.Residential);
    street(sim, row(1, 9, 4));
    return sim;
  }

  it('should put no traffic on roads a lot cannot drive to', () => {
    const sim = housesOnStreet();
    // A separate street two rows behind the houses, never joined up.
    street(sim, row(3, 7, 7));
    expect(sim.getTile(5, 4)!.trafficPressure).toBeGreaterThan(0);
    expect(sim.getTile(5, 7)!.trafficPressure).toBe(0);
  });

  it('should make no trips from a lot with no street', () => {
    const sim = makeSim(16);
    build(sim, 'rowhouse', 5, 5, ZoneType.Residential);
    street(sim, row(3, 7, 7));
    expect(sim.getTile(5, 7)!.trafficPressure).toBe(0);
  });

  it('should relieve a busy street when a connected parallel street is added', () => {
    const sim = housesOnStreet();
    const before = sim.getTile(5, 4)!.trafficPressure;
    street(sim, [...row(1, 9, 6), ...column(1, 5, 5), ...column(9, 5, 5)]);
    const after = sim.getTile(5, 4)!.trafficPressure;
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(sim.getTile(5, 6)!.trafficPressure).toBeGreaterThan(0);
  });

  it('should relieve more with a parallel highway than a parallel street', () => {
    const withStreet = housesOnStreet();
    street(withStreet, [...row(1, 9, 6), ...column(1, 5, 5), ...column(9, 5, 5)]);
    const withHighway = housesOnStreet();
    street(withHighway, row(1, 9, 6), RoadType.Highway);
    street(withHighway, [...column(1, 5, 5), ...column(9, 5, 5)]);

    expect(withHighway.getTile(5, 4)!.trafficPressure)
      .toBeLessThan(withStreet.getTile(5, 4)!.trafficPressure);
    expect(roadCapacity(RoadType.Highway)).toBe(HIGHWAY_CAPACITY);
    expect(roadCapacity(RoadType.Street)).toBe(1);
  });

  it('should carry traffic over a bridge to the far bank', () => {
    const sim = makeSim(16);
    water(sim, column(8, 0, 15));
    build(sim, 'rowhouse', 7, 5, ZoneType.Residential);
    build(sim, 'rowhouse', 6, 5, ZoneType.Residential);
    street(sim, row(4, 7, 4));
    street(sim, row(9, 10, 4));
    expect(sim.getTile(9, 4)!.trafficPressure).toBe(0);

    street(sim, [[8, 4]]);
    expect(sim.getTile(8, 4)!.trafficPressure).toBeGreaterThan(0);
    expect(sim.getTile(9, 4)!.trafficPressure).toBeGreaterThan(0);
  });
});

describe('bridge helpers on a bare map', () => {
  it('should treat only roads on water as bridges', () => {
    const map = new CityMap(4, 4);
    map.getTile(1, 1)!.terrain = TerrainType.Water;
    expect(isBridge(map.getTile(1, 1))).toBe(false);
    map.getTile(1, 1)!.roadType = RoadType.Street;
    expect(isBridge(map.getTile(1, 1))).toBe(true);
    map.getTile(2, 2)!.roadType = RoadType.Street;
    expect(isBridge(map.getTile(2, 2))).toBe(false);
  });
});
