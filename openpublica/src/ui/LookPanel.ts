import { MiniMap } from './MiniMap';
import type { CityMap } from '../sim/CityMap';

/**
 * Minimap and frame. Quality/sun live in Settings.
 */
export class LookPanel {
  readonly minimap: MiniMap;

  constructor(container: HTMLElement, onFrame: () => void) {
    container.innerHTML = '';
    container.classList.add('look-panel');

    const heading = document.createElement('div');
    heading.className = 'look-heading';
    heading.textContent = 'Look';
    container.appendChild(heading);

    this.minimap = new MiniMap(container);

    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'look-frame';
    frame.textContent = 'Frame city';
    frame.title = 'Reset to the iso city view (Home)';
    frame.setAttribute('aria-keyshortcuts', 'Home');
    frame.addEventListener('click', () => onFrame());
    container.appendChild(frame);
  }

  redraw(map: CityMap): void {
    this.minimap.redraw(map);
  }
}
