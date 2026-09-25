/**
 * The banner shown when the city reaches a milestone: a title and a line,
 * for a few seconds or until clicked. No sim access; App feeds it.
 */

/** How long a banner stays up. */
export const MILESTONE_BANNER_MS = 9000;

export class MilestoneBanner {
  private readonly _title: HTMLElement;
  private readonly _body: HTMLElement;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly _root: HTMLElement) {
    _root.innerHTML = `
      <div class="milestone-title"></div>
      <div class="milestone-body"></div>
    `;
    _root.setAttribute('role', 'status');
    _root.title = 'Click to close';
    this._title = _root.querySelector('.milestone-title')!;
    this._body = _root.querySelector('.milestone-body')!;
    _root.hidden = true;
    _root.addEventListener('click', () => this.hide());
  }

  show(title: string, body: string): void {
    this._title.textContent = title;
    this._body.textContent = body;
    this._root.hidden = false;
    // Restart the entrance animation for a banner that follows another.
    this._root.classList.remove('milestone-in');
    void this._root.offsetWidth;
    this._root.classList.add('milestone-in');
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), MILESTONE_BANNER_MS);
  }

  hide(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this._root.hidden = true;
  }
}
