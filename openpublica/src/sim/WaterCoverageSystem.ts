// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { ZoneType } from './CityTile';
import { forEachTileInRadius } from './coveragePaint';

/**
 * Writes `tile.watered` from powered towers with waterRadius.
 * Unpowered towers contribute nothing. Does not change growth/tax/power formulas.
 * LandValueSystem may read `tile.watered` as a small lot bonus.
 *
 * `stats.waterAverage` is the percent of zoned tiles that are watered.
 */
export class WaterCoverageSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    map.forEach((tile) => {
      tile.watered = false;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.waterRadius || def.waterRadius <= 0) continue;

      const tower = map.getTile(instance.x, instance.y);
      if (!tower?.powered) continue;

      forEachTileInRadius(map, instance.x, instance.y, def.waterRadius, (tile) => {
        tile.watered = true;
      });
    }

    let zoned = 0;
    let wet = 0;
    map.forEach((tile) => {
      if (tile.zoneType === ZoneType.None) return;
      zoned += 1;
      if (tile.watered) wet += 1;
    });
    stats.waterAverage = zoned > 0 ? Math.round((100 * wet) / zoned) : 0;
  }
}
