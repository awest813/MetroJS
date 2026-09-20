export type SimSpeed = 0 | 1 | 2 | 4;

const SPEEDS: ReadonlyArray<{ value: SimSpeed; label: string; hint: string }> = [
  { value: 0, label: 'Pause', hint: 'Freeze the month clock (key P)' },
  { value: 1, label: '1×', hint: 'Real time: one month per 30 seconds (key [ ] )' },
  { value: 2, label: '2×', hint: 'Faster months (key [ ] )' },
  { value: 4, label: '4×', hint: 'Fast-forward' },
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
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
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
    if (this._speed === 4) return 2;
    if (this._speed === 2) return 1;
    return 0;
  }

  private _faster(): SimSpeed {
    if (this._speed === 0) return 1;
    if (this._speed === 1) return 2;
    return 4;
  }

  private _sync(): void {
    for (const btn of this._buttons) {
      const on = Number(btn.dataset.speed) === this._speed;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
}
