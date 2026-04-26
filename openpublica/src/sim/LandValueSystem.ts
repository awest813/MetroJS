// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';

// ── Named constants ────────────────────────────────────────────────────────

/** Baseline land value assigned to every tile before modifiers are applied. */
const BASE_LAND_VALUE = 20;

/** Maximum per-tile land value bonus a single park can grant at its centre. */
const PARK_BONUS = 40;

/** Radius (in tiles) within which industrial buildings reduce land value. */
const INDUSTRIAL_RADIUS = 8;

/**
 * Maximum per-tile land value bonus a single mixed-use building can grant
 * at its centre via walkability.  Decays linearly to 0 at walkabilityRadius.
 * Kept smaller than PARK_BONUS so mixed-use and parks are distinct.
 */
const WALKABILITY_BONUS = 20;

/**
 * Maximum per-tile land value penalty an industrial building can impose at
 * distance 0 (scales linearly to 0 at the edge of INDUSTRIAL_RADIUS).
 */
const INDUSTRIAL_PENALTY = 25;

/** Flat land value bonus for any tile that is orthogonally adjacent to a road. */
const ROAD_BONUS = 8;

/**
 * Multiplier applied to `tile.pollution` when computing the land value penalty.
 * Kept low because pollution is populated by future systems and may reach large values.
 */
const POLLUTION_PENALTY_MULTIPLIER = 0.5;

/**
 * Multiplier applied to `tile.trafficPressure` when computing the land value penalty.
 * Traffic pressure values are expected to be small integers (0–10), so a larger
 * multiplier is needed to produce a meaningful land value effect.
 */
const TRAFFIC_PENALTY_MULTIPLIER = 5;

// ──────────────────────────────────────────────────────────────────────────

/**
 * LandValueSystem — tile-based land value simulation.
 *
 * Run once per simulated month.  Mutates `tile.landValue` (0–100) for every
 * tile in the map based on:
 *
 * - **Park proximity**: buildings with `parkRadius > 0` boost nearby tiles,
 *   decaying linearly with distance.
 * - **Industrial proximity**: industrial buildings reduce land value nearby,
 *   acting as a pollution/noise proxy, decaying linearly with distance.
 * - **Road access**: tiles adjacent to at least one road tile receive a small
 *   flat bonus.
 * - **Pollution & traffic**: raw `tile.pollution` and `tile.trafficPressure`
 *   values subtract from land value (populated by other future systems).
 */
export class LandValueSystem {
  /**
   * Recompute land value for every tile.
   *
   * Mutates `tile.landValue` in-place; clamps the final value to [0, 100].
   *
   * @param map       - city tile grid
   * @param buildings - registry of all placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
  ): void {
    // Reset every tile to the baseline.
    map.forEach((tile) => {
      tile.landValue  = BASE_LAND_VALUE;
      tile.walkability = 0;
    });

    // ── Park proximity bonus ───────────────────────────────────────────────
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.parkRadius || def.parkRadius <= 0) continue;

      const r  = def.parkRadius;
      const r2 = r * r;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          tile.landValue += Math.round(PARK_BONUS * (1 - dist / r));
        }
      }
    }

    // ── Mixed-use walkability bonus ────────────────────────────────────────
    // Mixed-use buildings boost walkability on nearby tiles and grant a modest
    // land value bonus (smaller than parks, reflecting street-level vitality).
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.walkabilityRadius || def.walkabilityRadius <= 0) continue;

      const wr  = def.walkabilityRadius;
      const wr2 = wr * wr;

      for (let dy = -wr; dy <= wr; dy++) {
        for (let dx = -wr; dx <= wr; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > wr2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          const bonus = Math.round(WALKABILITY_BONUS * (1 - dist / wr));
          tile.walkability  = Math.min(100, tile.walkability + bonus);
          tile.landValue   += bonus;
        }
      }
    }

    // ── Industrial proximity penalty (pollution / noise proxy) ─────────────
    const ir  = INDUSTRIAL_RADIUS;
    const ir2 = ir * ir;

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def || def.zoneType !== ZoneType.Industrial) continue;

      for (let dy = -ir; dy <= ir; dy++) {
        for (let dx = -ir; dx <= ir; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > ir2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          tile.landValue -= Math.round(INDUSTRIAL_PENALTY * (1 - dist / ir));
        }
      }
    }

    // ── Per-tile modifiers and clamping ────────────────────────────────────
    map.forEach((tile) => {
      // Road access bonus — any orthogonal neighbour with a road qualifies.
      if (_hasAdjacentRoad(map, tile.x, tile.y)) {
        tile.landValue += ROAD_BONUS;
      }

      // Pollution and traffic penalties (populated by other future systems).
      tile.landValue -= Math.round(tile.pollution       * POLLUTION_PENALTY_MULTIPLIER);
      tile.landValue -= Math.round(tile.trafficPressure * TRAFFIC_PENALTY_MULTIPLIER);

      // Clamp to valid range.
      tile.landValue = Math.max(0, Math.min(100, tile.landValue));
    });
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function _hasAdjacentRoad(map: CityMap, x: number, y: number): boolean {
  const n = [
    map.getTile(x,     y - 1),
    map.getTile(x,     y + 1),
    map.getTile(x - 1, y),
    map.getTile(x + 1, y),
  ];
  return n.some((t) => t !== undefined && t.roadType !== RoadType.None);
}
