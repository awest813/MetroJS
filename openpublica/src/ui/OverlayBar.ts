export interface OverlaySpec {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly getOn: () => boolean;
  readonly setOn: (next: boolean) => void;
}

/**
 * Map overlays. Exclusive — one tint at a time — so they stay readable in 3D.
 * Independent of build tools so Power stays on when the player picks Road.
 */
export class OverlayBar {
  constructor(container: HTMLElement, specs: readonly OverlaySpec[]) {
    container.innerHTML = '';
    container.classList.add('rail-group');
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-label', 'Map overlays');

    const heading = document.createElement('div');
    heading.className = 'rail-label';
    heading.textContent = 'Maps';
    container.appendChild(heading);

    const buttons: HTMLButtonElement[] = [];

    const sync = (): void => {
      for (let i = 0; i < specs.length; i++) {
        const on = specs[i].getOn();
        buttons[i].classList.toggle('active', on);
        buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        buttons[i].setAttribute('aria-checked', on ? 'true' : 'false');
      }
    };

    for (const spec of specs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = spec.id;
      btn.textContent = spec.label;
      btn.title = spec.title;
      btn.setAttribute('role', 'radio');
      btn.addEventListener('click', () => {
        const turningOn = !spec.getOn();
        for (const other of specs) {
          if (other !== spec) other.setOn(false);
        }
        spec.setOn(turningOn);
        sync();
      });
      container.appendChild(btn);
      buttons.push(btn);
    }

    sync();
  }
}
