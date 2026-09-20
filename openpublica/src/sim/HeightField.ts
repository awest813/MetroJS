// ⚠️  This file must NOT import anything from @babylonjs/core.

import { TerrainType } from './CityTile';
import type { CityMap } from './CityMap';
import { DEFAULT_TERRAIN_SEED, terrainHash } from './TerrainGenerator';
import { TILE_SIZE } from '../data/constants';

/** World Y of the water surface plane. Land stays above this. */
export const WATER_SURFACE_Y = 0.06;

/** World Y of lake / river beds. */
export const WATER_BED_Y = -0.62;

const LAND_BASE_Y = 0.20;
const HILL_AMPLITUDE = 0.70;

/**
 * Corner-sampled height map derived from terrain types plus seeded noise.
 * Render-only: does not affect simulation numbers.
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

    for (let cy = 0; cy <= height; cy++) {
      for (let cx = 0; cx <= width; cx++) {
        corners[cy * (width + 1) + cx] = _cornerHeight(map, cx, cy, seed);
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
}

/**
 * Writes one sloped quad (4 verts) into a position buffer.
 * `vertexIndex` is the first vertex index (not the float offset).
 */
export function writeSlopedQuad(
  positions: Float32Array,
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

function _cornerHeight(map: CityMap, cx: number, cy: number, seed: number): number {
  const wet = _waterWeight(map, cx, cy);
  const land = LAND_BASE_Y + HILL_AMPLITUDE * _fbm(cx, cy, seed);
  if (wet <= 0) return land;
  const shore = WATER_SURFACE_Y - 0.12;
  return shore + (WATER_BED_Y - shore) * wet;
}

function _waterWeight(map: CityMap, cx: number, cy: number): number {
  const tiles = [
    map.getTile(cx - 1, cy - 1),
    map.getTile(cx, cy - 1),
    map.getTile(cx - 1, cy),
    map.getTile(cx, cy),
  ];
  let water = 0;
  let count = 0;
  for (const tile of tiles) {
    if (!tile) continue;
    count += 1;
    if (tile.terrain === TerrainType.Water) water += 1;
  }
  if (count === 0) return 0;
  return water / count;
}

function _fbm(x: number, y: number, seed: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 0.13;
  for (let i = 0; i < 4; i++) {
    total += amplitude * (terrainHash(
      Math.floor(x * frequency * 10),
      Math.floor(y * frequency * 10),
      seed + i * 19,
    ) * 2 - 1);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return Math.max(0, Math.min(1, total * 0.5 + 0.5));
}
