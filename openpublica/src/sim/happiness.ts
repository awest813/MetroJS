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
}

/**
 * One happiness write from the current map and overlay stats.
 *
 * Traffic, walk, transit, and crime only publish their inputs. Calling this
 * twice with the same inputs does not stack.
 */
export function composeHappiness(
  map: CityMap,
  stats: HappinessInputs & { happiness: number },
  applyCrime: boolean,
): void {
  let roads = 0;
  let extreme = 0;
  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    roads += 1;
    if (tile.trafficPressure >= EXTREME_TRAFFIC_PRESSURE) extreme += 1;
  });

  let next = 100 - Math.round((JAM_HAPPINESS_WEIGHT * extreme) / Math.max(roads, JAM_MIN_ROADS));
  next = Math.max(0, Math.min(100, next));

  const walkBonus = Math.min(
    WALK_MAX_HAPPINESS,
    Math.round(stats.walkability / WALK_HAPPINESS_DIVISOR),
  );
  const transitBonus = Math.min(
    TRANSIT_MAX_HAPPINESS,
    Math.round(stats.transitAccess / TRANSIT_HAPPINESS_DIVISOR),
  );
  next = Math.max(0, Math.min(100, next + walkBonus + transitBonus));

  if (applyCrime) {
    next = Math.max(0, next - Math.round(stats.crimeAverage * CRIME_HAPPINESS_MULTIPLIER));
  }

  stats.happiness = next;
}
