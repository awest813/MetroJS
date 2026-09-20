// ⚠️  This file must NOT import anything from @babylonjs/core.

import { RoadType } from './CityTile';
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

const STREET_PROFILE: RoadProfile = { width: 0.40, thickness: 0.055 };
const HIGHWAY_PROFILE: RoadProfile = { width: 0.62, thickness: 0.07 };
const TROLLEY_PROFILE: RoadProfile = { width: 0.50, thickness: 0.06 };

/** True when a tile has any road or trolley. */
export function isRoadTile(map: CityMap, x: number, y: number): boolean {
  const tile = map.getTile(x, y);
  return !!tile && tile.roadType !== RoadType.None;
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
