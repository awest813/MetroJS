// Render-only layout. No Babylon — Jest can load this file.

import { RoadType } from '../sim/CityTile';
import type { CityMap } from '../sim/CityMap';
import { isLandRoad } from '../sim/roadConnections';

/**
 * Kits model their front (doors, shopfronts, awnings) on +z. Each side's Y
 * rotation turns that front toward a neighbour: +z → +x is a quarter turn.
 */
const SIDES: ReadonlyArray<{ readonly dx: number; readonly dy: number; readonly rotY: number }> = [
  { dx: 0, dy: 1, rotY: 0 },
  { dx: 1, dy: 0, rotY: Math.PI / 2 },
  { dx: 0, dy: -1, rotY: Math.PI },
  { dx: -1, dy: 0, rotY: -Math.PI / 2 },
];

/** A corner lot fronts its main street: trolley avenue, then highway, then street. */
const FRONT_RANK: Record<RoadType, number> = {
  [RoadType.None]: 0,
  [RoadType.Street]: 1,
  [RoadType.Highway]: 2,
  [RoadType.TrolleyAvenue]: 3,
};

/**
 * Y rotation that turns a building on (x, y) to face its street. Bridge decks
 * are not frontage. Ties go north, east, south, west, so the answer only
 * changes when the roads do. A lot with no street keeps the kit's default.
 */
export function buildingFacing(map: CityMap, x: number, y: number): number {
  let best = 0;
  let bestRank = 0;
  for (const side of SIDES) {
    const tile = map.getTile(x + side.dx, y + side.dy);
    if (!tile || !isLandRoad(tile)) continue;
    const rank = FRONT_RANK[tile.roadType];
    if (rank > bestRank) {
      best = side.rotY;
      bestRank = rank;
    }
  }
  return best;
}

/** Rotate a local offset (dx, dz) by `rotY` the way Babylon turns a mesh. */
export function rotateOffset(dx: number, dz: number, rotY: number): { dx: number; dz: number } {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { dx: dx * c + dz * s, dz: -dx * s + dz * c };
}
