import type { AudioBus } from '../audio/AudioBus';
import { SETTINGS_SHORTCUTS } from './chromeCopy';
import {
  type QualityLevel,
  readStoredQuality,
  readStoredSun,
  writeStoredQuality,
  writeStoredSun,
} from './settingsStore';

/**
 * Presentation prefs: mute, quality, sun, and a short key list.
 * Does not touch simulation numbers (taxes stay on Budget).
 */
export class SettingsPanel {
  private readonly _soundBtn: HTMLButtonElement;
  private readonly _qualityBtn: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    handlers: {
      audio: AudioBus;
      onSun: (day: number) => void;
      onQuality: (level: QualityLevel) => void;
    },
  ) {
    container.innerHTML = '';
    container.classList.add('rail-group');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Settings');

    const fold = document.createElement('details');
    fold.className = 'settings-fold';
    // Open only where the rail has room: phones and short laptop screens start folded.
    fold.open = !window.matchMedia('(max-width: 900px), (max-height: 979px)').matches;

    const summary = document.createElement('summary');
    summary.textContent = 'Settings';
    summary.setAttribute('aria-label', 'Settings');
    fold.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'settings-body';
    fold.appendChild(body);

    this._soundBtn = document.createElement('button');
    this._soundBtn.type = 'button';
    this._soundBtn.addEventListener('click', () => {
      handlers.audio.unlock();
      handlers.audio.toggleMute();
    });
    body.appendChild(this._soundBtn);

    const syncSound = (muted: boolean): void => {
      this._soundBtn.textContent = muted ? 'Sound: muted' : 'Sound: on';
      this._soundBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
      this._soundBtn.classList.toggle('active', !muted);
      this._soundBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    };
    handlers.audio.onMuteChange(syncSound);
    syncSound(handlers.audio.muted);

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        handlers.audio.unlock();
        handlers.audio.toggleMute();
      }
    });

    this._qualityBtn = document.createElement('button');
    this._qualityBtn.type = 'button';
    this._qualityBtn.addEventListener('click', () => {
      const next: QualityLevel = this._qualityBtn.dataset.quality === 'low' ? 'high' : 'low';
      this._syncQuality(next);
      writeStoredQuality(next);
      handlers.onQuality(next);
    });
    body.appendChild(this._qualityBtn);
    this._syncQuality(readStoredQuality());

    const sunRow = document.createElement('div');
    sunRow.className = 'look-sun settings-sun';
    sunRow.title = 'Sun angle only — does not change the simulation';
    const dawn = document.createElement('button');
    dawn.type = 'button';
    dawn.className = 'look-sun-end';
    dawn.textContent = 'Dawn';
    dawn.title = 'Warm morning light';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(readStoredSun() * 100));
    slider.setAttribute('aria-label', 'Sun angle from dawn to dusk');
    const applySun = (): void => {
      const day = Number(slider.value) / 100;
      writeStoredSun(day);
      handlers.onSun(day);
    };
    const snapDawn = (): void => {
      slider.value = '0';
      applySun();
    };
    const snapDusk = (): void => {
      slider.value = '100';
      applySun();
    };
    slider.addEventListener('input', applySun);
    dawn.addEventListener('click', snapDawn);
    dawn.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      snapDawn();
    });
    const dusk = document.createElement('button');
    dusk.type = 'button';
    dusk.className = 'look-sun-end';
    dusk.textContent = 'Dusk';
    dusk.title = 'Cool evening light';
    dusk.addEventListener('click', snapDusk);
    dusk.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      snapDusk();
    });
    sunRow.append(dawn, slider, dusk);
    body.appendChild(sunRow);

    const keys = document.createElement('p');
    keys.className = 'settings-keys';
    keys.textContent = SETTINGS_SHORTCUTS;
    body.appendChild(keys);

    container.appendChild(fold);
  }

  private _syncQuality(level: QualityLevel): void {
    this._qualityBtn.dataset.quality = level;
    this._qualityBtn.textContent = level === 'high' ? 'Quality: high' : 'Quality: low';
    this._qualityBtn.title =
      level === 'high'
        ? 'High: shadows, smoke, street trees. Click for Low.'
        : 'Low: extras off. Click for High.';
    this._qualityBtn.classList.toggle('active', level === 'high');
    this._qualityBtn.setAttribute('aria-pressed', level === 'high' ? 'true' : 'false');
  }
}
