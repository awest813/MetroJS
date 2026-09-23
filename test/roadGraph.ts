import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType } from '../openpublica/src/sim/CityTile';
import {
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
  pickNext,
  summarizeTraffic,
  trolleyLineLengths,
  trolleyTargetCount,
  undirectedEdgeCount,
  vehicleTargetCount,
} from '../openpublica/src/render/roadGraph';

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
});
