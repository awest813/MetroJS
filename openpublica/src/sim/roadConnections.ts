// ⚠️  This file must NOT import anything from @babylonjs/core.

import { RoadType, TerrainType } from './CityTile';
import type { CityTile } from './CityTile';
import type { CityMap } from './CityMap';

export interface RoadNeighbors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface RoadProfile {
  /** Deck width in world units (tile is 1). */
  width: number;
  /** Deck thickness in world units. */
  thickness: number;
}

const STREET_PROFILE: RoadProfile = { width: 0.46, thickness: 0.05 };
const HIGHWAY_PROFILE: RoadProfile = { width: 0.68, thickness: 0.068 };
const TROLLEY_PROFILE: RoadProfile = { width: 0.54, thickness: 0.058 };

/** N, E, S, W offsets in tile space (N is +y, matching world +z). */
export const ROAD_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** True when a tile has any road or trolley. */
export function isRoadTile(map: CityMap, x: number, y: number): boolean {
  const tile = map.getTile(x, y);
  return !!tile && tile.roadType !== RoadType.None;
}

/** A road laid over water is a bridge span. */
export function isBridge(tile: CityTile | undefined): boolean {
  return !!tile && tile.roadType !== RoadType.None && tile.terrain === TerrainType.Water;
}

export function isBridgeAt(map: CityMap, x: number, y: number): boolean {
  return isBridge(map.getTile(x, y));
}

/** A road on dry ground — the only kind a lot can have a driveway onto. */
export function isLandRoad(tile: CityTile | undefined): boolean {
  return !!tile && tile.roadType !== RoadType.None && tile.terrain !== TerrainType.Water;
}

/**
 * True when a lot touches a land road on one of its four sides.
 * Bridge decks have no driveways, so a lot beside a bridge still needs a street.
 */
export function hasRoadFrontage(map: CityMap, x: number, y: number): boolean {
  for (const [dx, dy] of ROAD_STEPS) {
    if (isLandRoad(map.getTile(x + dx, y + dy))) return true;
  }
  return false;
}

/** Which of the four cardinal neighbours are also roads. */
export function roadNeighbors(map: CityMap, x: number, y: number): RoadNeighbors {
  return {
    n: isRoadTile(map, x, y + 1),
    e: isRoadTile(map, x + 1, y),
    s: isRoadTile(map, x, y - 1),
    w: isRoadTile(map, x - 1, y),
  };
}

export function roadProfile(type: RoadType): RoadProfile {
  switch (type) {
    case RoadType.Highway:
      return HIGHWAY_PROFILE;
    case RoadType.TrolleyAvenue:
      return TROLLEY_PROFILE;
    default:
      return STREET_PROFILE;
  }
}

/**
 * Heading in radians around Y for a decorative car on this tile.
 * NS roads face along Z; EW along X; junctions keep 0.
 */
export function roadHeading(neighbors: RoadNeighbors): number {
  const ns = neighbors.n || neighbors.s;
  const ew = neighbors.e || neighbors.w;
  if (ew && !ns) return Math.PI / 2;
  return 0;
}

/** Why a road cannot go on this tile because of a bridge, or null. */
export type BridgeProblem =
  /** The water tile would turn a corner or become a junction. */
  | 'bridge-turn'
  /** A neighbouring bridge would gain a side street. */
  | 'bridge-branch';

/**
 * Bridges run straight: a road over water may only connect along one axis,
 * and nothing may join a bridge from the side. Checks the tile as if it
 * already held a road, plus each neighbouring bridge that would connect to it.
 */
export function bridgeProblem(map: CityMap, x: number, y: number): BridgeProblem | null {
  const here = map.getTile(x, y);
  if (!here) return null;
  const roadAt = (tx: number, ty: number): boolean =>
    (tx === x && ty === y) || isRoadTile(map, tx, ty);

  if (here.terrain === TerrainType.Water && _joinsBothAxes(x, y, roadAt)) {
    return 'bridge-turn';
  }
  for (const [dx, dy] of ROAD_STEPS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isBridgeAt(map, nx, ny)) continue;
    if (_joinsBothAxes(nx, ny, roadAt)) {
      return here.terrain === TerrainType.Water ? 'bridge-turn' : 'bridge-branch';
    }
  }
  return null;
}

function _joinsBothAxes(
  x: number,
  y: number,
  roadAt: (x: number, y: number) => boolean,
): boolean {
  const ns = roadAt(x, y + 1) || roadAt(x, y - 1);
  const ew = roadAt(x + 1, y) || roadAt(x - 1, y);
  return ns && ew;
}

export type BridgeAxis = 'ns' | 'ew';

/** Axis a bridge tile runs along, from its road neighbours. Null when isolated. */
export function bridgeAxis(map: CityMap, x: number, y: number): BridgeAxis | null {
  const n = roadNeighbors(map, x, y);
  if (n.n || n.s) return 'ns';
  if (n.e || n.w) return 'ew';
  return null;
}

/** One bridge span: the water tiles in order, plus the tiles just past each end. */
export interface BridgeSpan {
  readonly axis: BridgeAxis | null;
  readonly tiles: ReadonlyArray<{ x: number; y: number }>;
  /** Tile just before the first span tile (may be a land road, water, or off-map). */
  readonly before: { x: number; y: number };
  /** Tile just after the last span tile. */
  readonly after: { x: number; y: number };
}

/** Longest span the renderer walks; far longer than any lake on a 64 map. */
const MAX_SPAN_WALK = 128;

/** The straight span that contains bridge tile (x, y), or null if it is not a bridge. */
export function bridgeSpanAt(map: CityMap, x: number, y: number): BridgeSpan | null {
  if (!isBridgeAt(map, x, y)) return null;
  const axis = bridgeAxis(map, x, y);
  if (axis === null) {
    return { axis, tiles: [{ x, y }], before: { x, y: y - 1 }, after: { x, y: y + 1 } };
  }
  const [dx, dy] = axis === 'ns' ? [0, 1] : [1, 0];
  let sx = x;
  let sy = y;
  for (let i = 0; i < MAX_SPAN_WALK && isBridgeAt(map, sx - dx, sy - dy); i++) {
    sx -= dx;
    sy -= dy;
  }
  const tiles: Array<{ x: number; y: number }> = [];
  let cx = sx;
  let cy = sy;
  for (let i = 0; i < MAX_SPAN_WALK && isBridgeAt(map, cx, cy); i++) {
    tiles.push({ x: cx, y: cy });
    cx += dx;
    cy += dy;
  }
  return {
    axis,
    tiles,
    before: { x: sx - dx, y: sy - dy },
    after: { x: cx, y: cy },
  };
}
