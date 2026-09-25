import { HAPPY_DRAW, UNHAPPY_FLOOR, happinessDraw, type HappinessParts } from '../sim/happiness';
import { taxDraw, taxOccupancy } from '../sim/taxes';
import { RATING_PART, type RatingParts } from '../sim/EvaluationSystem';
import { milestoneShortfall, nextMilestone, tierName, type Milestone } from '../sim/milestones';
import type { CityStats } from '../sim/CitySim';

/**
 * Shared chrome strings and money formatting. No DOM — Jest can load this.
 */

export const SETTINGS_SHORTCUTS =
  'R road · I inspect · Z housing · C shops · N industry · U mixed · G plant · O police · F fire · W water (Shift: village post, hall, pump) · K park · 1–3 views · P pause · [ ] speed · M mute · Ctrl+S save · Esc · Home frame';

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
  res: 'Each point above 9% leaves 4% of homes empty and turns away 7% of newcomers; each point below draws 5% more newcomers.',
  com: 'Each point above 9% leaves 4% of shop jobs empty and slows new shops by 7%; each point below speeds them by 5%.',
  ind: 'Each point above 9% leaves 4% of factory jobs empty and slows new factories by 7%; each point below speeds them by 5%.',
};

/** What a tax rate does to its zone, for a tooltip: "At 12%, 12% of shop jobs stand empty and 21% fewer open". */
function taxEffect(rate: number, places: string, newcomers: string): string {
  if (rate > 9) {
    const empty = Math.round((1 - taxOccupancy(rate)) * 100);
    const away = Math.round((1 - taxDraw(rate)) * 100);
    return ` At ${rate}% tax, ${empty}% of ${places} stand empty and ${away}% fewer ${newcomers}.`;
  }
  if (rate < 9) return ` At ${rate}% tax, ${Math.round((taxDraw(rate) - 1) * 100)}% more ${newcomers}.`;
  return '';
}

/** " The bar shows the 65% that acts." when the tax moves it. */
function actingNote(demand: number, acting: number): string {
  return Math.round(acting) !== Math.round(demand) ? ` The bar shows the ${Math.round(acting)}% that acts.` : '';
}

/** Housing demand, and what happiness and the residential tax let act. */
export function housingTooltip(stats: { residentialDemand: number; happiness: number; resTaxRate: number }, acting: number): string {
  const turned: string[] = [];
  const mood = happinessDraw(stats.happiness);
  if (mood < 1) turned.push(`happiness ${stats.happiness} turns ${Math.round((1 - mood) * 100)}% away`);
  const draw = taxDraw(stats.resTaxRate);
  if (draw < 1) turned.push(`${stats.resTaxRate}% tax turns ${Math.round((1 - draw) * 100)}% away`);
  if (draw > 1) turned.push(`${stats.resTaxRate}% tax draws ${Math.round((draw - 1) * 100)}% more`);
  const act = turned.length > 0 ? `; ${turned.join(' and ')}, so ${acting}% act on it` : '';
  const empty = stats.resTaxRate > 9
    ? ` At this tax ${Math.round((1 - taxOccupancy(stats.resTaxRate)) * 100)}% of homes stand empty.`
    : '';
  return `Housing demand ${Math.round(stats.residentialDemand)}%: people move in while jobs outnumber homes${act}.${empty}`;
}

/** Shop demand: how many shop and office jobs the residents keep busy, and how many are open. */
export function commerceTooltip(
  stats: { commercialDemand: number; population: number; shopJobs?: number; comTaxRate: number },
  jobsPerResident: number,
  /** The demand shops act on (after the tax), when it differs. */
  acting = stats.commercialDemand,
): string {
  const room = Math.round(stats.population * jobsPerResident);
  const open = stats.shopJobs ?? 0;
  const why = stats.population <= 0
    ? 'shops wait for residents'
    : `${stats.population.toLocaleString()} residents keep up to ${room.toLocaleString()} shop and office jobs busy; ${open.toLocaleString()} are open`;
  return `Shop demand ${Math.round(stats.commercialDemand)}%: ${why}. Walkable streets and transit raise it.${taxEffect(stats.comTaxRate, 'shop jobs', 'shops open')}${actingNote(stats.commercialDemand, acting)}`;
}

/** Factory demand: the residents without work, and the tax. */
export function industryTooltip(
  stats: { industrialDemand: number; population: number; jobs: number; indTaxRate: number },
  /** The demand factories act on (after the tax), when it differs. */
  acting = stats.industrialDemand,
): string {
  const idle = Math.max(0, stats.population - stats.jobs);
  const why = idle > 0
    ? `${idle.toLocaleString()} residents have no job, and factories open to hire them`
    : 'every resident has a job, so few new factories open';
  return `Factory demand ${Math.round(stats.industrialDemand)}%: ${why}.${taxEffect(stats.indTaxRate, 'factory jobs', 'factories open')}${actingNote(stats.industrialDemand, acting)}`;
}

/**
 * The HUD's happiness tooltip: what cost it, what won some back, and how
 * much of the housing demand it lets move in.
 */
/**
 * City rating tooltip: the four parts it is made of and what it loses.
 * "Rating 76: size +19, happiness +19, services +23, budget +25; smog −10."
 */
export function ratingTooltip(rating: number, parts: RatingParts | undefined): string {
  if (!parts) return `Rating ${rating} of 100: size, happiness, services, and budget, less smog, high taxes, and debt.`;
  const gains = `size +${parts.size}, happiness +${parts.happiness}, services +${parts.services}, budget +${parts.budget}`;
  const losses = [
    parts.smog > 0 ? `smog −${parts.smog}` : null,
    parts.taxes > 0 ? `taxes over 9% −${parts.taxes}` : null,
    parts.other > 0 ? `no plant or debt −${parts.other}` : null,
  ].filter((l): l is string => l !== null);
  return `Rating ${rating} of 100: ${gains}${losses.length ? `; ${losses.join(', ')}` : ''}. Each part is worth up to 25.`;
}

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

/** What holds the rating down most, as a clause: "smog costs 9", "services earn 12 of 25". */
export function ratingDrag(parts: RatingParts | undefined): string | null {
  if (!parts) return null;
  const drags: Array<[number, string]> = [
    [parts.smog, `smog costs ${parts.smog}`],
    [parts.taxes, `taxes over 9% cost ${parts.taxes}`],
    [parts.other, `debt or a missing plant costs ${parts.other}`],
    [RATING_PART - parts.happiness, `happiness earns ${parts.happiness} of ${RATING_PART}`],
    [RATING_PART - parts.services, `services earn ${parts.services} of ${RATING_PART}`],
    [RATING_PART - parts.budget, `the budget earns ${parts.budget} of ${RATING_PART}`],
  ];
  const [amount, text] = drags.reduce((a, b) => (b[0] > a[0] ? b : a));
  return amount > 0 ? text : null;
}

type MilestoneStats = Pick<CityStats, 'population' | 'jobs' | 'approval' | 'money' | 'bankruptcyWarning' | 'ratingParts'>;

/** HUD milestone readout: "Town 312/400", then what else is missing once the people are there. */
export function milestoneLabel(stats: MilestoneStats, reached: number): string {
  const next = nextMilestone(reached);
  if (!next) return tierName(reached);
  const base = `${next.name} ${stats.population.toLocaleString()}/${next.population.toLocaleString()}`;
  const short = milestoneShortfall(stats, next);
  if (short.people > 0) return base;
  if (short.rating > 0) return `${base} · rating ${stats.approval}/${next.rating}`;
  if (short.jobs > 0) return `${base} · jobs ${stats.jobs.toLocaleString()}/${(stats.jobs + short.jobs).toLocaleString()}`;
  if (short.debt) return `${base} · in debt`;
  return base;
}

/** Milestone tooltip: what the next tier needs, what is still missing and why, and its grant. */
export function milestoneTooltip(stats: MilestoneStats, reached: number): string {
  const next = nextMilestone(reached);
  const tier = tierName(reached);
  if (!next) return `${tier}: the top tier. ${stats.population.toLocaleString()} people, rating ${stats.approval}.`;
  const needs = [
    `${next.population.toLocaleString()} people`,
    `a rating of ${next.rating}`,
    ...(next.jobsShare > 0 ? [`jobs for ${Math.round(next.jobsShare * 100)}% of them`] : []),
    'no debt',
  ];
  const short = milestoneShortfall(stats, next);
  const todo: string[] = [];
  if (short.people > 0) todo.push(`${short.people.toLocaleString()} more people (the advisory says what holds growth back)`);
  if (short.rating > 0) {
    const drag = ratingDrag(stats.ratingParts);
    todo.push(`${short.rating} more rating point${short.rating === 1 ? '' : 's'}${drag ? ` (${drag})` : ''}`);
  }
  if (short.jobs > 0) todo.push(`${short.jobs.toLocaleString()} more jobs (zone shops or factories)`);
  if (short.debt) todo.push('get out of debt');
  const status = todo.length > 0
    ? `Still needed: ${todo.join('; ')}.`
    : `All met: ${next.name} at the month's end.`;
  return `${tier} → ${next.name}: ${joinAnd(needs)}. ${status} It pays a $${next.grant.toLocaleString('en-US')} state grant.`;
}

/** The banner on reaching a milestone: a title and a line. */
export function milestoneBanner(milestone: Milestone, reached: number, population: number): { title: string; body: string } {
  const next = nextMilestone(reached);
  const grant = `The state sends a $${milestone.grant.toLocaleString('en-US')} grant.`;
  const after = next
    ? `Next: ${next.name} at ${next.population.toLocaleString()} people.`
    : 'It is the top tier.';
  return {
    title: `${milestone.name}!`,
    body: `${Math.max(milestone.population, population).toLocaleString()} people call this place home. ${grant} ${after}`,
  };
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
