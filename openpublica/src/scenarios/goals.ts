// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CitySim, ScenarioState } from '../sim/CitySim';
import { ZoneType } from '../sim/CityTile';

/**
 * Goals for the test cities, which become scenarios
 * (docs/STRATEGY_AND_GAMEFLOW.md, G11): a target and a deadline, counted
 * from the month the scenario starts. The app checks them each month and
 * shows the outcome.
 */

export interface GoalProgress {
  readonly done: boolean;
  /** "212/300 people". */
  readonly text: string;
}

export interface ScenarioGoal {
  readonly cityId: string;
  /** "Get back to 300 people". */
  readonly title: string;
  /** Months from the start to meet it. */
  readonly months: number;
  progress(sim: CitySim): GoalProgress;
}

const people = (target: number) => (sim: CitySim): GoalProgress => ({
  done: sim.stats.population >= target,
  text: `${sim.stats.population.toLocaleString('en-US')}/${target.toLocaleString('en-US')} people`,
});

/** Zone buildings with water, of all of them. */
function watered(sim: CitySim): { wet: number; all: number } {
  let wet = 0;
  let all = 0;
  sim.map.forEach((tile) => {
    if (tile.buildingId === null || tile.zoneType === ZoneType.None) return;
    all += 1;
    if (tile.watered) wet += 1;
  });
  return { wet, all };
}

export const SCENARIO_GOALS: readonly ScenarioGoal[] = [
  { cityId: 'hamlet', title: 'Grow the hamlet into a town of 400 people', months: 60, progress: people(400) },
  { cityId: 'riverside', title: 'Make Riverside a city of 600 people', months: 48, progress: people(600) },
  { cityId: 'metro', title: 'Grow Metro to 1,500 people', months: 60, progress: people(1_500) },
  { cityId: 'troubled', title: 'Get back to 300 people', months: 60, progress: people(300) },
  {
    cityId: 'sprawl',
    title: 'Water every building on the strip',
    months: 24,
    progress: (sim) => {
      const { wet, all } = watered(sim);
      return { done: all > 0 && wet === all, text: `${wet}/${all} buildings watered` };
    },
  },
];

export function goalFor(cityId: string): ScenarioGoal | undefined {
  return SCENARIO_GOALS.find((g) => g.cityId === cityId);
}

/** Start the scenario for a test city just built: its clock starts now. */
export function startScenario(sim: CitySim, cityId: string): void {
  if (!goalFor(cityId)) return;
  sim.stats.scenario = { id: cityId, start: sim.clock.monthsPassed, status: 'active' };
}

/** Months left before the deadline (0 once it has passed). */
export function monthsLeft(sim: CitySim, state: ScenarioState): number {
  const goal = goalFor(state.id);
  if (!goal) return 0;
  return Math.max(0, state.start + goal.months - sim.clock.monthsPassed);
}

/**
 * At a month's end: won when the goal is met in time, lost when the deadline
 * passes first. Returns the outcome the month brought, if any.
 */
export function checkScenario(sim: CitySim): 'won' | 'lost' | null {
  const state = sim.stats.scenario;
  if (!state || state.status !== 'active') return null;
  const goal = goalFor(state.id);
  if (!goal) return null;
  if (goal.progress(sim).done) {
    state.status = 'won';
    return 'won';
  }
  if (monthsLeft(sim, state) <= 0) {
    state.status = 'lost';
    return 'lost';
  }
  return null;
}

/** "3 years 4 months", "1 month". */
export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} year${years === 1 ? '' : 's'}` : '';
  const m = rest > 0 || years === 0 ? `${rest} month${rest === 1 ? '' : 's'}` : '';
  return [y, m].filter(Boolean).join(' ');
}

/** HUD readout: "Goal 212/300 people · 3y 4m", or the outcome. */
export function scenarioLabel(sim: CitySim): string | null {
  const state = sim.stats.scenario;
  const goal = state ? goalFor(state.id) : undefined;
  if (!state || !goal) return null;
  if (state.status === 'won') return 'Goal met';
  if (state.status === 'lost') return 'Goal missed';
  const left = monthsLeft(sim, state);
  const y = Math.floor(left / 12);
  const m = left % 12;
  return `Goal ${goal.progress(sim).text} · ${y > 0 ? `${y}y ` : ''}${m}m`;
}

/** The scenario's tooltip, and the banner's line when it ends. */
export function scenarioText(sim: CitySim): { title: string; body: string } | null {
  const state = sim.stats.scenario;
  const goal = state ? goalFor(state.id) : undefined;
  if (!state || !goal) return null;
  const now = goal.progress(sim).text;
  if (state.status === 'won') {
    const spare = monthsLeft(sim, state);
    return {
      title: 'Scenario complete!',
      body: `${goal.title}: done, with ${now}${spare > 0 ? ` and ${formatMonths(spare)} to spare` : ''}. Keep building, or start a new city.`,
    };
  }
  if (state.status === 'lost') {
    return {
      title: "Time's up",
      body: `${goal.title} within ${formatMonths(goal.months)}: missed, at ${now}. Keep building, or start a new city.`,
    };
  }
  return {
    title: 'Scenario',
    body: `${goal.title} within ${formatMonths(goal.months)}. Now ${now}, with ${formatMonths(monthsLeft(sim, state))} left.`,
  };
}
