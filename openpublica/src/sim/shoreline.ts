// ⚠️  This file must NOT import anything from @babylonjs/core.

import { TerrainType } from './CityTile';
import type { CityMap } from './CityMap';

/** World Y of the water surface plane. Land stays above this. */
export const WATER_SURFACE_Y = 0.06;

/** World Y of lake / river beds. */
export const WATER_BED_Y = -0.62;

/** Lowest dry-land height before hills are added. */
export const LAND_BASE_Y = 0.20;

/**
 * Corner height by wet fraction (water tiles among those touching the
 * corner). A corner where land and water meet sits near the waterline, so the
 * shore follows tile edges: dry tiles stay above the water plane and water
 * tiles stay below it.
 *
 * - 1 of 4 wet: a low beach just above the water.
 * - 2 of 4 wet: the waterline itself, a little under the surface.
 * - 3 of 4 wet: shallows.
 * - all wet: the bed.
 */
const SHORE_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.25, WATER_SURFACE_Y + 0.10],
  [0.5, WATER_SURFACE_Y - 0.05],
  [0.75, WATER_SURFACE_Y - 0.18],
  [1, WATER_BED_Y],
];

/** Height of a corner given how wet it is and the dry-land height there. */
export function shoreCornerHeight(wet: number, land: number): number {
  if (wet <= 0) return land;
  let prevW = 0;
  let prevH = land;
  for (const [w, h] of SHORE_STOPS) {
    if (wet <= w) {
      const t = (wet - prevW) / (w - prevW);
      return prevH + (h - prevH) * t;
    }
    prevW = w;
    prevH = h;
  }
  return WATER_BED_Y;
}

/** Share of the (up to four) tiles touching corner (cx, cy) that are water. */
export function cornerWetness(map: CityMap, cx: number, cy: number): number {
  let water = 0;
  let count = 0;
  for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
    const tile = map.getTile(tx, ty);
    if (!tile) continue;
    count += 1;
    if (tile.terrain === TerrainType.Water) water += 1;
  }
  return count === 0 ? 0 : water / count;
}

/** Passes of {@link smoothShoreline}; each only trims features, so it settles fast. */
const SHORELINE_PASSES = 8;

/**
 * Drop land and water features too thin for a corner heightfield to draw.
 *
 * A corner shared by land and water sits at the waterline, so a one-tile spit
 * or an isthmus with water on opposite sides would have every corner at or
 * under the waterline and render as lake while the sim calls it dry land. A
 * one-tile notch of water poking into land has the opposite problem.
 *
 * - Land becomes water when water touches three or four sides, two opposite
 *   sides, or two adjacent sides plus most of the diagonals (a point whose
 *   only dry corner cannot hold the tile above the waterline).
 * - Water becomes land when land touches three or four sides.
 *
 * Off-map neighbours count as the tile's own terrain, so the river mouth at
 * the map edge stays put.
 */
export function smoothShoreline(map: CityMap): void {
  for (let pass = 0; pass < SHORELINE_PASSES; pass++) {
    const flips: Array<{ x: number; y: number; to: TerrainType }> = [];
    map.forEach((tile) => {
      const water = tile.terrain === TerrainType.Water;
      const wet = (dx: number, dy: number): boolean => {
        const next = map.getTile(tile.x + dx, tile.y + dy);
        return next ? next.terrain === TerrainType.Water : water;
      };
      const n = wet(0, 1);
      const e = wet(1, 0);
      const s = wet(0, -1);
      const w = wet(-1, 0);
      const wetSides = [n, e, s, w].filter(Boolean).length;
      if (water) {
        if (wetSides <= 1) flips.push({ x: tile.x, y: tile.y, to: TerrainType.Grass });
        return;
      }
      const wetRing = wetSides + [wet(1, 1), wet(1, -1), wet(-1, 1), wet(-1, -1)].filter(Boolean).length;
      if (wetSides >= 3 || (n && s) || (e && w) || (wetSides === 2 && wetRing >= 5)) {
        flips.push({ x: tile.x, y: tile.y, to: TerrainType.Water });
      }
    });
    if (flips.length === 0) return;
    for (const flip of flips) map.getTile(flip.x, flip.y)!.terrain = flip.to;
  }
}

/**
 * Chebyshev distance (1 or 2) from a dry tile to the nearest water tile, or
 * null when water is farther than two tiles or the tile is itself water.
 */
export function waterfrontDistance(map: CityMap, x: number, y: number): 1 | 2 | null {
  const tile = map.getTile(x, y);
  if (!tile || tile.terrain === TerrainType.Water) return null;
  let best: 1 | 2 | null = null;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (map.getTile(x + dx, y + dy)?.terrain !== TerrainType.Water) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return 1;
      best = 2;
    }
  }
  return best;
}
