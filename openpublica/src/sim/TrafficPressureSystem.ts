// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Fraction of a residential building's population that generates road trips
 * each simulated month.  A value of 0.3 means 30 % of residents are modelled
 * as daily commuters that pressure nearby roads.
 */
const RESIDENTIAL_TRIP_RATE = 0.3;

/** Base traffic pressure injected per commercial building onto adjacent roads. */
const COMMERCIAL_BASE_PRESSURE = 4;

/** Base traffic pressure injected per industrial building onto adjacent roads. */
const INDUSTRIAL_BASE_PRESSURE = 6;

/**
 * Radius (in tiles) around each building within which traffic pressure is
 * spread to road tiles.  Kept small (3) so even 128×128 maps run fast — the
 * inner loop is at most (2×3+1)² = 49 iterations per building.
 */
const SPREAD_RADIUS = 3;

/** Noise units added per unit of trafficPressure on a road tile. */
const NOISE_PER_PRESSURE = 3;

/** Maximum value allowed for `tile.trafficPressure`. */
const MAX_TRAFFIC_PRESSURE = 20;

/**
 * trafficPressure level considered "extreme".  Each road tile above this
 * threshold reduces city-wide happiness by HAPPINESS_PENALTY_PER_EXTREME.
 */
const EXTREME_PRESSURE_THRESHOLD = 8;

/** Happiness lost per extreme-traffic road tile (capped at [0, 100]). */
const HAPPINESS_PENALTY_PER_EXTREME = 2;

// ──────────────────────────────────────────────────────────────────────────────

/**
 * TrafficPressureSystem — lightweight traffic accumulation without per-car
 * simulation.
 *
 * Run once per simulated month.  For each building it estimates the number of
 * road trips and distributes traffic pressure radially to nearby road tiles.
 *
 * Effects applied to the map / stats:
 * - `tile.trafficPressure` [0–20] — road tiles accumulate pressure from
 *   surrounding buildings.  Non-road tiles are always 0.
 * - `tile.noise` [0–100] — derived from trafficPressure on road tiles; used
 *   by UI overlays and future noise-pollution systems.
 * - `stats.happiness` [0–100] — reduced by the number of extreme-pressure
 *   road tiles.
 *
 * Design goals (per spec):
 * - No per-citizen simulation.
 * - No A* routing.
 * - O(buildings × SPREAD_RADIUS²) — fast on 128×128 maps.
 */
export class TrafficPressureSystem {
  /**
   * Recompute traffic pressure for every road tile.
   *
   * Mutates `tile.trafficPressure` and `tile.noise` in-place.
   * Updates `stats.happiness`.
   *
   * @param map       - city tile grid
   * @param buildings - registry of all placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   * @param stats     - city statistics (happiness is written here)
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    // 1. Reset pressure and noise on all tiles.
    map.forEach((tile) => {
      tile.trafficPressure = 0;
      tile.noise           = 0;
    });

    // 2. Each building radiates pressure onto nearby road tiles.
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;

      let pressure: number;
      if (def.zoneType === ZoneType.Residential) {
        // Residential: trips ≈ population × trip rate (at least 1 if anyone lives here).
        pressure = Math.ceil(def.population * RESIDENTIAL_TRIP_RATE);
      } else if (def.zoneType === ZoneType.Commercial) {
        pressure = COMMERCIAL_BASE_PRESSURE;
      } else if (def.zoneType === ZoneType.Industrial) {
        pressure = INDUSTRIAL_BASE_PRESSURE;
      } else if (def.zoneType === ZoneType.MixedUse) {
        // Mixed-use: residents generate commute trips and commercial activity
        // draws visitors — combine both contributions at a slight discount to
        // reflect the shorter distances in walkable main-street areas.
        const resPressure = Math.ceil(def.population * RESIDENTIAL_TRIP_RATE);
        const comPressure = Math.round(COMMERCIAL_BASE_PRESSURE * 0.75);
        pressure = resPressure + comPressure;
      } else {
        // Service / no-zone buildings don't generate traffic.
        continue;
      }

      if (pressure === 0) continue;

      // Radial spread: add pressure to every road tile within SPREAD_RADIUS,
      // scaled linearly by distance so tiles closer to the building get more.
      for (let dy = -SPREAD_RADIUS; dy <= SPREAD_RADIUS; dy++) {
        for (let dx = -SPREAD_RADIUS; dx <= SPREAD_RADIUS; dx++) {
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile || tile.roadType === RoadType.None) continue;

          const dist    = Math.sqrt(dx * dx + dy * dy);
          const falloff = Math.max(0, 1 - dist / (SPREAD_RADIUS + 1));
          tile.trafficPressure += Math.round(pressure * falloff);
        }
      }
    }

    // 3. Clamp pressures, set noise, and count extreme tiles for happiness.
    let extremeTileCount = 0;

    map.forEach((tile) => {
      if (tile.roadType === RoadType.None) return;

      tile.trafficPressure = Math.max(0, Math.min(MAX_TRAFFIC_PRESSURE, tile.trafficPressure));
      tile.noise           = Math.min(100, tile.trafficPressure * NOISE_PER_PRESSURE);

      if (tile.trafficPressure >= EXTREME_PRESSURE_THRESHOLD) {
        extremeTileCount++;
      }
    });

    // 4. Happiness decreases with extreme traffic, but recovers toward 100 each
    //    month so a city that has cleaned up its traffic improves over time.
    const rawHappiness = 100 - extremeTileCount * HAPPINESS_PENALTY_PER_EXTREME;
    stats.happiness    = Math.max(0, Math.min(100, rawHappiness));
  }
}
