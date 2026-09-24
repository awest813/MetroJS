// ⚠️  This file must NOT import anything from @babylonjs/core.

/**
 * Budget levers beyond taxes: how much the city spends on police and fire
 * and on road upkeep, and bonds for cash now against payments later.
 *
 * Funding moves upkeep and service together: police and fire at 70% cost
 * 70% and reach 70% as far; roads at 70% cost 70% to keep, but worn roads
 * carry less, so their traffic reads heavier. Plants and water towers always
 * run at full cost — cutting them would black out the city.
 */

/** Police and fire funding, percent: 50–120 in steps of 10. */
export const SAFETY_FUNDING_MIN = 50;
export const SAFETY_FUNDING_MAX = 120;

/** Road upkeep funding, percent: 50–100 in steps of 10 (no gold-plating). */
export const ROAD_FUNDING_MIN = 50;
export const ROAD_FUNDING_MAX = 100;

export const FUNDING_STEP = 10;

/** A funding level on the slider's steps, inside its range. */
export function clampFunding(percent: number, min: number, max: number): number {
  const stepped = Math.round(percent / FUNDING_STEP) * FUNDING_STEP;
  return Math.max(min, Math.min(max, Number.isFinite(stepped) ? stepped : 100));
}

/** Police or fire reach in road steps at this funding (never below one step). */
export function fundedReach(radius: number, fundingPercent: number): number {
  if (radius <= 0) return 0;
  return Math.max(1, Math.round(radius * fundingPercent / 100));
}

/**
 * Traffic multiplier on roads kept at this funding: 1 at full upkeep, 1.5 at
 * half. Potholes and lane closures squeeze the same trips into less road.
 */
export function roadWearFactor(roadFundingPercent: number): number {
  return 1 + Math.max(0, 100 - roadFundingPercent) / 100;
}

/** Cash a bond puts in the treasury. */
export const BOND_AMOUNT = 10_000;

/** Months a bond is repaid over. */
export const BOND_TERM_MONTHS = 24;

/** Interest over the whole term: a $10,000 bond costs $12,000 in all. */
export const BOND_INTEREST = 0.2;

/** Bonds the city may carry at once. */
export const MAX_BONDS = 3;

/** One bond being repaid: what is still owed, and the monthly payment. */
export interface Bond {
  owed: number;
  readonly payment: number;
}

/** A new bond at today's terms. */
export function newBond(): Bond {
  const owed = Math.round(BOND_AMOUNT * (1 + BOND_INTEREST));
  return { owed, payment: Math.round(owed / BOND_TERM_MONTHS) };
}

/** What the bonds will take next month (the last payment is only what is left). */
export function bondPayments(bonds: readonly Bond[]): number {
  let total = 0;
  for (const bond of bonds) total += Math.min(bond.payment, bond.owed);
  return total;
}

/** Take a month's payments off every bond, drop the ones paid off, and return what was paid. */
export function payBonds(bonds: Bond[]): number {
  let paid = 0;
  for (const bond of bonds) {
    const due = Math.min(bond.payment, bond.owed);
    bond.owed -= due;
    paid += due;
  }
  for (let i = bonds.length - 1; i >= 0; i--) {
    if (bonds[i].owed <= 0) bonds.splice(i, 1);
  }
  return paid;
}

/** Total still owed on every bond. */
export function bondDebt(bonds: readonly Bond[]): number {
  let total = 0;
  for (const bond of bonds) total += bond.owed;
  return total;
}
