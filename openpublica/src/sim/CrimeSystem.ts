// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';

/** Share of density that becomes crime before police and land value. */
const DENSITY_CRIME = 0.65;

/** High land value suppresses crime; low land value raises it. */
const LAND_VALUE_CRIME = 0.20;

/** Police coverage subtracted from crime (100 coverage can wipe a dense block). */
const POLICE_CRIME_RELIEF = 0.80;

/** Happiness lost per point of city-wide crime average. */
const CRIME_HAPPINESS_MULTIPLIER = 0.25;

/**
 * Writes `tile.crime` [0–100] and `stats.crimeAverage`.
 *
 * crime = clamp(density × 0.65 + (100 − landValue) × 0.20 − policeCoverage × 0.80)
 * Empty (density 0) tiles stay 0. No Micropolis crime RNG.
 *
 * Then, when `applyHappiness` is true (monthly tick only), reduces
 * `stats.happiness` by round(crimeAverage × 0.25) after traffic, walk, and
 * transit have already written happiness. Placement refreshes skip that so
 * parks and stations do not stack the penalty.
 */
export class CrimeSystem {
  tick(map: CityMap, stats: CityStats, applyHappiness = false): void {
    let hot = 0;
    let total = 0;

    map.forEach((tile) => {
      if (tile.populationDensity <= 0) {
        tile.crime = 0;
        return;
      }
      const raw =
        tile.populationDensity * DENSITY_CRIME +
        (100 - tile.landValue) * LAND_VALUE_CRIME -
        tile.policeCoverage * POLICE_CRIME_RELIEF;
      tile.crime = Math.max(0, Math.min(100, Math.round(raw)));
      if (tile.crime <= 0) return;
      hot += 1;
      total += tile.crime;
    });

    stats.crimeAverage = hot > 0 ? Math.round(total / hot) : 0;
    if (!applyHappiness) return;
    stats.happiness = Math.max(
      0,
      stats.happiness - Math.round(stats.crimeAverage * CRIME_HAPPINESS_MULTIPLIER),
    );
  }
}
