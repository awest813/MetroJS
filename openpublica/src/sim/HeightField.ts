// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import { DEFAULT_TERRAIN_SEED } from './TerrainGenerator';
import { LAND_BASE_Y, WATER_SURFACE_Y, cornerWetness, shoreCornerHeight } from './shoreline';
import { TILE_SIZE } from '../data/constants';
import { createSeededNoise2D } from '../math/seededNoise';

type Noise2 = (x: number, y: number) => number;

export { WATER_BED_Y, WATER_SURFACE_Y } from './shoreline';

const HILL_AMPLITUDE = 0.70;

/**
 * Least gap between the water plane and anything standing on a dry tile
 * (road deck base, building, tree). Only bites on old maps with thin spits.
 */
export const FOOTING_CLEARANCE = 0.04;

/**
 * Corner-sampled height map derived from terrain types plus seeded simplex FBM
 * (`simplex-noise` + `alea`). Render-only: does not affect simulation numbers.
 */
export class HeightField {
  readonly width: number;
  readonly height: number;
  private readonly _corners: Float32Array;

  private constructor(width: number, height: number, corners: Float32Array) {
    this.width = width;
    this.height = height;
    this._corners = corners;
  }

  static fromMap(map: CityMap, seed: number = DEFAULT_TERRAIN_SEED): HeightField {
    const width = map.width;
    const height = map.height;
    const corners = new Float32Array((width + 1) * (height + 1));

    const noise2D = createSeededNoise2D(`openpublica-hills-${seed}`);
    for (let cy = 0; cy <= height; cy++) {
      for (let cx = 0; cx <= width; cx++) {
        corners[cy * (width + 1) + cx] = _cornerHeight(map, cx, cy, noise2D);
      }
    }

    return new HeightField(width, height, corners);
  }

  corner(cx: number, cy: number): number {
    const x = Math.max(0, Math.min(this.width, cx));
    const y = Math.max(0, Math.min(this.height, cy));
    return this._corners[y * (this.width + 1) + x];
  }

  /** Bilinear sample in world XZ (TILE_SIZE units). */
  sample(worldX: number, worldZ: number): number {
    const x = Math.max(0, Math.min(this.width, worldX / TILE_SIZE));
    const z = Math.max(0, Math.min(this.height, worldZ / TILE_SIZE));
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(x0 + 1, this.width);
    const z1 = Math.min(z0 + 1, this.height);
    const fx = x - x0;
    const fz = z - z0;
    const h00 = this.corner(x0, z0);
    const h10 = this.corner(x1, z0);
    const h01 = this.corner(x0, z1);
    const h11 = this.corner(x1, z1);
    return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
  }

  tileCenter(tx: number, ty: number): number {
    return this.sample((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
  }

  /**
   * Where things stand on a dry tile: its centre, but never within
   * {@link FOOTING_CLEARANCE} of the water plane.
   */
  footing(tx: number, ty: number): number {
    return Math.max(this.tileCenter(tx, ty), WATER_SURFACE_Y + FOOTING_CLEARANCE);
  }
}

/**
 * Writes one sloped quad (4 verts) into a position buffer.
 * `vertexIndex` is the first vertex index (not the float offset).
 */
export function writeSlopedQuad(
  positions: Float32Array | number[],
  vertexIndex: number,
  tileX: number,
  tileY: number,
  span: number,
  heights: HeightField,
  lift: number,
): void {
  const x0 = tileX * TILE_SIZE;
  const x1 = x0 + span;
  const z0 = tileY * TILE_SIZE;
  const z1 = z0 + span;
  const p = vertexIndex * 3;
  positions[p]     = x0; positions[p + 1]  = heights.sample(x0, z0) + lift; positions[p + 2]  = z0;
  positions[p + 3] = x1; positions[p + 4]  = heights.sample(x1, z0) + lift; positions[p + 5]  = z0;
  positions[p + 6] = x0; positions[p + 7]  = heights.sample(x0, z1) + lift; positions[p + 8]  = z1;
  positions[p + 9] = x1; positions[p + 10] = heights.sample(x1, z1) + lift; positions[p + 11] = z1;
}

function _cornerHeight(map: CityMap, cx: number, cy: number, noise2D: Noise2): number {
  const land = LAND_BASE_Y + HILL_AMPLITUDE * _fbm(cx, cy, noise2D);
  return shoreCornerHeight(cornerWetness(map, cx, cy), land);
}

function _fbm(x: number, y: number, noise2D: Noise2): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 0.13;
  for (let i = 0; i < 4; i++) {
    total += amplitude * noise2D(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return Math.max(0, Math.min(1, total * 0.5 + 0.5));
}
