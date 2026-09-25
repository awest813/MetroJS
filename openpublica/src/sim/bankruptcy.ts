// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { BudgetTally } from './EconomySystem';

/**
 * What happens to a city that stays in debt (docs/STRATEGY_AND_GAMEFLOW.md,
 * G10). After a year the council cuts police, fire, and road funding to the
 * minimum and holds it there until the treasury is out of the red. After two
 * years the state steps in: it clears the debt and the bonds, holds every tax
 * at 12% for five years, and the rating carries a penalty while it does. Or
 * the player starts a new city.
 */

/** Months in debt before the council cuts funding to the minimum. */
export const COUNCIL_CUT_MONTHS = 12;

/** Months in debt before the state offers a bailout. */
export const BAILOUT_OFFER_MONTHS = 24;

/** Every tax is held here while the bailout's terms run. */
export const BAILOUT_TAX_RATE = 12;

/** How long the bailout's terms run, in months. */
export const BAILOUT_TERM_MONTHS = 60;

/** Rating lost while the bailout's terms run. */
export const BAILOUT_RATING_PENALTY = 10;

/** What happened at a month's end: the council's cuts, or the state's offer. */
export type CouncilEvent = 'cuts' | 'bailout';

export interface CityCost {
  readonly label: string;
  readonly amount: number;
}

/** The month's costs, biggest first, without the ones at zero. */
export function biggestCosts(tally: BudgetTally | null | undefined, count = 2): CityCost[] {
  if (!tally) return [];
  const civic = tally.serviceExpenses - tally.safetyExpenses;
  const costs: CityCost[] = [
    { label: 'roads', amount: tally.roadExpenses },
    { label: 'police and fire', amount: tally.safetyExpenses },
    { label: 'plants, towers, and parks', amount: civic },
    { label: 'bond repayments', amount: tally.bondExpenses },
  ];
  return costs
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count);
}

/** "roads $783 and bond repayments $500 a month", or null with no costs. */
export function formatCosts(costs: readonly CityCost[]): string | null {
  if (costs.length === 0) return null;
  const items = costs.map((c) => `${c.label} $${Math.round(c.amount).toLocaleString('en-US')}`);
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `${list} a month`;
}
