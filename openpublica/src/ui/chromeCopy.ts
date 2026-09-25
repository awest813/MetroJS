import { HAPPY_DRAW, UNHAPPY_FLOOR, happinessDraw, type HappinessParts } from '../sim/happiness';

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

/** What each tax slider does, for its tooltip. */
export const TAX_HINTS: Readonly<Record<'res' | 'com' | 'ind', string>> = {
  res: 'Each point above 9% cuts housing demand by 2 a month; each point below adds 2. At 16% an empty town draws nobody.',
  com: 'Each point above 9% lowers the shop demand target by 4; each point below raises it by 4.',
  ind: 'Each point above 9% lowers the factory demand target by 4; each point below raises it by 4.',
};

/** Shop demand: how many shop and office jobs the residents keep busy, and how many are open. */
export function commerceTooltip(
  stats: { commercialDemand: number; population: number; shopJobs?: number; comTaxRate: number },
  jobsPerResident: number,
): string {
  const room = Math.round(stats.population * jobsPerResident);
  const open = stats.shopJobs ?? 0;
  const why = stats.population <= 0
    ? 'shops wait for residents'
    : `${stats.population.toLocaleString()} residents keep up to ${room.toLocaleString()} shop and office jobs busy; ${open.toLocaleString()} are open`;
  const tax = stats.comTaxRate > 9 ? `. Commercial tax at ${stats.comTaxRate}% holds it down` : '';
  return `Shop demand ${Math.round(stats.commercialDemand)}%: ${why}${tax}. Walkable streets and transit raise it.`;
}

/** Factory demand: the residents without work, and the tax. */
export function industryTooltip(stats: { industrialDemand: number; population: number; jobs: number; indTaxRate: number }): string {
  const idle = Math.max(0, stats.population - stats.jobs);
  const why = idle > 0
    ? `${idle.toLocaleString()} residents have no job, and factories open to hire them`
    : 'every resident has a job, so few new factories open';
  const tax = stats.indTaxRate > 9 ? `. Industrial tax at ${stats.indTaxRate}% holds it down` : '';
  return `Factory demand ${Math.round(stats.industrialDemand)}%: ${why}${tax}.`;
}

/**
 * The HUD's happiness tooltip: what cost it, what won some back, and how
 * much of the housing demand it lets move in.
 */
export function happinessTooltip(happiness: number, parts: HappinessParts | undefined): string {
  const share = Math.round(happinessDraw(happiness) * 100);
  const why = parts
    ? `jammed roads −${parts.jams}, crime −${parts.crime}; walkable streets +${parts.walk} and transit +${parts.transit} win some back`
    : 'jammed roads and crime cost it; walkable streets and transit win some back';
  const draw = share >= 100
    ? `At ${HAPPY_DRAW} or more, everyone the housing demand calls for moves in.`
    : share <= 0
      ? `At ${UNHAPPY_FLOOR} or less nobody moves in, and residents leave.`
      : `Below ${HAPPY_DRAW} fewer people move in: ${share}% of the housing demand now; none at ${UNHAPPY_FLOOR}.`;
  return `Happiness ${happiness}: ${why}. ${draw}`;
}
