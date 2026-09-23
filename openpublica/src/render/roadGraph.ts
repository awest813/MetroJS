// Render-only road network. No Babylon — Jest can load this file.
// Vehicles read trafficPressure; they never write simulation state.

import { RoadType } from '../sim/CityTile';
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
