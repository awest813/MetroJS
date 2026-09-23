// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';
import { RoadType, TerrainType } from './CityTile';
import { ROAD_STEPS } from './roadConnections';

/**
 * Utilities run along the streets. Power lines and water mains follow the
 * road network from each plant or tower; every lot beside a live street takes
 * its share, nearest first, until the network's supply runs out. A source
 * joins the network of every street its lot touches, and sources on one
 * network pool their supply.
 */

export interface UtilitySource {
  readonly x: number;
  readonly y: number;
  readonly capacity: number;
}

/** How much a tile draws: a number (0 for an empty zoned lot), or null when it takes no service. */
export type LoadAt = (tile: CityTile) => number | null;

/** One connected network of streets and the sources on it. */
export interface UtilityNetwork {
  readonly id: number;
  /** Total capacity of the sources on this network. */
  readonly supply: number;
  /** Load drawn by the lots it serves. */
  load: number;
  /** Lots it serves. */
  served: number;
  /** Lots it reaches but cannot serve: the supply ran out first. */
  shortfall: number;
  /** Street tiles it runs along. */
  streets: number;
}

export interface UtilityGrid {
  readonly networks: readonly UtilityNetwork[];
  /** Network id per tile (street, source, or served/short lot), or -1. */
  readonly networkOf: Int32Array;
  /** Per tile: 1 served lot, 2 live street or source, -1 reached but short, 0 untouched. */
  readonly state: Int8Array;
}

export const GRID_UNTOUCHED = 0;
export const GRID_SERVED = 1;
export const GRID_LINE = 2;
export const GRID_SHORT = -1;

function isStreet(tile: CityTile | undefined): boolean {
  return !!tile && tile.roadType !== RoadType.None;
}

/**
 * Distribute every source's supply along the streets. Lots are served in
 * order of road steps from the nearest source on their network.
 */
export function distributeAlongStreets(
  map: CityMap,
  sources: readonly UtilitySource[],
  loadAt: LoadAt,
): UtilityGrid {
  const w = map.width;
  const size = w * map.height;
  const networkOf = new Int32Array(size).fill(-1);
  const state = new Int8Array(size);
  const isSource = new Uint8Array(size);
  const capacityAt = new Float64Array(size);
  for (const s of sources) {
    const tile = map.getTile(s.x, s.y);
    if (!tile) continue;
    isSource[s.y * w + s.x] = 1;
    capacityAt[s.y * w + s.x] += s.capacity;
  }
  const isNode = (tile: CityTile | undefined): boolean =>
    !!tile && (isStreet(tile) || isSource[tile.y * w + tile.x] === 1);

  // Label networks from the sources and pool their supply.
  const networks: UtilityNetwork[] = [];
  for (const s of sources) {
    const start = s.y * w + s.x;
    if (!map.getTile(s.x, s.y) || networkOf[start] !== -1) continue;
    const id = networks.length;
    let supply = 0;
    let streets = 0;
    const stack = [start];
    networkOf[start] = id;
    while (stack.length > 0) {
      const index = stack.pop()!;
      supply += capacityAt[index];
      const x = index % w;
      const y = (index - x) / w;
      if (isStreet(map.getTile(x, y))) streets += 1;
      for (const [dx, dy] of ROAD_STEPS) {
        const next = map.getTile(x + dx, y + dy);
        if (!isNode(next)) continue;
        const ni = next!.y * w + next!.x;
        if (networkOf[ni] !== -1) continue;
        networkOf[ni] = id;
        stack.push(ni);
      }
    }
    networks.push({ id, supply, load: 0, served: 0, shortfall: 0, streets });
  }

  // Walk out from every source at once; lots take service as the walk reaches them.
  const remaining = networks.map((n) => n.supply);
  const seen = new Uint8Array(size);
  let queue: number[] = [];
  for (const s of sources) {
    const index = s.y * w + s.x;
    if (!map.getTile(s.x, s.y) || seen[index]) continue;
    seen[index] = 1;
    queue.push(index);
  }
  while (queue.length > 0) {
    const next: number[] = [];
    for (const index of queue) {
      const id = networkOf[index];
      state[index] = GRID_LINE;
      const x = index % w;
      const y = (index - x) / w;
      for (const [dx, dy] of ROAD_STEPS) {
        const tile = map.getTile(x + dx, y + dy);
        if (!tile) continue;
        const ni = tile.y * w + tile.x;
        if (seen[ni]) continue;
        if (isNode(tile)) {
          seen[ni] = 1;
          next.push(ni);
          continue;
        }
        if (tile.terrain === TerrainType.Water) continue;
        const load = loadAt(tile);
        if (load === null) continue;
        seen[ni] = 1;
        networkOf[ni] = id;
        const network = networks[id];
        const fits = load > 0 ? remaining[id] >= load : remaining[id] > 0;
        if (fits) {
          remaining[id] -= load;
          network.load += load;
          network.served += 1;
          state[ni] = GRID_SERVED;
        } else {
          network.shortfall += 1;
          state[ni] = GRID_SHORT;
        }
      }
    }
    queue = next;
  }

  return { networks, networkOf, state };
}

/** Streets (and the lots beside them) that a source placed at (x, y) would join. */
export function networkReachFrom(map: CityMap, x: number, y: number): Array<{ x: number; y: number }> {
  const w = map.width;
  const seen = new Uint8Array(w * map.height);
  const out: Array<{ x: number; y: number }> = [];
  const stack: Array<{ x: number; y: number }> = [];
  for (const [dx, dy] of ROAD_STEPS) {
    const tile = map.getTile(x + dx, y + dy);
    if (!isStreet(tile)) continue;
    seen[tile!.y * w + tile!.x] = 1;
    stack.push({ x: tile!.x, y: tile!.y });
  }
  while (stack.length > 0) {
    const at = stack.pop()!;
    out.push(at);
    for (const [dx, dy] of ROAD_STEPS) {
      const tile = map.getTile(at.x + dx, at.y + dy);
      if (!isStreet(tile)) continue;
      const index = tile!.y * w + tile!.x;
      if (seen[index]) continue;
      seen[index] = 1;
      stack.push({ x: tile!.x, y: tile!.y });
    }
  }
  return out;
}

/** Tiles of the network that serves (x, y), with their state, or none. */
export function networkTilesAt(
  map: CityMap,
  grid: UtilityGrid,
  x: number,
  y: number,
): Array<{ x: number; y: number; state: number }> {
  const w = map.width;
  if (!map.getTile(x, y)) return [];
  const id = grid.networkOf[y * w + x];
  if (id < 0) return [];
  const out: Array<{ x: number; y: number; state: number }> = [];
  for (let index = 0; index < grid.networkOf.length; index++) {
    if (grid.networkOf[index] !== id || grid.state[index] === GRID_UNTOUCHED) continue;
    const tx = index % w;
    out.push({ x: tx, y: (index - tx) / w, state: grid.state[index] });
  }
  return out;
}
