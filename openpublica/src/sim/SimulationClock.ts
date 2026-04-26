// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

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
}
