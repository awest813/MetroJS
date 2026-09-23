// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { forEachDispatchedTile } from './roadDispatch';

/**
 * Writes `tile.fireCoverage` [0–100] from powered stations with fireRadius.
 * Engines drive the road network from the station's street, so `fireRadius`
 * is a reach in road steps (highways count half, bridges cross water).
 * Unpowered stations, or stations with no street, contribute nothing.
 * No disaster simulation in this slice.
 *
 * `stats.fireAverage` is the mean coverage on occupied (density > 0) tiles.
 */
export class FireCoverageSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    map.forEach((tile) => {
      tile.fireCoverage = 0;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.fireRadius || def.fireRadius <= 0) continue;

      const station = map.getTile(instance.x, instance.y);
      if (!station?.powered) continue;

      forEachDispatchedTile(map, instance.x, instance.y, def.fireRadius, (tile, coverage) => {
        if (coverage > tile.fireCoverage) tile.fireCoverage = coverage;
      });
    }

    let occupied = 0;
    let total = 0;
    map.forEach((tile) => {
      if (tile.populationDensity <= 0) return;
      occupied += 1;
      total += tile.fireCoverage;
    });
    stats.fireAverage = occupied > 0 ? Math.round(total / occupied) : 0;
  }
}
