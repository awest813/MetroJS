// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityMap } from './CityMap';
import { stationHasRoad } from './roadDispatch';
import { MILESTONES } from './milestones';

/**
 * Late civic buildings (docs/STRATEGY_AND_GAMEFLOW.md, G9): costly to build
 * and run, unlocked by milestones, each with a city-wide effect while it is
 * powered and has a street. A gas plant (Town) is bigger and cleaner power; a
 * clinic (Town) makes people happier; a college (City) lifts land value
 * around it; a stadium (City) makes people happier and brings shoppers; a
 * city hall (Capital) lifts the rating.
 */

/** What the city's working civic buildings add this month. */
export interface CivicBonuses {
  readonly happiness: number;
  readonly shopDemand: number;
  readonly rating: number;
}

export const NO_CIVIC_BONUSES: CivicBonuses = { happiness: 0, shopDemand: 0, rating: 0 };

/** A civic amenity: a building with a city-wide effect (not the gas plant, which is power). */
export function isCivicAmenity(def: BuildingDef): boolean {
  return !!(def.happinessBonus || def.shopDemandBonus || def.ratingBonus || def.landValueBonus);
}

/** A civic building works while it has power and a street. */
export function civicWorks(map: CityMap, instance: BuildingInstance): boolean {
  return !!map.getTile(instance.x, instance.y)?.powered && stationHasRoad(map, instance.x, instance.y);
}

/** City-wide bonuses of the working civic buildings; a unique building counts once. */
export function civicBonuses(
  map: CityMap,
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
): CivicBonuses {
  let happiness = 0;
  let shopDemand = 0;
  let rating = 0;
  const counted = new Set<string>();
  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (!def || !(def.happinessBonus || def.shopDemandBonus || def.ratingBonus)) continue;
    if (def.unique && counted.has(def.id)) continue;
    if (!civicWorks(map, instance)) continue;
    counted.add(def.id);
    happiness += def.happinessBonus ?? 0;
    shopDemand += def.shopDemandBonus ?? 0;
    rating += def.ratingBonus ?? 0;
  }
  return { happiness, shopDemand, rating };
}

/** How advice and banners name the civic buildings. */
export const CIVIC_NAMES: Readonly<Record<string, string>> = {
  gas_power_plant: 'gas plant',
  clinic: 'clinic',
  college: 'college',
  stadium: 'stadium',
  city_hall: 'city hall',
};

/** "a gas plant and a clinic", for a milestone's unlocks; null when none. */
export function unlocksText(defIds: readonly string[]): string | null {
  const names = defIds.map((id) => `a ${CIVIC_NAMES[id] ?? id}`);
  if (names.length === 0) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Building defs some milestone unlocks: locked until it is reached. */
const LOCKED = new Set(MILESTONES.flatMap((m) => m.unlocks));

/** The milestone that unlocks `defId`, or null when it is never locked. */
export function unlockedBy(defId: string): (typeof MILESTONES)[number] | null {
  return MILESTONES.find((m) => m.unlocks.includes(defId)) ?? null;
}

/** Whether a city that has reached `reached` milestones may build `defId`. */
export function isUnlocked(defId: string, reached: number): boolean {
  if (!LOCKED.has(defId)) return true;
  return MILESTONES.slice(0, Math.max(0, reached)).some((m) => m.unlocks.includes(defId));
}
