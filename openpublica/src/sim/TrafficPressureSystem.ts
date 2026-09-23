// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { CityTile } from './CityTile';
import { ROAD_STEPS, isLandRoad } from './roadConnections';
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
 * Radius (in tiles) around each building within which its trips spread over
 * connected road tiles.  Kept small (3) so the per-building flood fill is at
 * most (2×3+1)² = 49 tiles.
 */
const SPREAD_RADIUS = 3;

/**
 * Total falloff weight one building's trips may load at full strength.
 * A building that reaches more road than this (a grid, a parallel street, a
 * highway) splits the same trips across all of it, so extra routes relieve
 * the busy ones instead of adding traffic of their own. A lone street keeps
 * the full per-tile load.
 */
export const TRIP_SPREAD_BUDGET = 3.5;

/**
 * Highway capacity relative to a street.  Highways draw this many times the
 * trips of a street at the same distance, and report pressure per lane.
 */
export const HIGHWAY_CAPACITY = 2;

/** Noise units added per unit of trafficPressure on a road tile. */
const NOISE_PER_PRESSURE = 3;

/** Maximum value allowed for `tile.trafficPressure`. */
const MAX_TRAFFIC_PRESSURE = 20;

// ──────────────────────────────────────────────────────────────────────────────

/** Trips a road type absorbs relative to a street. */
export function roadCapacity(type: RoadType): number {
  return type === RoadType.Highway ? HIGHWAY_CAPACITY : 1;
}

/** Monthly road trips a building generates (0 for services and parks). */
export function buildingTrips(def: BuildingDef): number {
  if (def.zoneType === ZoneType.Residential) {
    // Residential: trips ≈ population × trip rate (at least 1 if anyone lives here).
    return Math.ceil(def.population * RESIDENTIAL_TRIP_RATE);
  }
  if (def.zoneType === ZoneType.Commercial) return COMMERCIAL_BASE_PRESSURE;
  if (def.zoneType === ZoneType.Industrial) return INDUSTRIAL_BASE_PRESSURE;
  if (def.zoneType === ZoneType.MixedUse) {
    // Mixed-use: residents generate commute trips and commercial activity
    // draws visitors — combine both contributions at a slight discount to
    // reflect the shorter distances in walkable main-street areas.
    const resPressure = Math.ceil(def.population * RESIDENTIAL_TRIP_RATE);
    const comPressure = Math.round(COMMERCIAL_BASE_PRESSURE * 0.75);
    return resPressure + comPressure;
  }
  // Service / no-zone buildings don't generate traffic.
  return 0;
}

/**
 * TrafficPressureSystem — lightweight traffic accumulation without per-car
 * simulation.
 *
 * Run once per simulated month.  Each building's trips leave by the streets
 * beside its lot and spread over the road tiles connected to them within
 * SPREAD_RADIUS, weighted by distance.  Roads on another network (across a
 * river with no bridge, or simply not joined up) carry none of it, and a lot
 * with no street makes no trips.
 *
 * Effects applied to the map / stats:
 * - `tile.trafficPressure` [0–20] — road tiles accumulate pressure from
 *   surrounding buildings.  Non-road tiles are always 0.  Highways report
 *   load divided by {@link HIGHWAY_CAPACITY}.
 * - `tile.noise` [0–100] — derived from trafficPressure on road tiles; used
 *   by UI overlays and future noise-pollution systems.
 * Happiness is composed later from extreme-pressure roads plus walk/transit/crime.
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
   *
   * @param map       - city tile grid
   * @param buildings - registry of all placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   * @param stats     - city statistics (unused; kept so call sites stay uniform)
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    _stats: CityStats,
  ): void {
    // 1. Reset pressure and noise on all tiles.
    map.forEach((tile) => {
      tile.trafficPressure = 0;
      tile.noise           = 0;
    });

    const w = map.width;
    const load = new Float64Array(w * map.height);
    const seen = new Int32Array(w * map.height);
    const reached: CityTile[] = [];
    const weights: number[] = [];
    let stamp = 0;

    // 2. Each building's trips spread over the roads it can drive to.
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;
      const trips = buildingTrips(def);
      if (trips <= 0) continue;

      stamp += 1;
      reached.length = 0;
      const inReach = (tile: CityTile): boolean =>
        Math.abs(tile.x - instance.x) <= SPREAD_RADIUS &&
        Math.abs(tile.y - instance.y) <= SPREAD_RADIUS;

      // Driveways: land roads beside the lot. A bridge deck is not a driveway.
      for (const [dx, dy] of ROAD_STEPS) {
        const tile = map.getTile(instance.x + dx, instance.y + dy);
        if (!isLandRoad(tile)) continue;
        seen[tile!.y * w + tile!.x] = stamp;
        reached.push(tile!);
      }
      // Flood the connected network inside the spread box.
      for (let i = 0; i < reached.length; i++) {
        const from = reached[i];
        for (const [dx, dy] of ROAD_STEPS) {
          const tile = map.getTile(from.x + dx, from.y + dy);
          if (!tile || tile.roadType === RoadType.None || !inReach(tile)) continue;
          const index = tile.y * w + tile.x;
          if (seen[index] === stamp) continue;
          seen[index] = stamp;
          reached.push(tile);
        }
      }
      if (reached.length === 0) continue;

      // Closer road carries more; highways draw more than streets.
      weights.length = 0;
      let total = 0;
      for (const tile of reached) {
        const dx = tile.x - instance.x;
        const dy = tile.y - instance.y;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / (SPREAD_RADIUS + 1));
        const weight = falloff * roadCapacity(tile.roadType);
        weights.push(weight);
        total += weight;
      }
      if (total <= 0) continue;

      const share = Math.min(1, TRIP_SPREAD_BUDGET / total);
      for (let i = 0; i < reached.length; i++) {
        const tile = reached[i];
        load[tile.y * w + tile.x] += trips * weights[i] * share;
      }
    }

    // 3. Pressure per lane, clamped, then noise. Happiness is composed after walk/transit.
    map.forEach((tile) => {
      if (tile.roadType === RoadType.None) return;
      const pressure = Math.round(load[tile.y * w + tile.x] / roadCapacity(tile.roadType));
      tile.trafficPressure = Math.max(0, Math.min(MAX_TRAFFIC_PRESSURE, pressure));
      tile.noise           = Math.min(100, tile.trafficPressure * NOISE_PER_PRESSURE);
    });
  }
}
