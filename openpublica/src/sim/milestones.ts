// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityStats } from './CitySim';

/**
 * City tiers the player works toward (docs/STRATEGY_AND_GAMEFLOW.md, G8).
 * Each needs enough people, a rating, no debt, and from Town on work for at
 * least half the residents. Reaching one pays a one-time state grant. Tiers
 * are kept once reached, and are checked at a month's end, one a month.
 *
 * Tuned on the strategy harness (64-tile map): the careful towns reach
 * Village in their first year, Town by year 3, and City by year 5; only the
 * dense mixed-use towns reach Capital. The naive town stops at Village.
 */

export type MilestoneId = 'village' | 'town' | 'city' | 'capital';

export interface Milestone {
  readonly id: MilestoneId;
  readonly name: string;
  readonly population: number;
  /** The city rating (`stats.approval`) needed. */
  readonly rating: number;
  /** Jobs needed for this share of residents (0: none). */
  readonly jobsShare: number;
  /** One-time state grant on reaching it. */
  readonly grant: number;
  /** Civic building defs it unlocks (sim/civic.ts). */
  readonly unlocks: readonly string[];
}

export const MILESTONES: readonly Milestone[] = [
  { id: 'village', name: 'Village', population: 150, rating: 50, jobsShare: 0, grant: 2_000, unlocks: [] },
  { id: 'town', name: 'Town', population: 400, rating: 60, jobsShare: 0.5, grant: 5_000, unlocks: ['gas_power_plant', 'clinic'] },
  { id: 'city', name: 'City', population: 600, rating: 65, jobsShare: 0.5, grant: 10_000, unlocks: ['college', 'stadium'] },
  { id: 'capital', name: 'Capital', population: 1_000, rating: 70, jobsShare: 0.5, grant: 20_000, unlocks: ['city_hall'] },
];

/** What a city of fewer than {@link MILESTONES}[0] people is called. */
export const FIRST_TIER_NAME = 'Hamlet';

/** What still stands between a city and a milestone. All zero/false: ready. */
export interface MilestoneShortfall {
  /** More residents needed. */
  readonly people: number;
  /** More rating points needed. */
  readonly rating: number;
  /** More jobs needed. */
  readonly jobs: number;
  /** The treasury is in debt. */
  readonly debt: boolean;
}

type MilestoneStats = Pick<CityStats, 'population' | 'jobs' | 'approval' | 'money' | 'bankruptcyWarning'>;

export function milestoneShortfall(stats: MilestoneStats, milestone: Milestone): MilestoneShortfall {
  return {
    people: Math.max(0, milestone.population - stats.population),
    rating: Math.max(0, milestone.rating - stats.approval),
    jobs: Math.max(0, Math.ceil(milestone.jobsShare * stats.population) - stats.jobs),
    debt: stats.money < 0 || stats.bankruptcyWarning,
  };
}

export function milestoneReady(stats: MilestoneStats, milestone: Milestone): boolean {
  const s = milestoneShortfall(stats, milestone);
  return s.people === 0 && s.rating === 0 && s.jobs === 0 && !s.debt;
}

/** The next milestone after `reached` of them, or null past the last. */
export function nextMilestone(reached: number): Milestone | null {
  return MILESTONES[Math.max(0, reached)] ?? null;
}

/** The tier a city is at after `reached` milestones ("Hamlet", "Village", …). */
export function tierName(reached: number): string {
  if (reached <= 0) return FIRST_TIER_NAME;
  return MILESTONES[Math.min(reached, MILESTONES.length) - 1].name;
}

/**
 * Milestones a city of this many people counts as having passed, for a save
 * from before milestones: it keeps its tier without being paid the grants.
 */
export function milestonesByPopulation(population: number): number {
  return MILESTONES.filter((m) => population >= m.population).length;
}
