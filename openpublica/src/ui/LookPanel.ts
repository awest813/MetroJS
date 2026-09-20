import { MiniMap } from './MiniMap';
import type { CityMap } from '../sim/CityMap';

export type QualityLevel = 'high' | 'low';

export const QUALITY_STORAGE_KEY = 'openpublica.quality';
export const SUN_STORAGE_KEY = 'openpublica.sun';
/** 0 = dawn, 0.5 = noon, 1 = dusk. */
export const DEFAULT_DAY = 0.58;

export function readStoredQuality(): QualityLevel {
  try {
    return globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

export function readStoredSun(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SUN_STORAGE_KEY);
    if (raw == null) return DEFAULT_DAY;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_DAY;
    return Math.max(0, Math.min(1, n));
  } catch {
    return DEFAULT_DAY;
  }
}

/**
 * Minimap, frame, sun angle, and quality. Presentation only.
 */
export class LookPanel {
  readonly minimap: MiniMap;
  private readonly _qualityBtn: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    handlers: {
      onFrame: () => void;
      onSun: (day: number) => void;
      onQuality: (level: QualityLevel) => void;
    },
    initial: { sun: number; quality: QualityLevel },
  ) {
    container.innerHTML = '';
    container.classList.add('look-panel');

    const heading = document.createElement('div');
    heading.className = 'look-heading';
    heading.textContent = 'Look';
    container.appendChild(heading);

    this.minimap = new MiniMap(container);

    const tools = document.createElement('div');
    tools.className = 'look-tools';
    container.appendChild(tools);

    const frame = document.createElement('button');
    frame.type = 'button';
    frame.textContent = 'Frame';
    frame.title = 'Reset to the iso city view (Home)';
    frame.addEventListener('click', () => handlers.onFrame());
    tools.appendChild(frame);

    this._qualityBtn = document.createElement('button');
    this._qualityBtn.type = 'button';
    this._qualityBtn.addEventListener('click', () => {
      const next: QualityLevel = this._qualityBtn.dataset.quality === 'low' ? 'high' : 'low';
      this._syncQuality(next);
      try {
        globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      handlers.onQuality(next);
    });
    tools.appendChild(this._qualityBtn);
    this._syncQuality(initial.quality);

    const sunRow = document.createElement('div');
    sunRow.className = 'look-sun';
    sunRow.title = 'Sun angle only — does not change the simulation';
    const sunCaption = document.createElement('button');
    sunCaption.type = 'button';
    sunCaption.className = 'look-sun-end';
    sunCaption.textContent = 'Dawn';
    sunCaption.title = 'Warm morning light';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(initial.sun * 100));
    slider.setAttribute('aria-label', 'Sun angle from dawn to dusk');
    const applySun = (): void => {
      const day = Number(slider.value) / 100;
      try {
        globalThis.localStorage?.setItem(SUN_STORAGE_KEY, String(day));
      } catch {
        /* ignore */
      }
      handlers.onSun(day);
    };
    slider.addEventListener('input', applySun);
    sunCaption.addEventListener('click', () => {
      slider.value = '0';
      applySun();
    });
    const duskCaption = document.createElement('button');
    duskCaption.type = 'button';
    duskCaption.className = 'look-sun-end';
    duskCaption.textContent = 'Dusk';
    duskCaption.title = 'Cool evening light';
    duskCaption.addEventListener('click', () => {
      slider.value = '100';
      applySun();
    });
    sunRow.append(sunCaption, slider, duskCaption);
    container.appendChild(sunRow);
  }

  redraw(map: CityMap): void {
    this.minimap.redraw(map);
  }

  private _syncQuality(level: QualityLevel): void {
    this._qualityBtn.dataset.quality = level;
    this._qualityBtn.textContent = level === 'high' ? 'High' : 'Low';
    this._qualityBtn.title =
      level === 'high'
        ? 'High quality: shadows, smoke, street trees. Click for Low.'
        : 'Low quality: shadows and extras off. Click for High.';
    this._qualityBtn.classList.toggle('active', level === 'high');
    this._qualityBtn.setAttribute('aria-pressed', level === 'high' ? 'true' : 'false');
  }
}
