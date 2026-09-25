/**
 * The state's offer after two years in debt: a recap and two ways on, take
 * the bailout or start a new city. Modal; no sim access (App feeds it).
 */

export interface BailoutChoice {
  readonly title: string;
  readonly body: string;
  readonly accept: string;
  readonly decline: string;
}

export class BailoutDialog {
  private readonly _title: HTMLElement;
  private readonly _body: HTMLElement;
  private readonly _acceptNote: HTMLElement;
  private readonly _declineNote: HTMLElement;
  private readonly _acceptBtn: HTMLButtonElement;

  constructor(
    private readonly _root: HTMLElement,
    handlers: { onAccept: () => void; onNewCity: () => void },
  ) {
    _root.innerHTML = `
      <div class="bailout-card">
        <h2 class="bailout-title" id="bailout-title"></h2>
        <p class="bailout-body"></p>
        <div class="bailout-choice">
          <button type="button" class="bailout-accept">Take the bailout</button>
          <p class="bailout-note bailout-accept-note"></p>
        </div>
        <div class="bailout-choice">
          <button type="button" class="bailout-decline">New city</button>
          <p class="bailout-note bailout-decline-note"></p>
        </div>
      </div>
    `;
    _root.setAttribute('role', 'dialog');
    _root.setAttribute('aria-modal', 'true');
    _root.setAttribute('aria-labelledby', 'bailout-title');
    _root.hidden = true;
    this._title = _root.querySelector('.bailout-title')!;
    this._body = _root.querySelector('.bailout-body')!;
    this._acceptNote = _root.querySelector('.bailout-accept-note')!;
    this._declineNote = _root.querySelector('.bailout-decline-note')!;
    this._acceptBtn = _root.querySelector('.bailout-accept')!;
    this._acceptBtn.addEventListener('click', () => {
      this.hide();
      handlers.onAccept();
    });
    _root.querySelector('.bailout-decline')!.addEventListener('click', () => handlers.onNewCity());
  }

  get open(): boolean {
    return !this._root.hidden;
  }

  show(choice: BailoutChoice): void {
    this._title.textContent = choice.title;
    this._body.textContent = choice.body;
    this._acceptNote.textContent = choice.accept;
    this._declineNote.textContent = choice.decline;
    this._root.hidden = false;
    this._acceptBtn.focus();
  }

  hide(): void {
    this._root.hidden = true;
  }
}
