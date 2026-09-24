// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import { forEachDispatchedTile } from './roadDispatch';
import { fundedReach } from './budgetLevers';

/**
 * Writes `tile.policeCoverage` [0–100] from powered stations with policeRadius.
 * Patrol cars leave by the station's street and drive the road network, so
 * `policeRadius` is a reach in road steps (highways count half). Unpowered
 * stations, or stations with no street, contribute nothing.
 */
export class PoliceCoverageSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    /** Police funding, percent: reach scales with it. */
    funding = 100,
  ): void {
    map.forEach((tile) => {
      tile.policeCoverage = 0;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.policeRadius || def.policeRadius <= 0) continue;

      const station = map.getTile(instance.x, instance.y);
      if (!station?.powered) continue;

      forEachDispatchedTile(map, instance.x, instance.y, fundedReach(def.policeRadius, funding), (tile, coverage) => {
        if (coverage > tile.policeCoverage) tile.policeCoverage = coverage;
      });
    }
  }
}
