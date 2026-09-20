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
 * Monthly maintenance per highway tile. Between street and trolley:
 * a wider deck, not overhead wire.
 */
const HIGHWAY_MAINTENANCE_PER_TILE = 4;

/**
 * Monthly maintenance cost (dollars) per trolley avenue tile.
 * Higher than a normal street because of overhead wire maintenance,
 * track upkeep, and transit operations.
 */
const TROLLEY_MAINTENANCE_PER_TILE = 5;

/**
 * Monthly operating cost (dollars) used when a service building omits monthlyCost.
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
 * monthlyExpenses = streetTileCount   × ROAD_MAINTENANCE_PER_TILE
 *                 + highwayTileCount  × HIGHWAY_MAINTENANCE_PER_TILE
 *                 + trolleyTileCount  × TROLLEY_MAINTENANCE_PER_TILE
 *                 + sum(service.monthlyCost)
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
    let serviceExpenses     = 0;

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;

      if (def.zoneType === ZoneType.Commercial || def.zoneType === ZoneType.MixedUse) comJobs += def.jobs;
      if (def.zoneType === ZoneType.Industrial) indJobs += def.jobs;
      if (def.isService) {
        serviceExpenses += def.monthlyCost ?? SERVICE_BUILDING_MONTHLY_COST;
      }
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
    // Count road tiles by type so trolley avenues can carry a higher rate.
    let streetTileCount  = 0;
    let highwayTileCount = 0;
    let trolleyTileCount = 0;
    map.forEach((tile) => {
      if (tile.roadType === RoadType.TrolleyAvenue) {
        trolleyTileCount += 1;
      } else if (tile.roadType === RoadType.Highway) {
        highwayTileCount += 1;
      } else if (tile.roadType === RoadType.Street) {
        streetTileCount += 1;
      }
    });

    stats.serviceExpenses = serviceExpenses;
    stats.monthlyExpenses = Math.floor(
      streetTileCount  * ROAD_MAINTENANCE_PER_TILE    +
      highwayTileCount * HIGHWAY_MAINTENANCE_PER_TILE +
      trolleyTileCount * TROLLEY_MAINTENANCE_PER_TILE +
      serviceExpenses,
    );

    // ── Apply to treasury ──────────────────────────────────────────────────
    stats.money += stats.monthlyIncome - stats.monthlyExpenses;

    // ── Bankruptcy warning ─────────────────────────────────────────────────
    // Set the flag whenever the treasury is in the red.
    stats.bankruptcyWarning = stats.money < 0;
  }
}
