// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { BuildingInstance } from './BuildingInstance';
import type { BuildingDef } from './BuildingDef';

/**
 * PowerSystem — radius-based power coverage simulation.
 *
 * Each month (and immediately after a power plant is placed) the system:
 * 1. Clears every `tile.powered` flag on the map.
 * 2. For each building that has `powerRadius > 0`, marks every tile
 *    within that circular radius as powered.
 *
 * This is intentionally simple — no full grid/network required.
 */
export class PowerSystem {
  /**
   * Recompute power coverage across the entire map.
   *
   * Mutates `tile.powered` in-place for every tile in `map`.
   *
   * @param map       - city tile grid (powered flags are reset and re-set here)
   * @param buildings - registry of all placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
  ): void {
    // Clear all powered flags.
    map.forEach((tile) => { tile.powered = false; });

    // Mark tiles within each power-generating building's radius.
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.powerRadius || def.powerRadius <= 0) continue;

      const r  = def.powerRadius;
      const r2 = r * r;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // Use circular (Euclidean) coverage rather than a square.
          if (dx * dx + dy * dy > r2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (tile) tile.powered = true;
        }
      }
    }
  }
}
