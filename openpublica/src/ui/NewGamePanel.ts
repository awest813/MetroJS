import { DIFFICULTIES, START_TREASURY, type Difficulty } from '../scenarios/newGame';

const LABELS: Readonly<Record<Difficulty, string>> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/**
 * The new-game panel: the fresh map shows behind it, with a re-roll and a
 * choice of starting treasury. No sim access; App feeds it.
 */
export class NewGamePanel {
  private _difficulty: Difficulty;
  private readonly _choices: HTMLButtonElement[] = [];

  constructor(
    private readonly _root: HTMLElement,
    initial: Difficulty,
    handlers: { onReroll: (difficulty: Difficulty) => void; onStart: (difficulty: Difficulty) => void },
  ) {
    this._difficulty = initial;
    _root.innerHTML = `
      <div class="newgame-title">A new city</div>
      <p class="newgame-body">This is your map: its river, hills, and flat land. Re-roll for another, pick a starting treasury, and start.</p>
      <div class="newgame-choices" role="radiogroup" aria-label="Starting treasury"></div>
      <div class="newgame-actions">
        <button type="button" class="newgame-reroll">Re-roll map</button>
        <button type="button" class="newgame-start">Start</button>
      </div>
    `;
    _root.setAttribute('role', 'dialog');
    _root.setAttribute('aria-label', 'New city');
    const choices = _root.querySelector('.newgame-choices')!;
    for (const d of DIFFICULTIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.difficulty = d;
      btn.setAttribute('role', 'radio');
      btn.textContent = `${LABELS[d]} $${START_TREASURY[d].toLocaleString('en-US')}`;
      btn.addEventListener('click', () => this._pick(d));
      choices.appendChild(btn);
      this._choices.push(btn);
    }
    _root.querySelector('.newgame-reroll')!.addEventListener('click', () => handlers.onReroll(this._difficulty));
    _root.querySelector('.newgame-start')!.addEventListener('click', () => {
      this.hide();
      handlers.onStart(this._difficulty);
    });
    this._pick(initial);
    _root.hidden = true;
  }

  get open(): boolean {
    return !this._root.hidden;
  }

  show(): void {
    this._root.hidden = false;
  }

  hide(): void {
    this._root.hidden = true;
  }

  private _pick(d: Difficulty): void {
    this._difficulty = d;
    for (const btn of this._choices) {
      const on = btn.dataset.difficulty === d;
      btn.classList.toggle('newgame-picked', on);
      btn.setAttribute('aria-checked', String(on));
    }
  }
}
