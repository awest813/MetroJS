// ⚠️  This file must NOT import anything from @babylonjs/core.

import rawDefs from '../data/buildings.json';
import type { CityStats } from './CitySim';

/**
 * Small-town tiers of the civic services (docs/STRATEGY_AND_GAMEFLOW.md, G4).
 * A village cannot carry a fire station's, a police station's, or a water
 * tower's upkeep, so each has a cheap first tier with less reach or capacity:
 * a volunteer fire hall, a police post, a water pump. The advice names the
 * cheap one until the budget can carry the full one.
 */

export type TieredService = 'fire' | 'police' | 'water';

export interface ServiceTier {
  /** Building def id. */
  readonly defId: string;
  /** How advice names it: "a fire station", "a volunteer fire hall". */
  readonly name: string;
  readonly upkeep: number;
}

export interface ServiceTiers {
  readonly full: ServiceTier;
  readonly small: ServiceTier;
}

const upkeepOf = (defId: string): number =>
  (rawDefs as ReadonlyArray<{ id: string; monthlyCost?: number }>).find((d) => d.id === defId)?.monthlyCost ?? 0;

const tier = (defId: string, name: string): ServiceTier => ({ defId, name, upkeep: upkeepOf(defId) });

export const SERVICE_TIERS: Readonly<Record<TieredService, ServiceTiers>> = {
  fire: { full: tier('small_fire_station', 'fire station'), small: tier('volunteer_fire_hall', 'volunteer fire hall') },
  police: { full: tier('small_police_station', 'police station'), small: tier('police_post', 'police post') },
  water: { full: tier('small_water_tower', 'water tower'), small: tier('water_pump', 'water pump') },
};

/**
 * Whether the budget carries `upkeep` more a month, with as much again to
 * spare: one good month (a burst of new residents) is not a budget.
 */
export function budgetCarries(stats: Pick<CityStats, 'projectedIncome' | 'projectedExpenses'>, upkeep: number): boolean {
  return stats.projectedIncome - stats.projectedExpenses >= 2 * upkeep;
}

/** The tier to build now: the full one once the budget carries its upkeep, else the small one. */
export function tierToBuild(
  service: TieredService,
  stats: Pick<CityStats, 'projectedIncome' | 'projectedExpenses'>,
): ServiceTier {
  const tiers = SERVICE_TIERS[service];
  return budgetCarries(stats, tiers.full.upkeep) ? tiers.full : tiers.small;
}

/** The service a def is a tier of, and which tier. */
export function tierOf(defId: string): { service: TieredService; small: boolean } | null {
  for (const service of Object.keys(SERVICE_TIERS) as TieredService[]) {
    const tiers = SERVICE_TIERS[service];
    if (tiers.full.defId === defId) return { service, small: false };
    if (tiers.small.defId === defId) return { service, small: true };
  }
  return null;
}

/**
 * True when placing `defId` on a lot holding `existingDefId` upgrades it: the
 * full tier over its own small tier (a pump to a tower, a hall to a station).
 */
export function isTierUpgrade(existingDefId: string | null, defId: string): boolean {
  if (!existingDefId) return false;
  const from = tierOf(existingDefId);
  const to = tierOf(defId);
  return !!from && !!to && from.small && !to.small && from.service === to.service;
}
