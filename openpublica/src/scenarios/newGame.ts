// ⚠️  This file must NOT import anything from @babylonjs/core.

/**
 * New-game choices (docs/STRATEGY_AND_GAMEFLOW.md, G11): the random map,
 * which the player can re-roll, and a starting treasury. They travel in the
 * address (`?new=1&seed=…&start=hard`) so a re-roll is a reload.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export const START_TREASURY: Readonly<Record<Difficulty, number>> = {
  easy: 20_000,
  normal: 10_000,
  hard: 5_000,
};

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface NewGameRequest {
  /** The player is choosing: show the map with the new-game panel, and wait. */
  readonly choosing: boolean;
  /** The map to build, or null for a random one. */
  readonly seed: number | null;
  readonly difficulty: Difficulty;
}

export function parseNewGame(search: string): NewGameRequest {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText !== null && /^\d{1,10}$/.test(seedText) ? Number(seedText) % 0x80000000 : null;
  const start = params.get('start');
  const difficulty: Difficulty = start === 'easy' || start === 'hard' ? start : 'normal';
  return { choosing: params.get('new') === '1', seed, difficulty };
}

/** The query for a new game on map `seed`, still choosing. */
export function newGameSearch(seed: number, difficulty: Difficulty = 'normal'): string {
  const params = new URLSearchParams();
  params.set('new', '1');
  params.set('seed', String(seed));
  if (difficulty !== 'normal') params.set('start', difficulty);
  return `?${params.toString()}`;
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
