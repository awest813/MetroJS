/**
 * Shared chrome strings and money formatting. No DOM — Jest can load this.
 */

export const SETTINGS_SHORTCUTS =
  'R road · I inspect · Z housing · C shops · N industry · U mixed · G plant · O police · F fire · W water · K park · 1–3 views · P pause · [ ] speed · M mute · Ctrl+S save · Esc · Home frame';

/** HUD population. Dark residents stay visible after the lights come on for everyone else. */
export function formatPopulation(population: number, darkPopulation: number): string {
  const pop = Math.max(0, Math.floor(population)).toLocaleString();
  const dark = Math.max(0, Math.floor(darkPopulation));
  if (dark <= 0) return `Pop ${pop}`;
  if (population > 0 && dark >= population) return `Pop ${pop} dark`;
  return `Pop ${pop} · ${dark.toLocaleString()} dark`;
}

export function cityFileNote(hasSave: boolean, justSaved: boolean): string {
  if (justSaved) return 'Saved in this browser.';
  return hasSave ? 'Save kept in this browser.' : 'No save yet.';
}

export function formatSignedMoney(amount: number): string {
  const abs = Math.abs(Math.round(amount)).toLocaleString();
  if (amount < 0) return `-$${abs}`;
  return `$${abs}`;
}

export function formatBudgetNet(income: number, expenses: number): string {
  const net = income - expenses;
  return `${net > 0 ? '+' : ''}${formatSignedMoney(net)}/mo`;
}

/**
 * How long the treasury lasts at a monthly deficit, or null while the budget
 * breaks even. In debt, nothing can be built until it is paid down.
 */
export function formatRunway(money: number, net: number): string | null {
  if (money < 0) return 'In debt: nothing can be built until the treasury is back above $0.';
  if (net >= 0) return null;
  const months = Math.floor(money / -net);
  if (months < 1) return 'Money runs out this month at this rate.';
  if (months >= 24) return null;
  return `Money runs out in about ${months} month${months === 1 ? '' : 's'} at this rate.`;
}

/** What a tax slider does, for its tooltip. */
export const TAX_HINT =
  'Each point above 9% cuts this zone\'s demand by 2 a month; each point below adds 2.';
