// Render-only road network. No Babylon — Jest can load this file.
// Vehicles read trafficPressure; they never write simulation state.

import { RoadType, TerrainType } from '../sim/CityTile';
import type { CityMap } from '../sim/CityMap';
import { MIN_TROLLEY_LINE_TILES, trolleyLines } from '../sim/TransitSystem';

export type NodeKey = string;

export interface RoadNode {
  readonly x: number;
  readonly y: number;
}

export interface RoadGraph {
  readonly nodes: ReadonlyMap<NodeKey, RoadNode>;
  readonly adj: ReadonlyMap<NodeKey, readonly NodeKey[]>;
  readonly roadTileCount: number;
  readonly trolleyTileCount: number;
}

export const MAX_VEHICLES = 48;
export const BASE_CAR_SPEED = 1.2;
export const BASE_TROLLEY_SPEED = 0.85;

/** Cars run this much faster on a highway than on a street. */
export const HIGHWAY_SPEED_FACTOR = 1.5;

/** Edge pressure that halves a car's free-flow speed (matches the extreme-traffic bar). */
export const HALF_SPEED_PRESSURE = 8;

/** Slowest a jammed car crawls, as a share of its free-flow speed. */
export const MIN_SPEED_SHARE = 0.3;

/** Tiles of trolley line per running trolley. */
export const TILES_PER_TROLLEY = 8;

/** Trolleys on screen at once, across every line. */
export const MAX_TROLLEYS = 6;

export function nodeKey(x: number, y: number): NodeKey {
  return `${x},${y}`;
}

export function parseNodeKey(key: NodeKey): RoadNode {
  const comma = key.indexOf(',');
  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  };
}

const CARDINALS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

function emptyGraph(): RoadGraph {
  return {
    nodes: new Map(),
    adj: new Map(),
    roadTileCount: 0,
    trolleyTileCount: 0,
  };
}

function isRoad(map: CityMap, x: number, y: number): boolean {
  const tile = map.getTile(x, y);
  return !!tile && tile.roadType !== RoadType.None;
}

function buildFilteredGraph(
  map: CityMap,
  include: (x: number, y: number) => boolean,
): RoadGraph {
  const nodes = new Map<NodeKey, RoadNode>();
  const adj = new Map<NodeKey, NodeKey[]>();
  let roadTileCount = 0;
  let trolleyTileCount = 0;

  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    roadTileCount += 1;
    if (tile.roadType === RoadType.TrolleyAvenue) trolleyTileCount += 1;
    if (!include(tile.x, tile.y)) return;
    const key = nodeKey(tile.x, tile.y);
    nodes.set(key, { x: tile.x, y: tile.y });
    adj.set(key, []);
  });

  for (const node of nodes.values()) {
    const key = nodeKey(node.x, node.y);
    const nbrs = adj.get(key)!;
    for (const [dx, dy] of CARDINALS) {
      const nx = node.x + dx;
      const ny = node.y + dy;
      const nKey = nodeKey(nx, ny);
      if (nodes.has(nKey)) nbrs.push(nKey);
    }
  }

  return { nodes, adj, roadTileCount, trolleyTileCount };
}

/**
 * Fingerprint of everything the road graphs read: which tiles are roads, of
 * what type, over land or water. Equal keys mean the graphs would be equal.
 */
export function roadNetworkKey(map: CityMap): string {
  let hash = 0x811c9dc5;
  let roads = 0;
  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    roads += 1;
    const water = tile.terrain === TerrainType.Water ? 1 : 0;
    const value = ((tile.y * map.width + tile.x) * 8 + tile.roadType * 2 + water) >>> 0;
    hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  });
  return `${roads}:${hash}`;
}

/** Nodes at every road tile centre; undirected edges to N/E/S/W roads. */
export function buildRoadGraph(map: CityMap): RoadGraph {
  return buildFilteredGraph(map, (x, y) => isRoad(map, x, y));
}

/**
 * Subgraph of trolley lines long enough to run a trolley (cars stay on the
 * full road graph). Short stubs are left out so no trolley shuttles on them.
 */
export function buildTrolleyGraph(map: CityMap): RoadGraph {
  const running = new Set<string>();
  for (const line of trolleyLines(map)) {
    if (line.length < MIN_TROLLEY_LINE_TILES) continue;
    for (const tile of line) running.add(nodeKey(tile.x, tile.y));
  }
  return buildFilteredGraph(map, (x, y) => running.has(nodeKey(x, y)));
}

export function undirectedEdgeCount(graph: RoadGraph): number {
  let sum = 0;
  for (const nbrs of graph.adj.values()) sum += nbrs.length;
  return sum / 2;
}

export function nodesWithEdges(graph: RoadGraph): NodeKey[] {
  const keys: NodeKey[] = [];
  for (const [key, nbrs] of graph.adj) {
    if (nbrs.length > 0) keys.push(key);
  }
  return keys;
}

/**
 * Next hop from `current`. Prefers any neighbour except `prev` (no reverse)
 * unless the node is a dead-end, in which case it u-turns.
 */
export function pickNext(
  graph: RoadGraph,
  prev: NodeKey | null,
  current: NodeKey,
  rng: () => number,
): NodeKey | null {
  const nbrs = graph.adj.get(current);
  if (!nbrs || nbrs.length === 0) return null;
  const forward = prev === null ? nbrs : nbrs.filter((n) => n !== prev);
  const choices = forward.length > 0 ? forward : nbrs;
  const i = Math.min(choices.length - 1, Math.floor(rng() * choices.length));
  return choices[i] ?? null;
}

export function edgeExists(graph: RoadGraph, from: NodeKey, to: NodeKey): boolean {
  const nbrs = graph.adj.get(from);
  return !!nbrs && nbrs.includes(to);
}

export function summarizeTraffic(map: CityMap): {
  totalPressure: number;
  roadTileCount: number;
  trolleyTileCount: number;
} {
  let totalPressure = 0;
  let roadTileCount = 0;
  let trolleyTileCount = 0;
  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    roadTileCount += 1;
    totalPressure += tile.trafficPressure;
    if (tile.roadType === RoadType.TrolleyAvenue) trolleyTileCount += 1;
  });
  return { totalPressure, roadTileCount, trolleyTileCount };
}

/** Density from city-wide pressure. A two-tile street still gets a car. */
export function vehicleTargetCount(totalPressure: number, roadTileCount: number): number {
  const bonus = roadTileCount >= 4 ? 2 : roadTileCount >= 2 ? 1 : 0;
  return Math.max(0, Math.min(MAX_VEHICLES, Math.round(totalPressure / 4) + bonus));
}

/**
 * Trolleys to run: one per {@link TILES_PER_TROLLEY} tiles of each running
 * line (at least one per line), capped at {@link MAX_TROLLEYS}.
 */
export function trolleyTargetCount(lineLengths: readonly number[]): number {
  let total = 0;
  for (const length of lineLengths) {
    if (length < MIN_TROLLEY_LINE_TILES) continue;
    total += Math.max(1, Math.floor(length / TILES_PER_TROLLEY));
  }
  return Math.min(MAX_TROLLEYS, total);
}

/** Tile counts of each connected trolley line. */
export function trolleyLineLengths(map: CityMap): number[] {
  return trolleyLines(map).map((line) => line.length);
}

/**
 * Car speed on an edge: free flow on an empty road (faster on highways),
 * half speed at {@link HALF_SPEED_PRESSURE}, never below {@link MIN_SPEED_SHARE}.
 */
export function edgeSpeedTilesPerSec(
  pressure: number,
  base: number = BASE_CAR_SPEED,
  highway = false,
): number {
  const free = base * (highway ? HIGHWAY_SPEED_FACTOR : 1);
  const share = 1 / (1 + Math.max(0, pressure) / HALF_SPEED_PRESSURE);
  return free * Math.max(MIN_SPEED_SHARE, share);
}

/** Least spacing, in tiles, between two vehicles on the same edge and lane. */
export const FOLLOW_GAP = 0.34;

export interface Mover {
  readonly from: NodeKey;
  readonly to: NodeKey;
  readonly lane: number;
  readonly t: number;
}

/**
 * Where each mover would be after advancing `steps[i]` along its edge, held at
 * least {@link FOLLOW_GAP} behind the vehicle ahead in the same lane so cars
 * queue instead of driving through each other. Nobody reverses. Values may
 * pass 1 (the caller rolls those onto the next edge).
 */
export function advanceWithGaps(movers: readonly Mover[], steps: readonly number[], gap = FOLLOW_GAP): number[] {
  const next = movers.map((m, i) => m.t + Math.max(0, steps[i]));
  const lanes = new Map<string, number[]>();
  movers.forEach((m, i) => {
    const key = `${m.from}>${m.to}:${m.lane}`;
    const list = lanes.get(key);
    if (list) list.push(i);
    else lanes.set(key, [i]);
  });
  for (const list of lanes.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => movers[b].t - movers[a].t || a - b);
    for (let k = 1; k < list.length; k++) {
      const ahead = next[list[k - 1]];
      const i = list[k];
      next[i] = Math.max(movers[i].t, Math.min(next[i], ahead - gap));
    }
  }
  return next;
}

/** Share of an edge each side of a node spent rounding the corner. */
export const TURN_SPAN = 0.3;

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface VehiclePose {
  readonly x: number;
  readonly z: number;
  /** Radians around Y, 0 facing +z. */
  readonly heading: number;
}

function lanePoint(a: Vec2, b: Vec2, t: number, offset: number): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: a.x + dx * t + (-dz / len) * offset,
    z: a.z + dz * t + (dx / len) * offset,
  };
}

/**
 * Control point for the curve through node `b` from edge a→b to b→c, in the
 * lane `offset` to the right. Straight on stays straight; a turn meets where
 * the two lanes cross; a dead-end U-turn loops just past the node.
 */
function cornerControl(a: Vec2, b: Vec2, c: Vec2, offset: number, p0: Vec2, p2: Vec2): Vec2 {
  const inX = b.x - a.x;
  const inZ = b.z - a.z;
  const outX = c.x - b.x;
  const outZ = c.z - b.z;
  const inLen = Math.hypot(inX, inZ) || 1;
  const outLen = Math.hypot(outX, outZ) || 1;
  const dot = (inX * outX + inZ * outZ) / (inLen * outLen);
  if (dot > 0.999) return { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
  if (dot < -0.999) return { x: b.x + (inX / inLen) * TURN_SPAN, z: b.z + (inZ / inLen) * TURN_SPAN };
  return {
    x: b.x + (-inZ / inLen) * offset + (-outZ / outLen) * offset,
    z: b.z + (inX / inLen) * offset + (outX / outLen) * offset,
  };
}

/**
 * Where a vehicle at `t` along from→to sits, in its lane, rounding the node
 * behind it (from `prev`) and the node ahead (toward `next`) so its lane never
 * jumps sides at a junction. Without a neighbour it drives the straight lane.
 */
export function vehiclePose(
  prev: Vec2 | null,
  from: Vec2,
  to: Vec2,
  next: Vec2 | null,
  t: number,
  offset: number,
): VehiclePose {
  let a: Vec2;
  let b: Vec2;
  let c: Vec2;
  let u: number;
  if (next && t > 1 - TURN_SPAN) {
    [a, b, c] = [from, to, next];
    u = (t - (1 - TURN_SPAN)) / (2 * TURN_SPAN);
  } else if (prev && t < TURN_SPAN) {
    [a, b, c] = [prev, from, to];
    u = 0.5 + t / (2 * TURN_SPAN);
  } else {
    const p = lanePoint(from, to, t, offset);
    return { x: p.x, z: p.z, heading: Math.atan2(to.x - from.x, to.z - from.z) };
  }
  const p0 = lanePoint(a, b, 1 - TURN_SPAN, offset);
  const p2 = lanePoint(b, c, TURN_SPAN, offset);
  const p1 = cornerControl(a, b, c, offset, p0, p2);
  const w0 = (1 - u) * (1 - u);
  const w1 = 2 * u * (1 - u);
  const w2 = u * u;
  const dx = 2 * (1 - u) * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
  const dz = 2 * (1 - u) * (p1.z - p0.z) + 2 * u * (p2.z - p1.z);
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x,
    z: w0 * p0.z + w1 * p1.z + w2 * p2.z,
    heading: Math.atan2(dx, dz),
  };
}

/** True when both ends of the edge are highway tiles. */
export function edgeIsHighway(map: CityMap, from: NodeKey, to: NodeKey): boolean {
  const a = parseNodeKey(from);
  const b = parseNodeKey(to);
  return map.getTile(a.x, a.y)?.roadType === RoadType.Highway &&
    map.getTile(b.x, b.y)?.roadType === RoadType.Highway;
}

export function edgePressure(map: CityMap, from: NodeKey, to: NodeKey): number {
  const a = parseNodeKey(from);
  const b = parseNodeKey(to);
  const pa = map.getTile(a.x, a.y)?.trafficPressure ?? 0;
  const pb = map.getTile(b.x, b.y)?.trafficPressure ?? 0;
  return (pa + pb) / 2;
}

export { emptyGraph };
