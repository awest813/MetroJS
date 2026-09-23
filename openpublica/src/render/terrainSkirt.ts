// Render-only layout. No Babylon — Jest can load this file.

import type { CityMap } from '../sim/CityMap';
import { TerrainType } from '../sim/CityTile';
import { WATER_BED_Y, WATER_SURFACE_Y } from '../sim/HeightField';
import { TILE_SIZE } from '../data/constants';

/** Bottom of the wall around the map, a little under the deepest lake bed. */
export const SKIRT_BASE_Y = WATER_BED_Y - 0.3;

/** One wall panel along the map edge under a single tile. */
export interface SkirtSegment {
  /** World X/Z of both ends along the edge. */
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** Top of the wall at each end: the ground, or the water surface over a lake. */
  readonly top0: number;
  readonly top1: number;
  /** Outward normal (unit, horizontal). */
  readonly nx: number;
  readonly nz: number;
  /** True where the edge tile is water, so the wall reads as a cut through the lake. */
  readonly water: boolean;
}

interface Corners {
  corner(cx: number, cy: number): number;
}

/**
 * Wall panels around the four map edges, from the ground (or the water
 * surface over a lake or the river mouth) down to {@link SKIRT_BASE_Y}, so the
 * city reads as a solid block instead of a paper-thin sheet at low angles.
 */
export function skirtSegments(map: CityMap, heights: Corners): SkirtSegment[] {
  const out: SkirtSegment[] = [];
  const top = (cx: number, cy: number, water: boolean): number => {
    const ground = heights.corner(cx, cy);
    return water ? Math.max(ground, WATER_SURFACE_Y) : ground;
  };
  const push = (
    tx: number,
    ty: number,
    a: [number, number],
    b: [number, number],
    nx: number,
    nz: number,
  ): void => {
    const water = map.getTile(tx, ty)?.terrain === TerrainType.Water;
    out.push({
      x0: a[0] * TILE_SIZE,
      z0: a[1] * TILE_SIZE,
      x1: b[0] * TILE_SIZE,
      z1: b[1] * TILE_SIZE,
      top0: top(a[0], a[1], water),
      top1: top(b[0], b[1], water),
      nx,
      nz,
      water,
    });
  };
  const w = map.width;
  const h = map.height;
  for (let x = 0; x < w; x++) {
    push(x, 0, [x, 0], [x + 1, 0], 0, -1);
    push(x, h - 1, [x + 1, h], [x, h], 0, 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y, [0, y + 1], [0, y], -1, 0);
    push(w - 1, y, [w, y], [w, y + 1], 1, 0);
  }
  return out;
}
