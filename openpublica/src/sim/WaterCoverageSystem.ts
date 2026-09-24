// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { ZoneType } from './CityTile';
import { utilityLoad, type UtilitySummary } from './PowerSystem';
import {
  GRID_LINE,
  GRID_SERVED,
  GRID_SHORT,
  distributeAlongStreets,
  type UtilityGrid,
  type UtilitySource,
} from './utilityGrid';

/**
 * Water mains run along the streets from powered towers, like power lines:
 * lots beside a watered street draw residents plus jobs, nearest first, until
 * the towers on that network run dry. Writes `tile.watered` (a small land
 * value bonus); does not change growth formulas.
 *
 * `stats.waterAverage` is the percent of zoned tiles that are watered.
 */
export class WaterCoverageSystem {
  /** The last distribution, for previews and hints. */
  grid: UtilityGrid | null = null;
  readonly summary: UtilitySummary = { supply: 0, load: 0, shortBuildings: 0 };
  /** Weather multiplier on every lot's load (sprinklers in a heatwave). */
  loadFactor = 1;

  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    map.forEach((tile) => {
      tile.watered = false;
    });

    const sources: UtilitySource[] = [];
    for (const instance of buildings.values()) {
      const capacity = defs.get(instance.defId)?.waterCapacity ?? 0;
      if (capacity <= 0) continue;
      if (!map.getTile(instance.x, instance.y)?.powered) continue;
      sources.push({ x: instance.x, y: instance.y, capacity });
    }
    const factor = this.loadFactor;
    const grid = distributeAlongStreets(map, sources, (tile) => {
      const load = utilityLoad(tile, defs);
      return load === null ? null : load * factor;
    });
    this.grid = grid;

    let zoned = 0;
    let wet = 0;
    let shortBuildings = 0;
    map.forEach((tile) => {
      const state = grid.state[tile.y * map.width + tile.x];
      if (state === GRID_SERVED || state === GRID_LINE) tile.watered = true;
      else if (state === GRID_SHORT && tile.buildingId !== null) shortBuildings += 1;
      if (tile.zoneType === ZoneType.None) return;
      zoned += 1;
      if (tile.watered) wet += 1;
    });
    stats.waterAverage = zoned > 0 ? Math.round((100 * wet) / zoned) : 0;
    // A plant or tower that reaches no street and serves no lot supplies nobody.
    this.summary.supply = grid.networks
      .filter((n) => n.streets > 0 || n.served > 0)
      .reduce((sum, n) => sum + n.supply, 0);
    this.summary.load = Math.round(grid.networks.reduce((sum, n) => sum + n.load, 0));
    this.summary.shortBuildings = shortBuildings;
  }
}
