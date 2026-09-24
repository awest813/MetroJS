// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType, TerrainType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import { bondPayments, payBonds, type Bond } from './budgetLevers';

// ── Named constants ────────────────────────────────────────────────────────

/** Starting city treasury in dollars. */
export const STARTING_MONEY = 10_000;

/**
 * Monthly income per resident for every 1% of residential tax rate.
 *
 * Income_res = population × resTaxRate × RES_INCOME_PER_PERSON_PER_PCT
 */
const RES_INCOME_PER_PERSON_PER_PCT = 0.3;

/**
 * Monthly income per commercial job for every 1% of commercial tax rate.
 *
 * Income_com = comJobs × comTaxRate × COM_INCOME_PER_JOB_PER_PCT
 */
const COM_INCOME_PER_JOB_PER_PCT = 0.25;

/**
 * Monthly income per industrial job for every 1% of industrial tax rate.
 *
 * Income_ind = indJobs × indTaxRate × IND_INCOME_PER_JOB_PER_PCT
 */
const IND_INCOME_PER_JOB_PER_PCT = 0.2;

/**
 * Monthly maintenance cost (dollars) per road tile.
 *
 * Expense_roads = roadTileCount × ROAD_MAINTENANCE_PER_TILE
 */
const ROAD_MAINTENANCE_PER_TILE = 3;

/**
 * Monthly maintenance per highway tile. Between street and trolley:
 * a wider deck, not overhead wire.
 */
const HIGHWAY_MAINTENANCE_PER_TILE = 6;

/**
 * Monthly maintenance cost (dollars) per trolley avenue tile.
 * Higher than a normal street because of overhead wire maintenance,
 * track upkeep, and transit operations.
 */
const TROLLEY_MAINTENANCE_PER_TILE = 8;

/**
 * Upkeep multiplier for a road tile laid over water (a bridge span).
 * Decks, bearings, and piers cost more to keep than asphalt on dirt.
 */
export const BRIDGE_UPKEEP_MULTIPLIER = 3;

/** Monthly upkeep for one road tile of this type, bridges included. */
export function roadUpkeep(type: RoadType, overWater: boolean): number {
  let base = 0;
  if (type === RoadType.Street) base = ROAD_MAINTENANCE_PER_TILE;
  else if (type === RoadType.Highway) base = HIGHWAY_MAINTENANCE_PER_TILE;
  else if (type === RoadType.TrolleyAvenue) base = TROLLEY_MAINTENANCE_PER_TILE;
  return overWater ? base * BRIDGE_UPKEEP_MULTIPLIER : base;
}

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
 *                 + (bridge tiles pay × BRIDGE_UPKEEP_MULTIPLIER)
 *                 + sum(service.monthlyCost)   (police and fire × funding)
 *                 + bond payments
 * ```
 * Road upkeep is scaled by road funding as well as the weather.
 *
 * ## Treasury update
 * ```
 * money += monthlyIncome - monthlyExpenses
 * ```
 * If `money` drops below zero, `stats.bankruptcyWarning` is set to `true`.
 */
export function serviceUpkeep(
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
  /** Police and fire funding, percent: their stations cost this share of full upkeep. */
  safetyFunding = 100,
): number {
  let total = 0;
  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (!def?.isService) continue;
    const cost = def.monthlyCost ?? SERVICE_BUILDING_MONTHLY_COST;
    total += def.policeRadius || def.fireRadius ? cost * safetyFunding / 100 : cost;
  }
  return Math.round(total);
}

/** Police and fire station upkeep alone, at this funding. */
export function safetyUpkeep(
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
  safetyFunding = 100,
): number {
  let total = 0;
  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (def?.isService && (def.policeRadius || def.fireRadius)) {
      total += (def.monthlyCost ?? SERVICE_BUILDING_MONTHLY_COST) * safetyFunding / 100;
    }
  }
  return Math.round(total);
}

/** The budget levers beyond taxes (see `budgetLevers.ts`). */
export interface BudgetLevers {
  /** Police and fire funding, percent. */
  readonly safetyFunding: number;
  /** Road upkeep funding, percent. */
  readonly roadFunding: number;
  /** Bonds being repaid. */
  readonly bonds: readonly Bond[];
}

export const FULL_FUNDING: BudgetLevers = { safetyFunding: 100, roadFunding: 100, bonds: [] };

/** One month of tax take and upkeep, without charging the treasury. */
export interface BudgetTally {
  income: number;
  /** Each tax's share of `income`. */
  resIncome: number;
  comIncome: number;
  indIncome: number;
  /** Road upkeep, weather extra included. */
  roadExpenses: number;
  /** The part of `roadExpenses` the month's weather adds (snow clearing). */
  weatherRoadExpenses: number;
  serviceExpenses: number;
  /** The part of `serviceExpenses` that is police and fire (scaled by their funding). */
  safetyExpenses: number;
  /** Bond repayments due. */
  bondExpenses: number;
  expenses: number;
}

/**
 * What the next billed month would collect and spend at the current layout.
 * Does not mutate `stats.money` or last-billed totals.
 */
export function tallyBudget(
  map: CityMap,
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
  stats: CityStats,
  /** Weather multiplier on road upkeep (snow makes it dearer). */
  roadUpkeepFactor = 1,
  levers: BudgetLevers = FULL_FUNDING,
): BudgetTally {
  let comJobs = 0;
  let indJobs = 0;

  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (!def) continue;

    if (def.zoneType === ZoneType.Commercial || def.zoneType === ZoneType.MixedUse) comJobs += def.jobs;
    if (def.zoneType === ZoneType.Industrial) indJobs += def.jobs;
  }

  const serviceExpenses = serviceUpkeep(buildings, defs, levers.safetyFunding);
  const safetyExpenses = safetyUpkeep(buildings, defs, levers.safetyFunding);

  const resIncome = Math.floor(stats.population * stats.resTaxRate * RES_INCOME_PER_PERSON_PER_PCT);
  const comIncome = Math.floor(comJobs * stats.comTaxRate * COM_INCOME_PER_JOB_PER_PCT);
  const indIncome = Math.floor(indJobs * stats.indTaxRate * IND_INCOME_PER_JOB_PER_PCT);

  let roadUpkeepTotal = 0;
  map.forEach((tile) => {
    roadUpkeepTotal += roadUpkeep(tile.roadType, tile.terrain === TerrainType.Water);
  });
  const funded = roadUpkeepTotal * levers.roadFunding / 100;
  const baseRoads = Math.floor(funded);
  const roadExpenses = Math.floor(funded * Math.max(1, roadUpkeepFactor));
  const bondExpenses = bondPayments(levers.bonds);

  return {
    income: resIncome + comIncome + indIncome,
    resIncome,
    comIncome,
    indIncome,
    roadExpenses,
    weatherRoadExpenses: roadExpenses - baseRoads,
    serviceExpenses,
    safetyExpenses,
    bondExpenses,
    expenses: roadExpenses + serviceExpenses + bondExpenses,
  };
}

export class EconomySystem implements BudgetLevers {
  /** Weather multiplier on road upkeep (snow clearing). */
  roadUpkeepFactor = 1;

  /** Police and fire funding, percent (set through `CitySim.setSafetyFunding`). */
  safetyFunding = 100;

  /** Road upkeep funding, percent (set through `CitySim.setRoadFunding`). */
  roadFunding = 100;

  /** Bonds being repaid, paid down at each month end. */
  readonly bonds: Bond[] = [];

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
    const tally = tallyBudget(map, buildings, defs, stats, this.roadUpkeepFactor, this);
    payBonds(this.bonds);

    stats.monthlyIncome     = tally.income;
    stats.serviceExpenses   = tally.serviceExpenses;
    stats.monthlyExpenses   = tally.expenses;
    stats.projectedIncome   = tally.income;
    stats.projectedExpenses = tally.expenses;

    // ── Apply to treasury ──────────────────────────────────────────────────
    stats.money += tally.income - tally.expenses;

    // ── Bankruptcy warning ─────────────────────────────────────────────────
    stats.bankruptcyWarning = stats.money < 0;
  }
}
