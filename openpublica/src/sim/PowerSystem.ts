// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingInstance } from './BuildingInstance';
import type { BuildingDef } from './BuildingDef';
import {
  GRID_LINE,
  GRID_SERVED,
  GRID_SHORT,
  distributeAlongStreets,
  type UtilityGrid,
  type UtilitySource,
} from './utilityGrid';

/**
 * What a lot draws from a utility network: its building's residents plus
 * jobs, 0 for an empty zoned lot (it is served while supply remains, so it
 * can grow), or null for tiles that take no service (roads, bare ground,
 * parks, and the plants themselves).
 */
export function utilityLoad(tile: CityTile, defs: ReadonlyMap<string, BuildingDef>): number | null {
  if (tile.roadType !== RoadType.None) return null;
  if (tile.buildingId === null) return tile.zoneType !== ZoneType.None ? 0 : null;
  const def = defs.get(tile.buildingId);
  if (!def || def.powerCapacity) return null;
  const load = def.population + def.jobs;
  if (load > 0) return load;
  return def.isService ? null : 0;
}

/** Supply and use across every power network, for the HUD and advisories. */
export interface UtilitySummary {
  /** Capacity of every plant that feeds a network. */
  supply: number;
  /** Load drawn by served lots. */
  load: number;
  /** Buildings a network reaches but cannot serve: its plants are at capacity. */
  shortBuildings: number;
}

/**
 * PowerSystem — power runs along the streets.
 *
 * A plant feeds the road network its lot touches (and any plant or street
 * joined to it). Lots beside a live street draw their load, nearest to a
 * plant first, until the plants on that network run out of capacity; the far
 * end of an overloaded network goes dark. Road tiles on a fed network are
 * marked powered too, so the Power map shows the lines.
 */
export class PowerSystem {
  /** The last distribution, for previews and hints. */
  grid: UtilityGrid | null = null;
  readonly summary: UtilitySummary = { supply: 0, load: 0, shortBuildings: 0 };

  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
  ): void {
    map.forEach((tile) => { tile.powered = false; });

    const sources: UtilitySource[] = [];
    for (const instance of buildings.values()) {
      const capacity = defs.get(instance.defId)?.powerCapacity ?? 0;
      if (capacity > 0) sources.push({ x: instance.x, y: instance.y, capacity });
    }
    const grid = distributeAlongStreets(map, sources, (tile) => utilityLoad(tile, defs));
    this.grid = grid;

    let shortBuildings = 0;
    map.forEach((tile) => {
      const state = grid.state[tile.y * map.width + tile.x];
      if (state === GRID_SERVED || state === GRID_LINE) tile.powered = true;
      else if (state === GRID_SHORT && tile.buildingId !== null) shortBuildings += 1;
    });
    // A plant or tower that reaches no street and serves no lot supplies nobody.
    this.summary.supply = grid.networks
      .filter((n) => n.streets > 0 || n.served > 0)
      .reduce((sum, n) => sum + n.supply, 0);
    this.summary.load = grid.networks.reduce((sum, n) => sum + n.load, 0);
    this.summary.shortBuildings = shortBuildings;
  }
}
