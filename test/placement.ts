import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { buildingFacing, rotateOffset } from '../openpublica/src/render/buildingFacing';
import { TURN_SPAN, roadNetworkKey, vehiclePose } from '../openpublica/src/render/roadGraph';
import { ROAD_COST, BRIDGE_COST_MULTIPLIER, RoadTool } from '../openpublica/src/tools/RoadTool';
import { formatLinePlan, planRoadLine, roadLineOrder, roadLinePath } from '../openpublica/src/tools/roadLine';
import { TrolleyAvenueTool } from '../openpublica/src/tools/TrolleyAvenueTool';
import { createResidentialLowBrush } from '../openpublica/src/tools/ZoneBrushTool';
import { BulldozeTool } from '../openpublica/src/tools/BulldozeTool';
import { createServiceTools } from '../openpublica/src/tools/serviceCatalog';

function makeSim(money = 100_000): CitySim {
  const sim = CitySim.createCity(16, 16);
  sim.stats.money = money;
  return sim;
}

describe('building facing', () => {
  it('should turn a building toward its only street', () => {
    const map = new CityMap(8, 8);
    map.getTile(4, 3)!.roadType = RoadType.Street; // south of (4, 4)
    expect(buildingFacing(map, 4, 4)).toBeCloseTo(Math.PI);
    map.getTile(4, 3)!.roadType = RoadType.None;
    map.getTile(5, 4)!.roadType = RoadType.Street; // east
    expect(buildingFacing(map, 4, 4)).toBeCloseTo(Math.PI / 2);
  });

  it('should keep the default facing with no street, and ignore bridges', () => {
    const map = new CityMap(8, 8);
    expect(buildingFacing(map, 4, 4)).toBe(0);
    map.getTile(4, 5)!.terrain = TerrainType.Water;
    map.getTile(4, 5)!.roadType = RoadType.Street;
    expect(buildingFacing(map, 4, 4)).toBe(0);
  });

  it('should front the main street on a corner lot', () => {
    const map = new CityMap(8, 8);
    map.getTile(4, 5)!.roadType = RoadType.Street; // north
    map.getTile(3, 4)!.roadType = RoadType.TrolleyAvenue; // west
    expect(buildingFacing(map, 4, 4)).toBeCloseTo(-Math.PI / 2);
  });

  it('should turn the kit front (+z) toward the chosen side', () => {
    const east = rotateOffset(0, 1, Math.PI / 2);
    expect(east.dx).toBeCloseTo(1);
    expect(east.dz).toBeCloseTo(0);
    const south = rotateOffset(0, 1, Math.PI);
    expect(south.dz).toBeCloseTo(-1);
  });
});

describe('road lines', () => {
  it('should run the longer axis first and turn once', () => {
    expect(roadLinePath({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 },
    ]);
    expect(roadLinePath({ x: 2, y: 5 }, { x: 1, y: 1 })).toEqual([
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 2, y: 1 }, { x: 1, y: 1 },
    ]);
    expect(roadLinePath({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });

  it('should price bridges and pass through existing roads for free', () => {
    const sim = makeSim();
    sim.getTile(3, 2)!.terrain = TerrainType.Water;
    sim.placeRoad(5, 2, RoadType.Highway);
    const plan = planRoadLine(new RoadTool(), roadLinePath({ x: 1, y: 2 }, { x: 6, y: 2 }), sim);
    expect(plan.tiles.map((t) => t.verdict)).toEqual(['build', 'build', 'bridge', 'build', 'keep', 'build']);
    expect(plan.cost).toBe(ROAD_COST[RoadType.Street] * 4 + ROAD_COST[RoadType.Street] * BRIDGE_COST_MULTIPLIER);
    expect(plan.bridges).toBe(1);
    expect(formatLinePlan('Road', plan)).toMatch(/^Road: 5 tiles, 1 bridge · \$90/);
  });

  it('should see a turn over water coming from earlier tiles in the same line', () => {
    const sim = makeSim();
    for (const [x, y] of [[3, 2], [4, 2], [4, 3]]) sim.getTile(x, y)!.terrain = TerrainType.Water;
    // East along y = 2, then north at x = 4: the corner (4, 2) is on water.
    const plan = planRoadLine(new RoadTool(), roadLinePath({ x: 1, y: 2 }, { x: 4, y: 4 }), sim);
    const corner = plan.tiles.find((t) => t.x === 4 && t.y === 3)!;
    expect(corner.verdict).toBe('blocked');
    expect(corner.reason).toBe('bridge-turn');
    expect(formatLinePlan('Road', plan)).toMatch(/^Road: 5 tiles, 2 bridges · .*bridges run straight/);
  });

  it('should skip spans a line would leave alone in the water, and lay a line from its shore end', () => {
    const sim = makeSim();
    for (let y = 0; y < 16; y++) for (const x of [5, 6, 7, 8]) sim.getTile(x, y)!.terrain = TerrainType.Water;
    // Out in the lake and back: nothing touches a road, so nothing is bought.
    const lake = planRoadLine(new RoadTool(), roadLinePath({ x: 6, y: 9 }, { x: 6, y: 5 }), sim);
    expect(lake.built).toBe(0);
    expect(lake.blocked.every((t) => t.reason === 'bridge-stranded')).toBe(true);
    expect(formatLinePlan('Road', lake)).toMatch(/nothing new to build here · 5 skipped \(bridges start from a road\)/);

    // Anchored out on the water and dragged to the shore: laid from the shore, a pier.
    const path = roadLinePath({ x: 7, y: 3 }, { x: 10, y: 3 });
    expect(planRoadLine(new RoadTool(), path, sim).built).toBe(2);
    const ordered = roadLineOrder(path, sim.map);
    expect(ordered[0]).toEqual({ x: 10, y: 3 });
    const pier = planRoadLine(new RoadTool(), ordered, sim);
    expect(pier.built).toBe(4);
    expect(pier.bridges).toBe(2);
    // From the shore already, or beside a road, the order stays as drawn.
    expect(roadLineOrder(roadLinePath({ x: 2, y: 3 }, { x: 10, y: 3 }), sim.map)[0]).toEqual({ x: 2, y: 3 });
  });

  it('should count the highways a trolley line crosses at grade', () => {
    const sim = makeSim();
    for (let y = 0; y < 16; y++) sim.placeRoad(6, y, RoadType.Highway);
    sim.placeRoad(9, 4, RoadType.Street);
    const plan = planRoadLine(new TrolleyAvenueTool(), roadLinePath({ x: 2, y: 4 }, { x: 12, y: 4 }), sim);
    expect(plan.crossings).toBe(1);
    expect(plan.tiles.find((t) => t.x === 9)!.verdict).toBe('upgrade');
    expect(formatLinePlan('Trolley Ave', plan)).toMatch(/^Trolley Ave: 10 tiles · \$290 · crosses a highway at grade · release/);
    expect(planRoadLine(new RoadTool(), roadLinePath({ x: 2, y: 4 }, { x: 12, y: 4 }), sim).crossings).toBe(0);
  });

  it('should stop spending when the treasury runs out, as release would', () => {
    const sim = makeSim(ROAD_COST[RoadType.Street] * 3);
    const plan = planRoadLine(new RoadTool(), roadLinePath({ x: 0, y: 0 }, { x: 5, y: 0 }), sim);
    expect(plan.built).toBe(3);
    expect(plan.blocked.every((t) => t.reason === 'funds')).toBe(true);
    expect(plan.blocked).toHaveLength(3);
  });

  it('should upgrade streets along a highway line', () => {
    const sim = makeSim();
    sim.placeRoad(2, 2, RoadType.Street);
    const plan = planRoadLine(new RoadTool(RoadType.Highway), roadLinePath({ x: 1, y: 2 }, { x: 3, y: 2 }), sim);
    expect(plan.tiles.map((t) => t.verdict)).toEqual(['build', 'upgrade', 'build']);
    // The street was paid for when it was laid: the upgrade costs the difference.
    expect(plan.tiles.map((t) => t.cost)).toEqual([25, 15, 25]);
    expect(plan.cost).toBe(65);
  });

  it('should skip buildings in the way', () => {
    const sim = makeSim();
    expect(sim.placeServiceBuilding(3, 3, 'small_park', 0)).toBe(true);
    const plan = planRoadLine(new RoadTool(), roadLinePath({ x: 1, y: 3 }, { x: 5, y: 3 }), sim);
    expect(plan.blocked.map((t) => t.reason)).toEqual(['building']);
  });
});

describe('tool dry runs', () => {
  it('should say where a zone brush, bulldozer, road, or station would refuse', () => {
    const sim = makeSim();
    sim.getTile(1, 1)!.terrain = TerrainType.Water;
    const zone = createResidentialLowBrush();
    expect(zone.canApply({ x: 2, y: 2 }, sim)).toBe(true);
    expect(zone.canApply({ x: 1, y: 1 }, sim)).toBe(false);
    sim.setZone(2, 2, ZoneType.Residential);
    expect(zone.canApply({ x: 2, y: 2 }, sim)).toBe(false);

    const dozer = new BulldozeTool();
    expect(dozer.canApply({ x: 2, y: 2 }, sim)).toBe(true);
    expect(dozer.canApply({ x: 5, y: 5 }, sim)).toBe(false);

    const road = new RoadTool();
    expect(road.canApply({ x: 5, y: 5 }, sim)).toBe(true);

    const [plant] = createServiceTools();
    expect(plant.canApply({ x: 1, y: 1 }, sim)).toBe(false);
    expect(plant.canApply({ x: 6, y: 6 }, sim)).toBe(true);
    sim.stats.money = 0;
    expect(plant.canApply({ x: 6, y: 6 }, sim)).toBe(false);
  });

  it('should leave the map untouched', () => {
    const sim = makeSim();
    const money = sim.stats.money;
    createResidentialLowBrush().canApply({ x: 3, y: 3 }, sim);
    new RoadTool().canApply({ x: 4, y: 4 }, sim);
    expect(sim.stats.money).toBe(money);
    expect(sim.getTile(3, 3)!.zoneType).toBe(ZoneType.None);
    expect(sim.getTile(4, 4)!.roadType).toBe(RoadType.None);
  });
});

describe('vehicle turns', () => {
  const A = { x: 0.5, z: 0.5 };
  const B = { x: 1.5, z: 0.5 };
  const C = { x: 1.5, z: 1.5 };
  const off = 0.1;

  it('should meet itself at the node from both edges', () => {
    const before = vehiclePose(null, A, B, C, 1 - 1e-9, off);
    const after = vehiclePose(A, B, C, null, 1e-9, off);
    expect(before.x).toBeCloseTo(after.x, 5);
    expect(before.z).toBeCloseTo(after.z, 5);
    expect(before.heading).toBeCloseTo(after.heading, 4);
  });

  it('should join the straight lane where the curve ends', () => {
    const curved = vehiclePose(A, B, C, null, TURN_SPAN, off);
    const straight = vehiclePose(null, B, C, null, TURN_SPAN, off);
    expect(curved.x).toBeCloseTo(straight.x, 6);
    expect(curved.z).toBeCloseTo(straight.z, 6);
  });

  it('should drive straight through a straight junction', () => {
    const D = { x: 2.5, z: 0.5 };
    for (const t of [0.8, 0.9, 0.99]) {
      expect(vehiclePose(null, A, B, D, t, off).z).toBeCloseTo(0.5 + off, 6);
      expect(vehiclePose(null, A, B, D, t, off).heading).toBeCloseTo(Math.PI / 2, 6);
    }
  });

  it('should turn heading smoothly through a corner', () => {
    const headings = [0.72, 0.8, 0.9, 0.99].map((t) => vehiclePose(null, A, B, C, t, off).heading);
    for (let i = 1; i < headings.length; i++) expect(headings[i]).toBeLessThanOrEqual(headings[i - 1] + 1e-9);
    expect(headings[0]).toBeCloseTo(Math.PI / 2, 1);
  });

  it('should loop a dead-end U-turn onto the opposite lane', () => {
    // Out along A → B, turn at the dead end B, back along B → A.
    const out = vehiclePose(null, A, B, A, 1 - TURN_SPAN, off);
    const back = vehiclePose(A, B, A, null, TURN_SPAN, off);
    const node = vehiclePose(A, B, A, null, 0, off);
    expect(Math.sign(out.z - 0.5)).toBe(-Math.sign(back.z - 0.5));
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.heading)).toBe(true);
  });
});

describe('road network key', () => {
  it('should change only when the roads do', () => {
    const sim = makeSim();
    sim.placeRoad(3, 3, RoadType.Street);
    const key = roadNetworkKey(sim.map);
    sim.setZone(5, 5, ZoneType.Residential);
    sim.getTile(3, 3)!.trafficPressure = 12;
    expect(roadNetworkKey(sim.map)).toBe(key);
    sim.placeRoad(4, 3, RoadType.Street);
    const longer = roadNetworkKey(sim.map);
    expect(longer).not.toBe(key);
    sim.placeRoad(4, 3, RoadType.TrolleyAvenue);
    expect(roadNetworkKey(sim.map)).not.toBe(longer);
  });
});
