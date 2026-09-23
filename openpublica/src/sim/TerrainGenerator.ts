// ⚠️  This file must NOT import anything from @babylonjs/core.

import { TerrainType } from './CityTile';
import type { CityMap } from './CityMap';
import { smoothShoreline } from './shoreline';

export const DEFAULT_TERRAIN_SEED = 2026;

/**
 * Paints grass / dirt / water onto a CityMap. Deterministic for a given seed.
 * Does not touch zones, roads, or buildings. Thin spits and notches are
 * smoothed away so every dry tile renders above the water.
 */
export function generateTerrain(map: CityMap, seed: number = DEFAULT_TERRAIN_SEED): void {
  const lakes = [
    { x: map.width * 0.28, y: map.height * 0.34, r: Math.max(4.5, map.width * 0.09) },
    { x: map.width * 0.72, y: map.height * 0.68, r: Math.max(3.8, map.width * 0.075) },
  ];

  map.forEach((tile) => {
    tile.terrain = TerrainType.Grass;
  });

  map.forEach((tile) => {
    if (_isLake(tile.x, tile.y, lakes, seed) || _isRiver(tile.x, tile.y, lakes, map, seed)) {
      tile.terrain = TerrainType.Water;
    }
  });

  smoothShoreline(map);

  map.forEach((tile) => {
    if (tile.terrain === TerrainType.Water) return;
    if (_touchesWater(map, tile.x, tile.y)) {
      tile.terrain = TerrainType.Dirt;
      return;
    }
    if (terrainHash(tile.x, tile.y, seed + 91) < 0.035) {
      tile.terrain = TerrainType.Dirt;
    }
  });
}

function _isLake(
  x: number,
  y: number,
  lakes: ReadonlyArray<{ x: number; y: number; r: number }>,
  seed: number,
): boolean {
  for (const lake of lakes) {
    const dx = x - lake.x;
    const dy = y - lake.y;
    const warp = 0.55 + terrainHash(Math.floor(x), Math.floor(y), seed) * 0.7;
    const r = lake.r * warp;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

function _isRiver(
  x: number,
  y: number,
  lakes: ReadonlyArray<{ x: number; y: number; r: number }>,
  map: CityMap,
  seed: number,
): boolean {
  if (lakes.length < 2) return false;
  const a = lakes[0];
  const b = lakes[1];
  const width = 1.15 + terrainHash(x, y, seed + 3) * 0.55;
  if (_distToSegment(x, y, a.x, a.y, b.x, b.y) < width) return true;
  if (_distToSegment(x, y, b.x, b.y, map.width - 1, b.y + 3) < 1.05) return true;
  return false;
}

function _touchesWater(map: CityMap, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const neighbour = map.getTile(x + dx, y + dy);
      if (neighbour?.terrain === TerrainType.Water) return true;
    }
  }
  return false;
}

function _distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Deterministic 0–1 hash. Shared with HeightField so hills match the seed. */
export function terrainHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) / 4294967296;
}
