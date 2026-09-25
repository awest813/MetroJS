// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType } from './CityTile';

/** trafficPressure at or above this counts as an extreme road for happiness. */
export const EXTREME_TRAFFIC_PRESSURE = 8;

/**
 * Happiness lost if every road were jammed; a city loses its jammed share of
 * this. (A flat 2 per jammed tile put every city with a busy downtown at
 * zero, however large the rest of it.)
 */
export const JAM_HAPPINESS_WEIGHT = 80;

/** A network shorter than this counts as this long, so one jammed village street stings but is not a jammed city. */
export const JAM_MIN_ROADS = 20;

/** Cap on the walkability happiness bonus. */
export const WALK_MAX_HAPPINESS = 20;

/** stats.walkability / this, then capped, is the walk bonus. */
export const WALK_HAPPINESS_DIVISOR = 5;

/** Cap on the transit happiness bonus. */
export const TRANSIT_MAX_HAPPINESS = 15;

/** stats.transitAccess / this, then capped, is the transit bonus. */
export const TRANSIT_HAPPINESS_DIVISOR = 5;

/** Happiness lost per point of city-wide crime average. */
export const CRIME_HAPPINESS_MULTIPLIER = 0.25;

export interface HappinessInputs {
  walkability: number;
  transitAccess: number;
  crimeAverage: number;
  /** Working civic buildings (sim/civic.ts): a clinic, a stadium. */
  civic?: { readonly happiness: number };
}

/** What made this month's happiness: the two costs, and the bonuses that won some of it back. */
export interface HappinessParts {
  /** Lost to jammed roads. */
  readonly jams: number;
  /** Lost to crime. */
  readonly crime: number;
  /** Walkable streets' bonus (it only fills back up to 100). */
  readonly walk: number;
  /** Transit's bonus (likewise). */
  readonly transit: number;
  /** Civic buildings' bonus (a clinic, a stadium; likewise). */
  readonly civic?: number;
}

/** Happiness at or above this draws everyone housing demand promises. */
export const HAPPY_DRAW = 80;

/** At or below this nobody moves in, and unhappy residents leave a few buildings a month. */
export const UNHAPPY_FLOOR = 30;

/**
 * Share of housing demand people act on at this happiness: all of it from
 * {@link HAPPY_DRAW}, none at {@link UNHAPPY_FLOOR}, in a straight line
 * between. A city of jams and crime stops drawing residents even while its
 * jobs call for them.
 */
export function happinessDraw(happiness: number): number {
  if (!Number.isFinite(happiness)) return 1;
  return Math.max(0, Math.min(1, (happiness - UNHAPPY_FLOOR) / (HAPPY_DRAW - UNHAPPY_FLOOR)));
}

/**
 * One happiness write from the current map and overlay stats.
 *
 * Traffic, walk, transit, and crime only publish their inputs. Calling this
 * twice with the same inputs does not stack.
 */
export function composeHappiness(
  map: CityMap,
  stats: HappinessInputs & { happiness: number; happinessParts?: HappinessParts },
  applyCrime: boolean,
): void {
  let roads = 0;
  let extreme = 0;
  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    roads += 1;
    if (tile.trafficPressure >= EXTREME_TRAFFIC_PRESSURE) extreme += 1;
  });

  const jams = Math.min(100, Math.round((JAM_HAPPINESS_WEIGHT * extreme) / Math.max(roads, JAM_MIN_ROADS)));
  let next = 100 - jams;

  const walkBonus = Math.min(
    WALK_MAX_HAPPINESS,
    Math.round(stats.walkability / WALK_HAPPINESS_DIVISOR),
  );
  const transitBonus = Math.min(
    TRANSIT_MAX_HAPPINESS,
    Math.round(stats.transitAccess / TRANSIT_HAPPINESS_DIVISOR),
  );
  next = Math.max(0, Math.min(100, next + walkBonus + transitBonus));

  const crime = applyCrime ? Math.round(stats.crimeAverage * CRIME_HAPPINESS_MULTIPLIER) : 0;
  next = Math.max(0, next - crime);

  // A clinic or a stadium lifts everyone, crime or not (up to 100).
  const civicBonus = Math.max(0, stats.civic?.happiness ?? 0);
  next = Math.min(100, next + civicBonus);

  stats.happiness = next;
  stats.happinessParts = {
    jams, crime, walk: walkBonus, transit: transitBonus,
    ...(civicBonus > 0 ? { civic: civicBonus } : {}),
  };
}
