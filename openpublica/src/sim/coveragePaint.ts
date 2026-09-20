// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';

/**
 * Visit every tile in a circular radius. Shared by power, police, fire, water.
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

/** Linear 100 → 0 falloff used by police/fire coverage. */
export function coverageAtDistance(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  return Math.round(100 * (1 - dist / radius));
}
