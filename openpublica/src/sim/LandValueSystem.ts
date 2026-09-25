// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, TerrainType, ZoneType } from './CityTile';
import { hasRoadFrontage } from './roadConnections';
import { waterfrontDistance } from './shoreline';
import { groveStrengths, isWooded } from './woods';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import { civicWorks } from './civic';

// ── Named constants ────────────────────────────────────────────────────────

/** Baseline land value assigned to every tile before modifiers are applied. */
export const BASE_LAND_VALUE = 20;

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
 * Multiplier applied to `tile.walkability` (previous month's value, set by
 * WalkabilitySystem) when computing a land value bonus.  Walkable areas
 * naturally attract residents and raise property values.
 * At walkability=100 the bonus is +15 (= 100 × 0.15, rounded).
 */
const WALKABILITY_LV_MULTIPLIER = 0.15;

/**
 * Multiplier applied to `tile.transitAccess` (previous month's value, set by
 * TransitSystem) when computing a land value bonus.  Properties near transit
 * corridors command a premium in real cities.
 * At transitAccess=100 the bonus is +10 (= 100 × 0.10, rounded).
 */
const TRANSIT_LV_MULTIPLIER = 0.10;

/**
 * Maximum per-tile land value penalty an industrial building can impose at
 * distance 0 (scales linearly to 0 at the edge of INDUSTRIAL_RADIUS).
 */
const INDUSTRIAL_PENALTY = 25;

/** Flat land value bonus for any tile that is orthogonally adjacent to a road. */
const ROAD_BONUS = 8;

/** Modest lot bonus for watered tiles. Does not change demand formulas. */
export const WATERED_LAND_VALUE_BONUS = 8;

/**
 * Land value per point of fire coverage: a lot an engine reaches at once is
 * worth up to 8 more (insurers charge less where the fire station is close).
 * Reads the previous month's coverage, as walkability and transit do.
 */
export const FIRE_SAFETY_LV_MULTIPLIER = 0.08;

/** Lots touching a lake or river (including diagonally) are worth this much more. */
export const WATERFRONT_BONUS = 8;

/** Lots two tiles from the water get this smaller view premium. */
export const NEAR_WATER_BONUS = 4;

/** A lot beside the woods (see sim/woods) gets this premium; clearing them takes it away. */
export const WOODS_EDGE_BONUS = 6;

/** Lots two tiles from the woods get this smaller premium. */
export const NEAR_WOODS_BONUS = 3;

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

/** Minimum residential buildings before a downtown centroid is computed. */
const DOWNTOWN_MIN_HOMES = 8;

/** Radius (in tiles) of the commercial/mixed downtown land-value boost. */
const DOWNTOWN_RADIUS = 10;

/** Peak land-value bonus at the residential centroid for commercial/mixed lots. */
const DOWNTOWN_BONUS = 16;

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
 * - **Watered lots**: powered water-tower coverage adds a small lot bonus.
 * - **Fire safety**: lots a fire station reaches are worth a little more,
 *   the closer the more.
 * - **Waterfront**: dry lots beside a lake or river, or one tile back, get a
 *   small premium.
 * - **Downtown**: once enough houses exist, commercial and mixed lots near
 *   the residential centroid get a decaying land-value boost (shops want to
 *   sit next to people). Does not change demand formulas.
 */
export class LandValueSystem {
  /** Terrain seed of the map, for the woods; null leaves woods out. CitySim keeps it in step. */
  woodsSeed: number | null = null;

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
    // Note: tile.walkability is NOT reset here — WalkabilitySystem owns that field
    // and runs after this system each month.  We read the previous month's value below.
    map.forEach((tile) => {
      tile.landValue = BASE_LAND_VALUE;
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

    // ── Civic bonus (a college) ────────────────────────────────────────────
    // A working civic building with a land-value bonus lifts lots around it,
    // falling off to nothing at its radius (sim/civic.ts).
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.landValueBonus || !def.landValueRadius || !civicWorks(map, instance)) continue;
      const r = def.landValueRadius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > r * r) continue;
          const tile = map.getTile(instance.x + dx, instance.y + dy);
          if (!tile) continue;
          tile.landValue += Math.round(def.landValueBonus * (1 - Math.sqrt(dist2) / (r + 1)));
        }
      }
    }

    // ── Street-life bonus ──────────────────────────────────────────────────
    // Walkable buildings (mixed use, shop rows, offices) lend nearby lots a
    // modest bonus, smaller than a park's. Each lot takes the strongest one
    // in reach rather than their sum: a lively street is worth so much, and
    // a block of mixed use no longer lifts its own land to the top tier.
    const streetLife = new Float32Array(map.width * map.height);
    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def?.walkabilityRadius || def.walkabilityRadius <= 0) continue;

      const wr  = def.walkabilityRadius;
      const wr2 = wr * wr;

      for (let dy = -wr; dy <= wr; dy++) {
        for (let dx = -wr; dx <= wr; dx++) {
          const dist2 = dx * dx + dy * dy;
          if (dist2 > wr2) continue;
          const x = instance.x + dx;
          const y = instance.y + dy;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const bonus = Math.round(WALKABILITY_BONUS * (1 - Math.sqrt(dist2) / wr));
          const i = y * map.width + x;
          if (bonus > streetLife[i]) streetLife[i] = bonus;
        }
      }
    }
    map.forEach((tile) => {
      tile.landValue += streetLife[tile.y * map.width + tile.x];
    });

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

    // ── Downtown centroid (commercial / mixed near housing) ────────────────
    const downtown = _residentialCentroid(buildings, defs);
    if (downtown) {
      map.forEach((tile) => {
        if (tile.zoneType !== ZoneType.Commercial && tile.zoneType !== ZoneType.MixedUse) {
          return;
        }
        const dx = tile.x - downtown.x;
        const dy = tile.y - downtown.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= DOWNTOWN_RADIUS) return;
        tile.landValue += Math.round(DOWNTOWN_BONUS * (1 - dist / DOWNTOWN_RADIUS));
      });
    }

    const woodsDistance = this._woodsDistance(map);

    // ── Per-tile modifiers and clamping ────────────────────────────────────
    map.forEach((tile) => {
      // Road access bonus — a land road beside the lot (a bridge is not frontage).
      if (hasRoadFrontage(map, tile.x, tile.y)) {
        tile.landValue += ROAD_BONUS;
      }
      if (tile.watered) {
        tile.landValue += WATERED_LAND_VALUE_BONUS;
      }
      tile.landValue += Math.round(tile.fireCoverage * FIRE_SAFETY_LV_MULTIPLIER);
      const shore = waterfrontDistance(map, tile.x, tile.y);
      if (shore === 1) tile.landValue += WATERFRONT_BONUS;
      else if (shore === 2) tile.landValue += NEAR_WATER_BONUS;
      const woods = woodsDistance[tile.y * map.width + tile.x];
      if (woods === 1) tile.landValue += WOODS_EDGE_BONUS;
      else if (woods === 2) tile.landValue += NEAR_WOODS_BONUS;

      // Pollution and traffic penalties (populated by other future systems).
      tile.landValue -= Math.round(tile.pollution       * POLLUTION_PENALTY_MULTIPLIER);
      tile.landValue -= Math.round(tile.trafficPressure * TRAFFIC_PENALTY_MULTIPLIER);

      // Walkability bonus: highly walkable tiles attract residents and raise
      // property values.  LandValueSystem runs before WalkabilitySystem each month,
      // so this reads the previous month's walkability value.
      tile.landValue += Math.round(tile.walkability   * WALKABILITY_LV_MULTIPLIER);

      // Transit access bonus: properties near trolley corridors command a premium.
      // LandValueSystem runs before TransitSystem each month,
      // so this reads the previous month's transitAccess value.
      tile.landValue += Math.round(tile.transitAccess * TRANSIT_LV_MULTIPLIER);

      // Clamp to valid range.
      tile.landValue = Math.max(0, Math.min(100, tile.landValue));
    });
  }

  /**
   * Chebyshev steps from each tile to the nearest wooded tile, up to 2
   * (0 = none in reach, or the tile is woods itself). Only dry, road-free
   * tiles count as lots beside the woods.
   */
  private _woodsDistance(map: CityMap): Uint8Array {
    const w = map.width;
    const out = new Uint8Array(w * map.height);
    if (this.woodsSeed === null) return out;
    const strengths = groveStrengths(this.woodsSeed, w, map.height);
    map.forEach((tile) => {
      if (!isWooded(tile, strengths, w)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const lot = map.getTile(tile.x + dx, tile.y + dy);
          if (!lot || lot.terrain === TerrainType.Water || lot.roadType !== RoadType.None) continue;
          if (isWooded(lot, strengths, w)) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const index = lot.y * w + lot.x;
          if (out[index] === 0 || d < out[index]) out[index] = d;
        }
      }
    });
    return out;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function _residentialCentroid(
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (!def || def.zoneType !== ZoneType.Residential || def.population <= 0) continue;
    sx += instance.x;
    sy += instance.y;
    n += 1;
  }
  if (n < DOWNTOWN_MIN_HOMES) return null;
  return { x: sx / n, y: sy / n };
}
