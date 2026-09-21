// Render-only road network. No Babylon — Jest can load this file.
// Vehicles read trafficPressure; they never write simulation state.

import { RoadType } from '../sim/CityTile';
import type { CityMap } from '../sim/CityMap';

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

function isTrolley(map: CityMap, x: number, y: number): boolean {
  return map.getTile(x, y)?.roadType === RoadType.TrolleyAvenue;
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

/** Subgraph of trolley-avenue tiles only (cars stay on the full road graph). */
export function buildTrolleyGraph(map: CityMap): RoadGraph {
  const graph = buildFilteredGraph(map, (x, y) => isTrolley(map, x, y));
  return graph;
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

export function trolleyTargetCount(trolleyTileCount: number): number {
  if (trolleyTileCount < 4) return 0;
  return trolleyTileCount >= 8 ? 2 : 1;
}

export function edgeSpeedTilesPerSec(pressure: number, base: number = BASE_CAR_SPEED): number {
  return base * (1 + Math.max(0, pressure) / 20);
}

export function edgePressure(map: CityMap, from: NodeKey, to: NodeKey): number {
  const a = parseNodeKey(from);
  const b = parseNodeKey(to);
  const pa = map.getTile(a.x, a.y)?.trafficPressure ?? 0;
  const pb = map.getTile(b.x, b.y)?.trafficPressure ?? 0;
  return (pa + pb) / 2;
}

export { emptyGraph };
