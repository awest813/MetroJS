// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityTile } from './CityTile';
import { RoadType, TerrainType, ZoneType } from './CityTile';
import { createSeededNoise2D } from '../math/seededNoise';

/**
 * Woods on open land. Each map seeds a noise field; open grass where it runs
 * high is a grove. Zoning, paving, or building on a tile clears its trees,
 * so the woods are wherever the city has not gone yet. Lots at the edge of the
 * woods are worth a little more (LandValueSystem).
 */

/** Grove noise frequency: one grove spans a few tiles. */
const GROVE_FREQUENCY = 0.16;
/** Open grass where the grove noise is above this is wooded. */
export const GROVE_THRESHOLD = 0.42;
/** Deeper in a grove the trees stand closer. */
export const GROVE_DENSE = 0.62;

const cache = new Map<string, Float32Array>();

/** Grove noise for every tile of a map (row-major), fixed by the terrain seed. */
export function groveStrengths(seed: number, width: number, height: number): Float32Array {
  const key = `${seed}:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const noise = createSeededNoise2D(`openpublica-groves-${seed}`);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = noise(x * GROVE_FREQUENCY, y * GROVE_FREQUENCY);
  }
  cache.set(key, out);
  return out;
}

/** Grass with nothing on it: no zone, road, or building. Only here do trees grow wild. */
export function isOpenGrass(tile: CityTile): boolean {
  return tile.terrain === TerrainType.Grass &&
    tile.zoneType === ZoneType.None &&
    tile.roadType === RoadType.None &&
    tile.buildingId === null;
}

/** Part of a grove: open grass where the grove noise runs high. */
export function isWooded(tile: CityTile, strengths: Float32Array, width: number): boolean {
  return isOpenGrass(tile) && strengths[tile.y * width + tile.x] > GROVE_THRESHOLD;
}
