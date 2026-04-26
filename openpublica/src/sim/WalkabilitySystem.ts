// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Maximum walkability bonus a single mixed-use building can grant at its
 * centre.  Decays linearly to 0 at the edge of `walkabilityRadius`.
 */
const MIXED_WALK_BONUS = 25;

/**
 * Maximum walkability bonus a single park building can grant at its centre.
 * Parks are strong walkability anchors — they encourage walking by giving
 * residents a pleasant destination to reach on foot.
 */
const PARK_WALK_BONUS = 30;

/**
 * Maximum walkability bonus civic service buildings (schools, fire stations,
 * etc.) can grant at their centre.  Smaller than parks because services are
 * destinations, not amenities.
 * Power plants are excluded — they are noisy and industrial.
 */
const SERVICE_WALK_BONUS = 8;

/** Radius (in tiles) within which service buildings boost walkability. */
const SERVICE_WALK_RADIUS = 4;

/**
 * Noise penalty multiplier.
 * walkability -= round(tile.noise × NOISE_WALK_PENALTY)
 * tile.noise is [0–100], so at full noise the penalty is 30 points.
 */
const NOISE_WALK_PENALTY = 0.30;

/**
 * Divisor used to derive a traffic-pressure reduction from tile walkability.
 * walkability=30 → reduce trafficPressure by 1;
 * walkability=60 → reduce by 2;
 * walkability=90 → reduce by 3.
 * Kept modest so traffic still matters in walkable areas.
 */
const WALK_TRAFFIC_DIVISOR = 30;

/**
 * Maximum happiness bonus walkability can contribute per month.
 * At stats.walkability = 100 the bonus is WALK_MAX_HAPPINESS.
 * Added on top of the traffic-derived happiness from TrafficPressureSystem.
 */
const WALK_MAX_HAPPINESS = 20;

/**
 * Divisor used to convert stats.walkability → a monthly happiness bonus.
 * walkability=50 → +10; walkability=100 → +20 (capped at WALK_MAX_HAPPINESS).
 */
const WALK_HAPPINESS_DIVISOR = 5;

// ──────────────────────────────────────────────────────────────────────────────

/**
 * WalkabilitySystem — tile-based walkability simulation.
 *
 * Run once per simulated month, **after** TrafficPressureSystem so that
 * freshly-computed `tile.noise` values are available for the noise penalty.
 *
 * ## Factors that increase walkability
 * - **Mixed-use proximity**: buildings with `walkabilityRadius > 0` boost
 *   nearby tiles, decaying linearly with distance.
 * - **Park proximity**: buildings with `parkRadius > 0` provide a strong
 *   walkability bonus, decaying linearly with distance.
 * - **Civic service proximity**: non-power service buildings (e.g. schools,
 *   fire stations) add a modest bonus within SERVICE_WALK_RADIUS tiles.
 *
 * ## Factors that decrease walkability
 * - **Road noise**: `tile.noise` subtracts from walkability (heavy traffic
 *   makes streets less pleasant to walk on).
 *
 * ## Effects applied to map / stats
 * - `tile.walkability` [0–100] — written for every tile.
 * - `tile.trafficPressure` — slightly reduced on road tiles in walkable areas
 *   (pedestrians absorb some trips that would otherwise be made by car).
 * - `stats.walkability` [0–100] — citywide average across all zoned tiles.
 * - `stats.happiness` [0–100] — boosted proportionally to `stats.walkability`
 *   (added on top of the traffic-derived happiness value).
 */
export class WalkabilitySystem {
  /**
   * Recompute walkability for every tile.
   *
   * @param map       - city tile grid
   * @param buildings - registry of all placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   * @param stats     - city statistics (walkability and happiness are written)
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    // 1. Reset walkability on every tile.
    map.forEach((tile) => { tile.walkability = 0; });

    // 2. Mixed-use proximity bonus.
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.walkabilityRadius || def.walkabilityRadius <= 0) continue;

      const r  = def.walkabilityRadius;
      const r2 = r * r;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          tile.walkability += Math.round(MIXED_WALK_BONUS * (1 - dist / r));
        }
      }
    }

    // 3. Park proximity bonus.
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
          tile.walkability += Math.round(PARK_WALK_BONUS * (1 - dist / r));
        }
      }
    }

    // 4. Civic service building proximity bonus.
    //    Power plants (powerRadius > 0) are excluded — they are noisy facilities,
    //    not pedestrian-friendly destinations.
    const sr  = SERVICE_WALK_RADIUS;
    const sr2 = sr * sr;

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.isService || def.powerRadius) continue;

      for (let dy = -sr; dy <= sr; dy++) {
        for (let dx = -sr; dx <= sr; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > sr2) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          const dist = Math.sqrt(dist2);
          tile.walkability += Math.round(SERVICE_WALK_BONUS * (1 - dist / sr));
        }
      }
    }

    // 5. Per-tile: noise penalty, clamping, and traffic pressure reduction.
    map.forEach((tile) => {
      // Heavy road noise makes streets less pleasant to walk on.
      tile.walkability -= Math.round(tile.noise * NOISE_WALK_PENALTY);
      tile.walkability  = Math.max(0, Math.min(100, tile.walkability));

      // On road tiles, high walkability reduces traffic pressure slightly:
      // walkable streets encourage short trips on foot instead of by car.
      if (tile.roadType !== RoadType.None && tile.walkability > 0) {
        const reduction = Math.floor(tile.walkability / WALK_TRAFFIC_DIVISOR);
        tile.trafficPressure = Math.max(0, tile.trafficPressure - reduction);
      }
    });

    // 6. Citywide walkability stat — average across all zoned tiles.
    //    Non-zoned tiles are excluded because they aren't part of the built city.
    let zonedCount = 0;
    let walkSum    = 0;
    map.forEach((tile) => {
      if (tile.zoneType !== ZoneType.None) {
        walkSum    += tile.walkability;
        zonedCount += 1;
      }
    });
    stats.walkability = zonedCount > 0
      ? Math.round(walkSum / zonedCount)
      : 0;

    // 7. Happiness boost — walkable cities are more pleasant to live in.
    //    Added on top of the traffic-derived happiness from TrafficPressureSystem.
    const walkBonus = Math.min(WALK_MAX_HAPPINESS, Math.round(stats.walkability / WALK_HAPPINESS_DIVISOR));
    stats.happiness  = Math.max(0, Math.min(100, stats.happiness + walkBonus));
  }
}
