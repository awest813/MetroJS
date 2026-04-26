// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { MONTH_SECONDS } from '../data/constants';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Starting calendar year for the simulation. */
const START_YEAR = 2000;

/**
 * Tracks elapsed simulation time and tick count.
 * Completely independent of wall-clock or rendering frame time.
 */
export class SimulationClock {
  private _totalSeconds: number;
  private _ticks: number;

  constructor() {
    this._totalSeconds = 0;
    this._ticks = 0;
  }

  /** Advance the clock by deltaSeconds and increment the tick counter. */
  tick(deltaSeconds: number): void {
    this._totalSeconds += deltaSeconds;
    this._ticks += 1;
  }

  /** Total simulated seconds elapsed since the clock was created. */
  get totalSeconds(): number {
    return this._totalSeconds;
  }

  /** Number of times tick() has been called. */
  get ticks(): number {
    return this._ticks;
  }

  /**
   * Restore the clock to a previously saved point in time.
   * Called by SaveCodec when loading a city.
   * The tick counter is reset to zero because frame counts are not meaningful
   * across sessions.
   */
  restore(totalSeconds: number): void {
    this._totalSeconds = totalSeconds;
    this._ticks        = 0;
  }

  /** Total number of simulated months elapsed. */
  get monthsPassed(): number {
    return Math.floor(this._totalSeconds / MONTH_SECONDS);
  }

  /** Current in-game month name (e.g. "Jan", "Feb", …). */
  get monthName(): string {
    return MONTH_NAMES[this.monthsPassed % 12];
  }

  /** Current in-game year (starts at START_YEAR). */
  get year(): number {
    return START_YEAR + Math.floor(this.monthsPassed / 12);
  }
}
