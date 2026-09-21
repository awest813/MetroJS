// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { CityStats } from './CitySim';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Radius (in tiles) within which a trolley avenue tile radiates transit access.
 * A value of 5 covers a comfortable walking-to-transit distance.
 */
const TRANSIT_RADIUS = 5;

/**
 * Maximum transit-access score granted to the trolley avenue tile itself.
 * Decays linearly to 0 at TRANSIT_RADIUS.
 */
const TRANSIT_PEAK_SCORE = 40;

/**
 * Divisor used to derive a traffic-pressure reduction from tile transit access.
 * transitAccess=25 → reduce trafficPressure by 1;
 * transitAccess=50 → reduce by 2;
 * transitAccess=100 → reduce by 4.
 * Transit corridors absorb commute trips, visibly easing road congestion.
 */
const TRANSIT_TRAFFIC_DIVISOR = 25;

// ──────────────────────────────────────────────────────────────────────────────

/**
 * TransitSystem — corridor-based transit simulation.
 *
 * Run once per simulated month, **after** WalkabilitySystem so that all
 * per-tile scores reflect the full monthly picture before effects are applied.
 *
 * ## How it works
 * Every `RoadType.TrolleyAvenue` tile radiates a transit-access score to all
 * tiles within `TRANSIT_RADIUS`.  The score decays linearly with distance.
 * Multiple overlapping corridors stack, capped at 100.
 *
 * ## Effects applied to map / stats
 * - `tile.transitAccess` [0–100] — written for every tile.
 * - `tile.trafficPressure` — reduced on road tiles near trolley corridors
 *   (transit captures commute trips, easing congestion).
 * - `stats.transitAccess` [0–100] — citywide average across all zoned tiles.
 * Happiness is composed later from this average plus traffic, walk, and crime.
 *
 * ## Design goals
 * - No route editor.
 * - No train scheduling.
 * - No per-rider simulation.
 * - Tile-based, O(trolleyTiles × TRANSIT_RADIUS²) — fast on 128×128 maps.
 */
export class TransitSystem {
  /**
   * Recompute transit access for every tile.
   *
   * @param map   - city tile grid
   * @param stats - city statistics (transitAccess is written)
   */
  tick(map: CityMap, stats: CityStats): void {
    // 1. Reset transit access on every tile.
    map.forEach((tile) => { tile.transitAccess = 0; });

    const r  = TRANSIT_RADIUS;
    const r2 = r * r;

    // 2. Each trolley avenue tile radiates a transit-access score to
    //    all tiles within TRANSIT_RADIUS.
    map.forEach((trolleyTile) => {
      if (trolleyTile.roadType !== RoadType.TrolleyAvenue) return;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r2) continue;
          const tile = map.getTile(trolleyTile.x + dx, trolleyTile.y + dy);
          if (!tile) continue;
          const dist  = Math.sqrt(dist2);
          const score = Math.round(TRANSIT_PEAK_SCORE * (1 - dist / r));
          tile.transitAccess = Math.min(100, tile.transitAccess + score);
        }
      }
    });

    // 3. On road tiles, transit access reduces traffic pressure.
    //    Trolley corridors capture commute trips that would otherwise
    //    be made by car, easing congestion.
    map.forEach((tile) => {
      if (tile.roadType === RoadType.None || tile.transitAccess === 0) return;
      const reduction = Math.floor(tile.transitAccess / TRANSIT_TRAFFIC_DIVISOR);
      tile.trafficPressure = Math.max(0, tile.trafficPressure - reduction);
    });

    // 4. Citywide transit stat — average access across all zoned tiles.
    //    Unzoned tiles are excluded; they are not part of the built city.
    let zonedCount  = 0;
    let accessSum   = 0;
    map.forEach((tile) => {
      if (tile.zoneType !== ZoneType.None) {
        accessSum  += tile.transitAccess;
        zonedCount += 1;
      }
    });
    stats.transitAccess = zonedCount > 0
      ? Math.round(accessSum / zonedCount)
      : 0;
  }
}
