// ⚠️  This file must NOT import anything from @babylonjs/core.

/**
 * Coverage arithmetic shared by police and fire, whose crews drive the road
 * network (see roadDispatch). Power and water run along the streets instead
 * (see utilityGrid).
 */

/**
 * Coverage from two stations that both reach a tile: overlapping patrols add
 * up with diminishing returns (two at 20 make 36, never past 100), so a
 * district between two stations is not left with only the weaker reach.
 */
export function combineCoverage(a: number, b: number): number {
  return Math.round(100 - (100 - a) * (100 - b) / 100);
}

/** Linear 100 → 0 falloff used by police/fire coverage (distance in road steps). */
export function coverageAtDistance(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  return Math.round(100 * (1 - dist / radius));
}
