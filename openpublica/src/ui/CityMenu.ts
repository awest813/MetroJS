import { cityFileNote } from './chromeCopy';
import { keyBelongsToField } from './keys';

/**
 * Save / load / new city, with in-chrome confirms (no window.confirm).
 */
export class CityMenu {
  private readonly _loadBtn: HTMLButtonElement;
  private readonly _newBtn: HTMLButtonElement;
  private readonly _note: HTMLElement;
  private readonly _loadConfirm: HTMLDivElement;
  private readonly _newConfirm: HTMLDivElement;
  private _hasSave: boolean;
  private _justSaved = false;

  constructor(
    container: HTMLElement,
    handlers: {
      hasSave: boolean;
      onSave: () => void;
      onLoad: () => void;
      onNewCity: () => void;
      /** Scripted cities the New confirm offers instead of a fresh map. */
      testCities?: ReadonlyArray<{ id: string; title: string; summary: string }>;
      onTestCity?: (id: string) => void;
    },
  ) {
    this._hasSave = handlers.hasSave;
    container.innerHTML = '';
    container.classList.add('rail-group');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'City file');

    const heading = document.createElement('div');
    heading.className = 'rail-label';
    heading.textContent = 'City';
    container.appendChild(heading);

    const actions = document.createElement('div');
    actions.className = 'city-file-actions';
    container.appendChild(actions);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.title = 'Save this city in the browser (Ctrl+S)';
    saveBtn.setAttribute('aria-keyshortcuts', 'Control+S Meta+S');
    saveBtn.addEventListener('click', () => {
      this._hideConfirms();
      handlers.onSave();
      this.setHasSave(true);
      this._justSaved = true;
      this._syncLoad();
    });
    actions.appendChild(saveBtn);

    this._loadBtn = document.createElement('button');
    this._loadBtn.type = 'button';
    this._loadBtn.id = 'load-btn';
    this._loadBtn.textContent = 'Load';
    actions.appendChild(this._loadBtn);

    this._newBtn = document.createElement('button');
    this._newBtn.type = 'button';
    this._newBtn.id = 'new-city-btn';
    this._newBtn.textContent = 'New';
    this._newBtn.title = 'Generate a new map. Last Save is kept.';
    actions.appendChild(this._newBtn);

    this._note = document.createElement('p');
    this._note.className = 'city-menu-note';
    this._note.setAttribute('aria-live', 'polite');
    container.appendChild(this._note);

    this._loadConfirm = _makeConfirm(
      'Replace this city with the last save? Unsaved work is lost.',
      'Load save',
    );
    this._newConfirm = _makeConfirm(
      'Generate a new map? Unsaved work is lost. Your last Save is kept.',
      'New map',
    );
    const testCities = handlers.testCities ?? [];
    if (testCities.length > 0 && handlers.onTestCity) {
      const pick = document.createElement('select');
      pick.className = 'confirm-test-city';
      pick.setAttribute('aria-label', 'Open a test city instead');
      const prompt = document.createElement('option');
      prompt.value = '';
      prompt.textContent = 'Or open a test city…';
      pick.appendChild(prompt);
      for (const city of testCities) {
        const option = document.createElement('option');
        option.value = city.id;
        option.textContent = city.title;
        option.title = city.summary;
        pick.appendChild(option);
      }
      pick.addEventListener('change', () => {
        if (pick.value) handlers.onTestCity!(pick.value);
      });
      this._newConfirm.appendChild(pick);
    }
    container.appendChild(this._loadConfirm);
    container.appendChild(this._newConfirm);

    this._loadBtn.addEventListener('click', () => {
      if (!this._hasSave) return;
      this._newConfirm.hidden = true;
      this._newBtn.disabled = false;
      this._loadConfirm.hidden = false;
      this._loadBtn.disabled = true;
    });
    this._loadConfirm.querySelector('.confirm-cancel')!.addEventListener('click', () => {
      this._hideConfirms();
    });
    this._loadConfirm.querySelector('.confirm-ok')!.addEventListener('click', () => {
      this._justSaved = false;
      this._hideConfirms();
      handlers.onLoad();
    });

    this._newBtn.addEventListener('click', () => {
      this._loadConfirm.hidden = true;
      this._loadBtn.disabled = !this._hasSave;
      this._newConfirm.hidden = false;
      this._newBtn.disabled = true;
    });
    this._newConfirm.querySelector('.confirm-cancel')!.addEventListener('click', () => {
      this._hideConfirms();
    });
    this._newConfirm.querySelector('.confirm-ok')!.addEventListener('click', () => {
      this._hideConfirms();
      handlers.onNewCity();
    });

    window.addEventListener('keydown', (event) => {
      if (keyBelongsToField(event)) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        this._hideConfirms();
        handlers.onSave();
        this.setHasSave(true);
        this._justSaved = true;
        this._syncLoad();
        return;
      }
      if (event.key === 'Escape') this._hideConfirms();
    });

    this._syncLoad();
  }

  setHasSave(hasSave: boolean): void {
    this._hasSave = hasSave;
    this._syncLoad();
  }

  private _hideConfirms(): void {
    this._loadConfirm.hidden = true;
    this._newConfirm.hidden = true;
    this._newBtn.disabled = false;
    this._syncLoad();
  }

  private _syncLoad(): void {
    const confirmingLoad = !this._loadConfirm.hidden;
    this._loadBtn.disabled = !this._hasSave || confirmingLoad;
    this._loadBtn.title = this._hasSave
      ? 'Replace this city with the last save'
      : 'No save in this browser yet';
    this._note.textContent = cityFileNote(this._hasSave, this._justSaved);
  }
}

function _makeConfirm(message: string, okLabel: string): HTMLDivElement {
  const confirm = document.createElement('div');
  confirm.className = 'rail-confirm';
  confirm.hidden = true;
  const p = document.createElement('p');
  p.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'rail-confirm-actions';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'confirm-ok';
  ok.textContent = okLabel;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'confirm-cancel';
  cancel.textContent = 'Cancel';
  actions.append(ok, cancel);
  confirm.append(p, actions);
  return confirm;
}

