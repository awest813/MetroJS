// ⚠️  This file must NOT import anything from @babylonjs/core.

/**
 * What a tax rate does, the same way for all three taxes.
 *
 * Above 9% each point turns away 7% of newcomers (the zone grows more slowly
 * and builds less densely: {@link taxDraw}) and leaves 4% of places standing
 * empty (homes house fewer people, shops and factories fill fewer jobs:
 * {@link taxOccupancy}). Below 9% each point draws 5% more newcomers; places
 * cannot be fuller than full. So a tax buys money with people, less and less
 * of it past about 15%, and no rate empties a town on its own.
 */

/** The rate that neither draws nor turns away. */
export const TAX_NEUTRAL_RATE = 9;

/** Share of newcomers each point over 9% turns away. */
export const TAX_DRAW_PER_POINT_OVER = 0.07;

/** Extra newcomers each point under 9% draws in. */
export const TAX_DRAW_PER_POINT_UNDER = 0.05;

/** Bounds on the draw: taxes never turn away more than 70%, nor draw more than 1.3×. */
export const TAX_DRAW_MIN = 0.3;
export const TAX_DRAW_MAX = 1.3;

/** Share of places each point over 9% leaves empty. */
export const TAX_VACANCY_PER_POINT = 0.04;

/** Places filled at the highest rates. */
export const TAX_OCCUPANCY_MIN = 0.4;

function rateOf(rate: number): number {
  return Number.isFinite(rate) ? rate : TAX_NEUTRAL_RATE;
}

/** Share of a zone's demand that acts at this tax: how many newcomers come, and how dense they build. */
export function taxDraw(rate: number): number {
  const r = rateOf(rate);
  const draw = r >= TAX_NEUTRAL_RATE
    ? 1 - (r - TAX_NEUTRAL_RATE) * TAX_DRAW_PER_POINT_OVER
    : 1 + (TAX_NEUTRAL_RATE - r) * TAX_DRAW_PER_POINT_UNDER;
  return Math.max(TAX_DRAW_MIN, Math.min(TAX_DRAW_MAX, draw));
}

/** Share of a zone's places (residents or jobs) filled at this tax. */
export function taxOccupancy(rate: number): number {
  const r = rateOf(rate);
  if (r <= TAX_NEUTRAL_RATE) return 1;
  return Math.max(TAX_OCCUPANCY_MIN, 1 - (r - TAX_NEUTRAL_RATE) * TAX_VACANCY_PER_POINT);
}

/**
 * What one more point of a tax would add to its monthly take, given what it
 * takes now. The base (every place filled) is the take over rate × occupancy,
 * so the answer counts the places the extra point empties.
 */
export function taxPointGain(take: number, rate: number): number {
  const r = rateOf(rate);
  if (r <= 0 || take <= 0) return 0;
  const base = take / (r * taxOccupancy(r));
  return base * ((r + 1) * taxOccupancy(r + 1) - r * taxOccupancy(r));
}
