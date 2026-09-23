// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import { RoadType, TerrainType } from './CityTile';
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
 *
 * Each tile is drawn as four triangles around a centre point at the average
 * of its corners ({@link writeTileFan}); {@link sample} follows exactly that
 * surface, so anything placed with it sits on the ground the player sees.
 *
 * Land road tiles are graded: corners they touch are pulled to the level of
 * the roads there, so hills do not poke through decks. Corners on the
 * shoreline are never graded, so the water's edge keeps its shape.
 */
export class HeightField {
  readonly width: number;
  readonly height: number;
  /** Terrain and hills only. */
  private readonly _natural: Float32Array;
  /** What is drawn: natural corners, graded under land roads. */
  private readonly _corners: Float32Array;
  /** 1 where a corner touches water (shoreline; never graded). */
  private readonly _wet: Uint8Array;

  private constructor(width: number, height: number, natural: Float32Array, wet: Uint8Array) {
    this.width = width;
    this.height = height;
    this._natural = natural;
    this._corners = new Float32Array(natural);
    this._wet = wet;
  }

  static fromMap(map: CityMap, seed: number = DEFAULT_TERRAIN_SEED): HeightField {
    const width = map.width;
    const height = map.height;
    const natural = new Float32Array((width + 1) * (height + 1));
    const wet = new Uint8Array((width + 1) * (height + 1));

    const noise2D = createSeededNoise2D(`openpublica-hills-${seed}`);
    for (let cy = 0; cy <= height; cy++) {
      for (let cx = 0; cx <= width; cx++) {
        const index = cy * (width + 1) + cx;
        natural[index] = _cornerHeight(map, cx, cy, noise2D);
        wet[index] = cornerWetness(map, cx, cy) > 0 ? 1 : 0;
      }
    }

    const field = new HeightField(width, height, natural, wet);
    field.regrade(map, 0, 0, width - 1, height - 1);
    return field;
  }

  corner(cx: number, cy: number): number {
    return this._corners[this._cornerIndex(cx, cy)];
  }

  /** Corner height before any road grading. */
  naturalCorner(cx: number, cy: number): number {
    return this._natural[this._cornerIndex(cx, cy)];
  }

  /**
   * Re-grade the corners of tiles (x0, y0)–(x1, y1) after roads there changed.
   * Returns every tile that shares a corner whose height moved, so the
   * renderer can re-seat what stands on them.
   */
  regrade(map: CityMap, x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
    const changed = new Map<string, { x: number; y: number }>();
    const cx0 = Math.max(0, x0);
    const cy0 = Math.max(0, y0);
    const cx1 = Math.min(this.width, x1 + 1);
    const cy1 = Math.min(this.height, y1 + 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const index = this._cornerIndex(cx, cy);
        const next = this._gradedCorner(map, cx, cy);
        if (Math.abs(next - this._corners[index]) < 1e-6) continue;
        this._corners[index] = next;
        for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
          if (map.getTile(tx, ty)) changed.set(`${tx},${ty}`, { x: tx, y: ty });
        }
      }
    }
    return Array.from(changed.values());
  }

  /** Height on the drawn surface at world XZ (TILE_SIZE units). */
  sample(worldX: number, worldZ: number): number {
    let x = Math.max(0, Math.min(this.width, worldX / TILE_SIZE));
    let z = Math.max(0, Math.min(this.height, worldZ / TILE_SIZE));
    let x0 = Math.floor(x);
    let z0 = Math.floor(z);
    if (x0 >= this.width) { x0 = this.width - 1; x = this.width; }
    if (z0 >= this.height) { z0 = this.height - 1; z = this.height; }
    return fanHeight(
      this.corner(x0, z0),
      this.corner(x0 + 1, z0),
      this.corner(x0, z0 + 1),
      this.corner(x0 + 1, z0 + 1),
      x - x0,
      z - z0,
    );
  }

  tileCenter(tx: number, ty: number): number {
    return (this.corner(tx, ty) + this.corner(tx + 1, ty) + this.corner(tx, ty + 1) + this.corner(tx + 1, ty + 1)) / 4;
  }

  /**
   * Mean of a tile's corners that do not touch water. A road along the shore
   * sits at this level (an embankment over the beach) instead of the tile
   * centre, which the waterline corners drag down. Equals {@link tileCenter}
   * away from water.
   */
  dryCenter(tx: number, ty: number): number {
    let sum = 0;
    let dry = 0;
    for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]) {
      if (this._wet[this._cornerIndex(cx, cy)]) continue;
      sum += this.corner(cx, cy);
      dry += 1;
    }
    return dry === 0 ? this.tileCenter(tx, ty) : sum / dry;
  }

  /**
   * Where things stand on a dry tile: its centre, but never within
   * {@link FOOTING_CLEARANCE} of the water plane.
   */
  footing(tx: number, ty: number): number {
    return Math.max(this.tileCenter(tx, ty), WATER_SURFACE_Y + FOOTING_CLEARANCE);
  }

  /** Smooth surface normal at a corner, shared by every tile that touches it. */
  cornerNormal(cx: number, cy: number): [number, number, number] {
    const dx = (this.corner(cx + 1, cy) - this.corner(cx - 1, cy)) / (2 * TILE_SIZE);
    const dz = (this.corner(cx, cy + 1) - this.corner(cx, cy - 1)) / (2 * TILE_SIZE);
    return _normalize(-dx, 1, -dz);
  }

  /** Surface normal at a tile's centre point. */
  centerNormal(tx: number, ty: number): [number, number, number] {
    const h00 = this.corner(tx, ty);
    const h10 = this.corner(tx + 1, ty);
    const h01 = this.corner(tx, ty + 1);
    const h11 = this.corner(tx + 1, ty + 1);
    const dx = ((h10 + h11) - (h00 + h01)) / (2 * TILE_SIZE);
    const dz = ((h01 + h11) - (h00 + h10)) / (2 * TILE_SIZE);
    return _normalize(-dx, 1, -dz);
  }

  private _cornerIndex(cx: number, cy: number): number {
    const x = Math.max(0, Math.min(this.width, cx));
    const y = Math.max(0, Math.min(this.height, cy));
    return y * (this.width + 1) + x;
  }

  /** Natural centre of a tile (before grading). */
  private _naturalCenter(tx: number, ty: number): number {
    return (
      this.naturalCorner(tx, ty) + this.naturalCorner(tx + 1, ty) +
      this.naturalCorner(tx, ty + 1) + this.naturalCorner(tx + 1, ty + 1)
    ) / 4;
  }

  /**
   * A corner touched by land roads sits at the mean natural level of those
   * road tiles. Shoreline corners, and corners with no land road, stay natural.
   */
  private _gradedCorner(map: CityMap, cx: number, cy: number): number {
    let sum = 0;
    let roads = 0;
    for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
      const tile = map.getTile(tx, ty);
      if (!tile) continue;
      if (tile.terrain === TerrainType.Water) return this.naturalCorner(cx, cy);
      if (tile.roadType === RoadType.None) continue;
      sum += this._naturalCenter(tx, ty);
      roads += 1;
    }
    return roads === 0 ? this.naturalCorner(cx, cy) : sum / roads;
  }
}

/**
 * Height inside one tile drawn as four triangles (S, E, N, W) that meet at a
 * centre point at the corners' average. `fx`, `fz` are 0–1 within the tile.
 */
export function fanHeight(
  h00: number,
  h10: number,
  h01: number,
  h11: number,
  fx: number,
  fz: number,
): number {
  const c = (h00 + h10 + h01 + h11) / 4;
  if (fz <= fx && fz <= 1 - fx) {
    const t = 2 * fz;
    return h00 + (fx - fz) * (h10 - h00) + t * (c - h00);
  }
  if (fz >= fx && fz >= 1 - fx) {
    const t = 2 * (1 - fz);
    return h01 + (fx - (1 - fz)) * (h11 - h01) + t * (c - h01);
  }
  if (fx <= fz && fx <= 1 - fz) {
    const t = 2 * fx;
    return h00 + (fz - fx) * (h01 - h00) + t * (c - h00);
  }
  const t = 2 * (1 - fx);
  return h10 + (fz - (1 - fx)) * (h11 - h10) + t * (c - h10);
}

/** Vertices per tile in a fan: four corners (00, 10, 01, 11) then the centre. */
export const FAN_VERTS = 5;

/** Triangles per tile in a fan. */
export const FAN_TRIANGLES = 4;

/**
 * Writes one tile fan (5 verts: corners 00, 10, 01, 11, then centre) into a
 * position buffer, sampled from the drawn surface and lifted by `lift`.
 * `span` < 1 shrinks the tile (overlays leave a hairline gap).
 */
export function writeTileFan(
  positions: Float32Array | number[],
  vertexIndex: number,
  tileX: number,
  tileY: number,
  span: number,
  heights: HeightField,
  lift: number,
): void {
  const x0 = tileX * TILE_SIZE;
  const z0 = tileY * TILE_SIZE;
  const x1 = x0 + span;
  const z1 = z0 + span;
  const xm = x0 + span / 2;
  const zm = z0 + span / 2;
  const p = vertexIndex * 3;
  positions[p]      = x0; positions[p + 1]  = heights.sample(x0, z0) + lift; positions[p + 2]  = z0;
  positions[p + 3]  = x1; positions[p + 4]  = heights.sample(x1, z0) + lift; positions[p + 5]  = z0;
  positions[p + 6]  = x0; positions[p + 7]  = heights.sample(x0, z1) + lift; positions[p + 8]  = z1;
  positions[p + 9]  = x1; positions[p + 10] = heights.sample(x1, z1) + lift; positions[p + 11] = z1;
  positions[p + 12] = xm; positions[p + 13] = heights.sample(xm, zm) + lift; positions[p + 14] = zm;
}

/** Index a tile fan whose first vertex is `vertexIndex` (same winding as the old quads). */
export function writeFanIndices(indices: Uint32Array | number[], indexOffset: number, vertexIndex: number): void {
  const [v00, v10, v01, v11, c] = [0, 1, 2, 3, 4].map((i) => vertexIndex + i);
  const tris = [v00, c, v10, v10, c, v11, v11, c, v01, v01, c, v00];
  for (let i = 0; i < tris.length; i++) indices[indexOffset + i] = tris[i];
}

function _normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
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
