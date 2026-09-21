// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import { UNPOWERED_FACTOR } from './zoneGrowthHints';

/** Radius (tiles) that one resident cluster influences. */
const DENSITY_RADIUS = 4;

/**
 * Density contributed at a building tile per resident.
 * A 4-person house is 24 at centre before neighbours stack and clamp.
 */
const DENSITY_PER_RESIDENT = 6;

/**
 * Writes `tile.populationDensity` [0–100] from residential / mixed-use
 * population. No Micropolis density-scan tables.
 */
export class PopulationDensitySystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
  ): void {
    map.forEach((tile) => {
      tile.populationDensity = 0;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      const pop = def?.population ?? 0;
      if (pop <= 0) continue;

      const home = map.getTile(instance.x, instance.y);
      const factor = home?.powered ? 1 : UNPOWERED_FACTOR;
      const r = DENSITY_RADIUS;
      const r2 = r * r;
      const strength = pop * factor * DENSITY_PER_RESIDENT;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          tile.populationDensity += Math.round(strength * (1 - dist / r));
        }
      }
    }

    map.forEach((tile) => {
      tile.populationDensity = Math.max(0, Math.min(100, tile.populationDensity));
    });
  }
}
