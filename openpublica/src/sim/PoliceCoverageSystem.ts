// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';

/**
 * Writes `tile.policeCoverage` [0–100] from powered stations with policeRadius.
 * Unpowered stations contribute nothing.
 */
export class PoliceCoverageSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
  ): void {
    map.forEach((tile) => {
      tile.policeCoverage = 0;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.policeRadius || def.policeRadius <= 0) continue;

      const station = map.getTile(instance.x, instance.y);
      if (!station?.powered) continue;

      const r = def.policeRadius;
      const r2 = r * r;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          const coverage = Math.round(100 * (1 - dist / r));
          if (coverage > tile.policeCoverage) tile.policeCoverage = coverage;
        }
      }
    }
  }
}
