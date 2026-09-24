// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';

/**
 * Visit every tile in a circular radius. Shared by power and water; police and
 * fire drive the road network instead (see roadDispatch).
 */
export function forEachTileInRadius(
  map: CityMap,
  cx: number,
  cy: number,
  radius: number,
  visit: (tile: CityTile, dist: number) => void,
): void {
  if (radius <= 0) return;
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const tile = map.getTile(cx + dx, cy + dy);
      if (!tile) continue;
      visit(tile, Math.sqrt(dist2));
    }
  }
}

/**
 * Coverage from two stations that both reach a tile: overlapping patrols add
 * up with diminishing returns (two at 20 make 36, never past 100), so a
 * district between two stations is not left with only the weaker reach.
 */
export function combineCoverage(a: number, b: number): number {
  return Math.round(100 - (100 - a) * (100 - b) / 100);
}

/** Linear 100 → 0 falloff used by police/fire coverage (distance in road steps). */
export function coverageAtDistance(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  return Math.round(100 * (1 - dist / radius));
}
