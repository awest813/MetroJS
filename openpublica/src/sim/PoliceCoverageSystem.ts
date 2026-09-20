// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import { coverageAtDistance, forEachTileInRadius } from './coveragePaint';

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
      forEachTileInRadius(map, instance.x, instance.y, r, (tile, dist) => {
        const coverage = coverageAtDistance(dist, r);
        if (coverage > tile.policeCoverage) tile.policeCoverage = coverage;
      });
    }
  }
}
