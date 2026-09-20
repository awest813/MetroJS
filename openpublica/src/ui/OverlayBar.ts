export interface OverlaySpec {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly getOn: () => boolean;
  readonly setOn: (next: boolean) => void;
}

/**
 * Map overlay toggles. Independent of build tools so "Power on" is not
 * cleared when the player picks Road.
 */
export class OverlayBar {
  constructor(container: HTMLElement, specs: readonly OverlaySpec[]) {
    container.innerHTML = '';
    container.classList.add('rail-group');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Map overlays');

    const heading = document.createElement('div');
    heading.className = 'rail-label';
    heading.textContent = 'Maps';
    container.appendChild(heading);

    for (const spec of specs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = spec.id;
      btn.textContent = spec.label;
      btn.title = spec.title;
      btn.setAttribute('aria-pressed', spec.getOn() ? 'true' : 'false');
      btn.addEventListener('click', () => {
        const next = !spec.getOn();
        spec.setOn(next);
        btn.classList.toggle('active', next);
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      });
      container.appendChild(btn);
    }
  }
}
