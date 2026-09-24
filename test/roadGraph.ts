import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType } from '../openpublica/src/sim/CityTile';
import {
  FOLLOW_GAP,
  advanceWithGaps,
  BASE_CAR_SPEED,
  HALF_SPEED_PRESSURE,
  HIGHWAY_SPEED_FACTOR,
  MAX_TROLLEYS,
  MIN_SPEED_SHARE,
  buildRoadGraph,
  buildTrolleyGraph,
  edgeExists,
  edgeIsHighway,
  edgePressure,
  edgeSpeedTilesPerSec,
  nodeKey,
  pickCarStart,
  pickCommuteNext,
  pickNext,
  summarizeTraffic,
  trolleyLineLengths,
  trolleyTargetCount,
  undirectedEdgeCount,
  vehicleTargetCount,
} from '../openpublica/src/render/roadGraph';
import { routeCommutes } from '../openpublica/src/sim/commutes';

function paintLine(map: CityMap, coords: Array<[number, number]>, type: RoadType = RoadType.Street): void {
  for (const [x, y] of coords) {
    map.getTile(x, y)!.roadType = type;
  }
}

describe('roadGraph', () => {
  it('should give an isolated road tile a node and no edges', () => {
    const map = new CityMap(8, 8);
    map.getTile(3, 3)!.roadType = RoadType.Street;
    const graph = buildRoadGraph(map);
    expect(graph.nodes.size).toBe(1);
    expect(graph.adj.get(nodeKey(3, 3))).toEqual([]);
    expect(undirectedEdgeCount(graph)).toBe(0);
  });

  it('should connect a 3-tile line with two undirected edges', () => {
    const map = new CityMap(8, 8);
    paintLine(map, [[1, 2], [2, 2], [3, 2]]);
    const graph = buildRoadGraph(map);
    expect(graph.nodes.size).toBe(3);
    expect(undirectedEdgeCount(graph)).toBe(2);
    expect(edgeExists(graph, nodeKey(1, 2), nodeKey(2, 2))).toBe(true);
    expect(edgeExists(graph, nodeKey(2, 2), nodeKey(3, 2))).toBe(true);
    expect(edgeExists(graph, nodeKey(1, 2), nodeKey(3, 2))).toBe(false);
  });

  it('should u-turn at a dead-end when the only neighbour is prev', () => {
    const map = new CityMap(8, 8);
    paintLine(map, [[0, 0], [1, 0]]);
    const graph = buildRoadGraph(map);
    const next = pickNext(graph, nodeKey(1, 0), nodeKey(0, 0), () => 0);
    expect(next).toBe(nodeKey(1, 0));
  });

  it('should not reverse at an interior node when another hop exists', () => {
    const map = new CityMap(8, 8);
    paintLine(map, [[1, 2], [2, 2], [3, 2]]);
    const graph = buildRoadGraph(map);
    const next = pickNext(graph, nodeKey(1, 2), nodeKey(2, 2), () => 0);
    expect(next).toBe(nodeKey(3, 2));
  });

  it('should scale density from pressure and still seed a short street', () => {
    expect(vehicleTargetCount(0, 3)).toBe(1);
    expect(vehicleTargetCount(0, 4)).toBe(2);
    expect(vehicleTargetCount(20, 10)).toBe(7);
    expect(vehicleTargetCount(400, 64)).toBe(48);
  });

  it('should run trolleys straight over a level crossing, never onto the road it crosses', () => {
    const map = new CityMap(12, 12);
    paintLine(map, [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5]], RoadType.Highway);
    paintLine(map, [[3, 2], [3, 3], [3, 4], [3, 6], [3, 7], [3, 8]], RoadType.TrolleyAvenue);
    expect(trolleyLineLengths(map)).toEqual([7]);
    const trolley = buildTrolleyGraph(map);
    expect(trolley.nodes.has(nodeKey(3, 5))).toBe(true);
    expect([...trolley.adj.get(nodeKey(3, 5))!].sort()).toEqual([nodeKey(3, 4), nodeKey(3, 6)].sort());
    expect(trolley.nodes.has(nodeKey(2, 5))).toBe(false);
    // Cars still cross on the full road graph.
    expect(edgeExists(buildRoadGraph(map), nodeKey(2, 5), nodeKey(3, 5))).toBe(true);
  });

  it('should run trolleys per line, never on a short stub', () => {
    expect(trolleyTargetCount([3])).toBe(0);
    expect(trolleyTargetCount([4])).toBe(1);
    expect(trolleyTargetCount([16])).toBe(2);
    expect(trolleyTargetCount([4, 4, 2])).toBe(2);
    expect(trolleyTargetCount([64, 64])).toBe(MAX_TROLLEYS);

    const map = new CityMap(8, 8);
    paintLine(map, [[0, 1], [1, 1], [2, 1], [3, 1]], RoadType.TrolleyAvenue);
    paintLine(map, [[6, 6], [7, 6]], RoadType.TrolleyAvenue);
    map.getTile(1, 2)!.roadType = RoadType.Street;
    const trolley = buildTrolleyGraph(map);
    expect(trolley.nodes.size).toBe(4);
    expect(trolley.nodes.has(nodeKey(6, 6))).toBe(false);
    expect(trolley.adj.get(nodeKey(1, 1))?.includes(nodeKey(1, 2))).toBe(false);
    expect(trolleyLineLengths(map).sort()).toEqual([2, 4]);
    expect(summarizeTraffic(map).trolleyTileCount).toBe(6);
  });

  it('should slow cars on busy edges without writing tiles', () => {
    const map = new CityMap(4, 4);
    map.getTile(0, 0)!.roadType = RoadType.Street;
    map.getTile(1, 0)!.roadType = RoadType.Street;
    map.getTile(0, 0)!.trafficPressure = 10;
    map.getTile(1, 0)!.trafficPressure = 10;
    expect(edgePressure(map, nodeKey(0, 0), nodeKey(1, 0))).toBe(10);
    expect(edgeSpeedTilesPerSec(0)).toBeCloseTo(BASE_CAR_SPEED);
    expect(edgeSpeedTilesPerSec(HALF_SPEED_PRESSURE)).toBeCloseTo(BASE_CAR_SPEED / 2);
    expect(edgeSpeedTilesPerSec(10)).toBeLessThan(edgeSpeedTilesPerSec(2));
    expect(edgeSpeedTilesPerSec(1000)).toBeCloseTo(BASE_CAR_SPEED * MIN_SPEED_SHARE);
    expect(map.getTile(0, 0)!.trafficPressure).toBe(10);
  });

  it('should let cars run faster on a highway edge', () => {
    const map = new CityMap(4, 4);
    paintLine(map, [[0, 0], [1, 0]], RoadType.Highway);
    paintLine(map, [[2, 0]], RoadType.Street);
    expect(edgeIsHighway(map, nodeKey(0, 0), nodeKey(1, 0))).toBe(true);
    expect(edgeIsHighway(map, nodeKey(1, 0), nodeKey(2, 0))).toBe(false);
    expect(edgeSpeedTilesPerSec(0, BASE_CAR_SPEED, true)).toBeCloseTo(BASE_CAR_SPEED * HIGHWAY_SPEED_FACTOR);
  });

  it('should drive across a bridge like any other road', () => {
    const map = new CityMap(8, 8);
    map.getTile(3, 2)!.terrain = TerrainType.Water;
    paintLine(map, [[2, 2], [3, 2], [4, 2]]);
    const graph = buildRoadGraph(map);
    expect(edgeExists(graph, nodeKey(2, 2), nodeKey(3, 2))).toBe(true);
    expect(edgeExists(graph, nodeKey(3, 2), nodeKey(4, 2))).toBe(true);
  });

  it('should queue cars behind the one ahead instead of stacking them', () => {
    const a = { from: nodeKey(0, 0), to: nodeKey(1, 0), lane: 1, t: 0.5 };
    const b = { from: nodeKey(0, 0), to: nodeKey(1, 0), lane: 1, t: 0.4 };
    const other = { from: nodeKey(0, 0), to: nodeKey(1, 0), lane: -1, t: 0.4 };
    const next = advanceWithGaps([a, b, other], [0.05, 0.3, 0.3]);
    expect(next[0]).toBeCloseTo(0.55);
    // b would pass a; it waits FOLLOW_GAP behind instead.
    expect(next[1]).toBeCloseTo(Math.max(0.4, 0.55 - FOLLOW_GAP));
    // The opposite lane is not held up.
    expect(next[2]).toBeCloseTo(0.7);
  });

  it('should separate two cars spawned on the same spot without reversing', () => {
    const a = { from: nodeKey(0, 0), to: nodeKey(1, 0), lane: 1, t: 0.3 };
    const b = { from: nodeKey(0, 0), to: nodeKey(1, 0), lane: 1, t: 0.3 };
    let movers = [a, b];
    for (let i = 0; i < 10; i++) {
      const next = advanceWithGaps(movers, [0.05, 0.05]);
      expect(next[1]).toBeGreaterThanOrEqual(movers[1].t);
      movers = movers.map((m, k) => ({ ...m, t: next[k] }));
    }
    expect(movers[0].t - movers[1].t).toBeGreaterThanOrEqual(FOLLOW_GAP - 1e-9);
  });
});

describe('commuting cars', () => {
  /** A street along y = 1 from x = 0 to 9: homes on the west, a shop at the east end. */
  function commuteStreet(): { map: CityMap; commutes: ReturnType<typeof routeCommutes> } {
    const map = new CityMap(10, 3);
    paintLine(map, Array.from({ length: 10 }, (_, x) => [x, 1] as [number, number]));
    const commutes = routeCommutes(map, [{ x: 1, y: 0, trips: 2 }, { x: 2, y: 2, trips: 2 }], [{ x: 8, y: 2, jobs: 5 }]);
    return { map, commutes };
  }
  const k = nodeKey;

  it('should drive to work down the commute and home back up it, turning round at each end', () => {
    const { map, commutes } = commuteStreet();
    const graph = buildRoadGraph(map);
    const hop = (prev: string | null, at: string, trip: 'to-work' | 'home') =>
      pickCommuteNext(graph, map, commutes, prev, at, trip, () => 0.5);
    expect(hop(k(2, 1), k(3, 1), 'to-work')).toEqual({ next: k(4, 1), trip: 'to-work' });
    expect(hop(k(6, 1), k(5, 1), 'home')).toEqual({ next: k(4, 1), trip: 'home' });
    // At the shop's street: turn for home.
    expect(hop(k(7, 1), k(8, 1), 'to-work')).toEqual({ next: k(7, 1), trip: 'home' });
    // Back where the first homes' commuters join (nobody drives in from x = 0): turn for work.
    expect(hop(k(2, 1), k(1, 1), 'home')).toEqual({ next: k(2, 1), trip: 'to-work' });
  });

  it('should let a car with no trip, or no commutes to follow, turn at random', () => {
    const { map, commutes } = commuteStreet();
    const graph = buildRoadGraph(map);
    expect(pickCommuteNext(graph, map, commutes, k(4, 1), k(5, 1), null, () => 0).trip).toBeNull();
    expect(pickCommuteNext(graph, map, null, k(4, 1), k(5, 1), 'to-work', () => 0).next).toBe(k(6, 1));
  });

  it('should start cars where the traffic is, and commuters only where commuters drive', () => {
    const { map, commutes } = commuteStreet();
    const graph = buildRoadGraph(map);
    map.getTile(5, 1)!.trafficPressure = 12;
    let seed = 7;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const counts = new Map<string, number>();
    let commuters = 0;
    for (let i = 0; i < 2000; i++) {
      const start = pickCarStart(graph, map, commutes, 0.25, rng)!;
      counts.set(start.node, (counts.get(start.node) ?? 0) + 1);
      if (start.trip !== null) {
        commuters += 1;
        const at = start.node.split(',').map(Number);
        expect(commutes.flow[at[1] * map.width + at[0]]).toBeGreaterThan(0);
      }
    }
    expect(counts.get(k(5, 1))!).toBeGreaterThan(5 * (counts.get(k(0, 1)) ?? 0));
    expect(commuters).toBeGreaterThan(0);
  });
});
