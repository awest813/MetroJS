import { keyBelongsToField } from './keys';

export type SimSpeed = 0 | 1 | 2 | 4 | 8;

/**
 * Longest real frame that counts toward sim time. Browsers stop drawing a
 * hidden tab, so the first frame back can span minutes; uncapped, the city
 * aged a month for every 30 seconds away while nobody could see it.
 */
export const MAX_FRAME_SECONDS = 0.25;

/** Simulated seconds one rendered frame advances at `speed`. */
export function simSecondsForFrame(frameMs: number, speed: SimSpeed): number {
  if (!(frameMs > 0)) return 0;
  return Math.min(frameMs / 1000, MAX_FRAME_SECONDS) * speed;
}

const SPEEDS: ReadonlyArray<{ value: SimSpeed; label: string; hint: string }> = [
  { value: 0, label: 'Pause', hint: 'Freeze the calendar; you can still build (key P)' },
  { value: 1, label: '1×', hint: 'A month every 30 seconds (keys [ and ])' },
  { value: 2, label: '2×', hint: 'A month every 15 seconds (keys [ and ])' },
  { value: 4, label: '4×', hint: 'A month every 7½ seconds (keys [ and ])' },
  { value: 8, label: '8×', hint: 'A month every 3¾ seconds, for a city that runs itself (keys [ and ])' },
];

/**
 * Pause / 1× / 2× / 4×. Does not steal Space (that is camera orbit).
 */
export class SpeedBar {
  private _speed: SimSpeed;
  private _resume: SimSpeed;
  private readonly _onChange: (speed: SimSpeed) => void;
  private readonly _buttons: HTMLButtonElement[] = [];

  constructor(
    container: HTMLElement,
    initial: SimSpeed,
    onChange: (speed: SimSpeed) => void,
  ) {
    this._speed = initial;
    this._resume = initial === 0 ? 1 : initial;
    this._onChange = onChange;

    const split = document.createElement('span');
    split.className = 'bar-split';
    split.setAttribute('aria-hidden', 'true');
    container.appendChild(split);

    const group = document.createElement('div');
    group.className = 'speed-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Simulation speed');

    for (const spec of SPEEDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.speed = String(spec.value);
      btn.textContent = spec.label;
      btn.title = spec.hint;
      if (spec.value === 0) btn.setAttribute('aria-keyshortcuts', 'P');
      btn.addEventListener('click', () => this.setSpeed(spec.value));
      group.appendChild(btn);
      this._buttons.push(btn);
    }
    container.appendChild(group);
    this._sync();

    window.addEventListener('keydown', (event) => {
      if (keyBelongsToField(event)) return;
      if (event.key === 'p' || event.key === 'P') {
        this.setSpeed(this._speed === 0 ? this._resume : 0);
        return;
      }
      if (event.key === '[') {
        this.setSpeed(this._slower());
        return;
      }
      if (event.key === ']' || event.key === '+') {
        this.setSpeed(this._faster());
      }
    });
  }

  get speed(): SimSpeed {
    return this._speed;
  }

  setSpeed(speed: SimSpeed): void {
    if (this._speed === speed) {
      this._sync();
      return;
    }
    this._speed = speed;
    if (speed > 0) this._resume = speed;
    this._sync();
    this._onChange(speed);
  }

  private _slower(): SimSpeed {
    if (this._speed === 8) return 4;
    if (this._speed === 4) return 2;
    if (this._speed === 2) return 1;
    return 0;
  }

  private _faster(): SimSpeed {
    if (this._speed === 0) return 1;
    if (this._speed === 1) return 2;
    if (this._speed === 2) return 4;
    return 8;
  }

  private _sync(): void {
    for (const btn of this._buttons) {
      const on = Number(btn.dataset.speed) === this._speed;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
}
