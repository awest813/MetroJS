// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { CityTile } from './CityTile';
import { ROAD_STEPS, isLandRoad } from './roadConnections';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { routeCommutes, type Commuter, type Commutes, type Workplace } from './commutes';

// ── Constants ──────────────────────────────────────────────────────────────────

/*
 * Trip rates are set so a plain street reads right once it is built up: small
 * houses on both sides come to about 4 (moderate), rowhouses on both sides to
 * about 8 (jammed without a grid to share the load), and shops or workshops
 * lining a lone street jam it. At the old rates (0.3 rounded up per house, 4
 * per shop, 6 per workshop) every street of houses the zone tool lays jammed
 * at 13, so any real city sat near zero happiness and lost its street trees.
 * Once there are jobs to drive to, half of a home's trips commute instead:
 * its own street reads about half as busy, and the load moves to the roads
 * on the way to work, piling up where a district's commutes meet.
 */

/** Road trips per resident each simulated month. */
const RESIDENTIAL_TRIP_RATE = 0.15;

/** Base traffic pressure injected per commercial building onto adjacent roads (mixed use). */
const COMMERCIAL_BASE_PRESSURE = 2;

/** Road trips per shop job: a 3-job small shop makes 2, an office block 14 jobs' worth. */
const COMMERCIAL_TRIPS_PER_JOB = 2 / 3;

/** Road trips per factory job: a 5-job workshop makes 3. */
const INDUSTRIAL_TRIPS_PER_JOB = 0.6;

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

/**
 * Share of a home's trips that are commutes: they leave by its street and
 * drive the network to the nearest jobs with room (see `commutes.ts`)
 * instead of spreading over the streets nearby. With no workplace on the
 * network, they stay local.
 */
export const COMMUTE_SHARE = 0.5;

/**
 * Pressure each commute trip adds to every road tile it drives over.
 * Commutes pile up toward the jobs, so this is well under a local trip's
 * weight: 400 residents make 30 commute trips, which add about 4.5 to the one
 * street out of their district on top of its own lots' trips, and half that
 * per lane on a highway.
 */
export const COMMUTE_LOAD = 0.15;

/** Noise units added per unit of trafficPressure on a road tile. */
const NOISE_PER_PRESSURE = 3;

/** Maximum value allowed for `tile.trafficPressure`. */
const MAX_TRAFFIC_PRESSURE = 20;

// ──────────────────────────────────────────────────────────────────────────────

/** Trips a road type absorbs relative to a street. */
export function roadCapacity(type: RoadType): number {
  return type === RoadType.Highway ? HIGHWAY_CAPACITY : 1;
}

/** Jobs people drive to at this building: shops, offices, factories, mixed use (not civic posts). */
export function commuteJobs(def: BuildingDef): number {
  if (def.isService || def.zoneType === ZoneType.Residential || def.zoneType === ZoneType.None) return 0;
  return def.jobs;
}

/** Monthly trips from a building's residents that commute to work. */
export function commuteTrips(def: BuildingDef): number {
  if (def.zoneType !== ZoneType.Residential && def.zoneType !== ZoneType.MixedUse) return 0;
  return def.population * RESIDENTIAL_TRIP_RATE * COMMUTE_SHARE;
}

/** Monthly road trips a building generates (0 for services and parks). */
export function buildingTrips(def: BuildingDef): number {
  if (def.zoneType === ZoneType.Residential) return def.population * RESIDENTIAL_TRIP_RATE;
  if (def.zoneType === ZoneType.Commercial) return def.jobs * COMMERCIAL_TRIPS_PER_JOB;
  if (def.zoneType === ZoneType.Industrial) return def.jobs * INDUSTRIAL_TRIPS_PER_JOB;
  if (def.zoneType === ZoneType.MixedUse) {
    // Mixed-use: residents generate commute trips and commercial activity
    // draws visitors — combine both contributions at a slight discount to
    // reflect the shorter distances in walkable main-street areas.
    const resPressure = def.population * RESIDENTIAL_TRIP_RATE;
    const comPressure = COMMERCIAL_BASE_PRESSURE * 0.75;
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
 * with no street makes no trips.  A share of each home's trips
 * ({@link COMMUTE_SHARE}) are commutes instead: they drive the network to the
 * nearest jobs with room and load every road on the way.
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
  /** The commutes routed by the last tick, for the renderer's cars to follow (read only). */
  commutes: Commutes | null = null;

  /** Traffic multiplier from underfunded road upkeep (`roadWearFactor`); 1 at full funding. */
  roadWear = 1;

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

    // 2. Commuters drive the network to work (see commutes.ts); a home with
    //    no workplace on its network keeps those trips local.
    const homes: Commuter[] = [];
    const commuterOf = new Map<BuildingInstance, number>();
    const workplaces: Workplace[] = [];
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;
      const commute = commuteTrips(def);
      if (commute > 0) {
        commuterOf.set(instance, homes.length);
        homes.push({ x: instance.x, y: instance.y, trips: commute });
      }
      const jobs = commuteJobs(def);
      if (jobs > 0) workplaces.push({ x: instance.x, y: instance.y, jobs });
    }
    const commutes = routeCommutes(map, homes, workplaces);
    this.commutes = commutes;

    // 3. Each building's other trips spread over the roads it can drive to.
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;
      let trips = buildingTrips(def);
      const home = commuterOf.get(instance);
      if (home !== undefined && commutes.routed[home]) trips -= homes[home].trips;
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

    // 4. Commutes load every road they drive.
    for (let i = 0; i < load.length; i++) load[i] += commutes.flow[i] * COMMUTE_LOAD;

    // 5. Pressure per lane, clamped, then noise. Happiness is composed after walk/transit.
    map.forEach((tile) => {
      if (tile.roadType === RoadType.None) return;
      // Any road someone drives on reads at least 1, so a lone house's street is not empty.
      const perLane = load[tile.y * w + tile.x] * this.roadWear / roadCapacity(tile.roadType);
      const pressure = perLane > 0 ? Math.max(1, Math.round(perLane)) : 0;
      tile.trafficPressure = Math.max(0, Math.min(MAX_TRAFFIC_PRESSURE, pressure));
      tile.noise           = Math.min(100, tile.trafficPressure * NOISE_PER_PRESSURE);
    });
  }
}
