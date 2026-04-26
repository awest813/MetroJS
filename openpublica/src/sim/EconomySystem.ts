// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';

// ── Named constants ────────────────────────────────────────────────────────

/** Starting city treasury in dollars. */
export const STARTING_MONEY = 10_000;

/**
 * Monthly income per resident for every 1% of residential tax rate.
 *
 * Income_res = population × resTaxRate × RES_INCOME_PER_PERSON_PER_PCT
 */
const RES_INCOME_PER_PERSON_PER_PCT = 0.5;

/**
 * Monthly income per commercial job for every 1% of commercial tax rate.
 *
 * Income_com = comJobs × comTaxRate × COM_INCOME_PER_JOB_PER_PCT
 */
const COM_INCOME_PER_JOB_PER_PCT = 0.4;

/**
 * Monthly income per industrial job for every 1% of industrial tax rate.
 *
 * Income_ind = indJobs × indTaxRate × IND_INCOME_PER_JOB_PER_PCT
 */
const IND_INCOME_PER_JOB_PER_PCT = 0.3;

/**
 * Monthly maintenance cost (dollars) per road tile.
 *
 * Expense_roads = roadTileCount × ROAD_MAINTENANCE_PER_TILE
 */
const ROAD_MAINTENANCE_PER_TILE = 2;

/**
 * Monthly operating cost (dollars) per service building (e.g. fire station,
 * school).  Applied for each building whose BuildingDef.isService is true.
 *
 * Expense_services = serviceBuildingCount × SERVICE_BUILDING_MONTHLY_COST
 */
const SERVICE_BUILDING_MONTHLY_COST = 50;

// ──────────────────────────────────────────────────────────────────────────

/**
 * EconomySystem — computes the city's monthly budget and updates the
 * city treasury.
 *
 * ## Income formula
 * ```
 * monthlyIncome = population    × resTaxRate × RES_INCOME_PER_PERSON_PER_PCT
 *               + comJobs       × comTaxRate × COM_INCOME_PER_JOB_PER_PCT
 *               + indJobs       × indTaxRate × IND_INCOME_PER_JOB_PER_PCT
 * ```
 *
 * ## Expense formula
 * ```
 * monthlyExpenses = roadTileCount       × ROAD_MAINTENANCE_PER_TILE
 *                 + serviceBuildingCount × SERVICE_BUILDING_MONTHLY_COST
 * ```
 *
 * ## Treasury update
 * ```
 * money += monthlyIncome - monthlyExpenses
 * ```
 * If `money` drops below zero, `stats.bankruptcyWarning` is set to `true`.
 */
export class EconomySystem {
  /**
   * Run one monthly budget cycle.
   *
   * Mutates `stats.monthlyIncome`, `stats.monthlyExpenses`, `stats.money`,
   * and `stats.bankruptcyWarning`.
   *
   * @param map       - city tile grid (used to count road tiles)
   * @param buildings - registry of placed building instances
   * @param defs      - lookup map from BuildingDef.id → BuildingDef
   * @param stats     - mutable city statistics object
   */
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    // ── Income ─────────────────────────────────────────────────────────────
    let comJobs             = 0;
    let indJobs             = 0;
    let serviceBuildingCount = 0;

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;

      if (def.zoneType === ZoneType.Commercial) comJobs += def.jobs;
      if (def.zoneType === ZoneType.Industrial) indJobs += def.jobs;
      if (def.isService)                        serviceBuildingCount += 1;
    }

    // Income = population × resTaxRate × factor
    //        + commercial jobs × comTaxRate × factor
    //        + industrial jobs × indTaxRate × factor
    stats.monthlyIncome = Math.floor(
      stats.population * stats.resTaxRate * RES_INCOME_PER_PERSON_PER_PCT +
      comJobs          * stats.comTaxRate * COM_INCOME_PER_JOB_PER_PCT    +
      indJobs          * stats.indTaxRate * IND_INCOME_PER_JOB_PER_PCT,
    );

    // ── Expenses ───────────────────────────────────────────────────────────
    // Count every tile that has a road of any type.
    let roadTileCount = 0;
    map.forEach((tile) => {
      if (tile.roadType !== RoadType.None) roadTileCount += 1;
    });

    // Expenses = road tiles × maintenance rate
    //          + service buildings × monthly operating cost
    stats.monthlyExpenses = Math.floor(
      roadTileCount        * ROAD_MAINTENANCE_PER_TILE    +
      serviceBuildingCount * SERVICE_BUILDING_MONTHLY_COST,
    );

    // ── Apply to treasury ──────────────────────────────────────────────────
    stats.money += stats.monthlyIncome - stats.monthlyExpenses;

    // ── Bankruptcy warning ─────────────────────────────────────────────────
    // Set the flag whenever the treasury is in the red.
    stats.bankruptcyWarning = stats.money < 0;
  }
}
