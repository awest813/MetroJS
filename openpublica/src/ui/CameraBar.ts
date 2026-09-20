import type { CameraController, CameraViewMode } from '../render/CameraController';

const PRESETS: ReadonlyArray<{ mode: CameraViewMode; label: string; hint: string }> = [
  { mode: 'iso', label: '1 Iso', hint: 'Classic city-builder angle (key 1)' },
  { mode: 'top', label: '2 Top', hint: 'Nearly top-down (key 2)' },
  { mode: 'orbit', label: '3 Orbit', hint: 'Lower 3D vantage (key 3)' },
];

/**
 * Camera preset buttons. Hint text lives in titles so it does not duplicate the status bar.
 */
export class CameraBar {
  constructor(container: HTMLElement, camera: CameraController) {
    container.innerHTML = '';
    container.classList.add('camera-bar');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Camera view');

    const buttons: HTMLButtonElement[] = [];

    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mode = preset.mode;
      btn.textContent = preset.label;
      btn.title = preset.hint;
      btn.addEventListener('click', () => camera.applyPreset(preset.mode));
      container.appendChild(btn);
      buttons.push(btn);
    }

    const sync = (mode: CameraViewMode): void => {
      for (const btn of buttons) {
        const on = btn.dataset.mode === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    };

    camera.onModeChange(sync);
    sync(camera.mode);
  }
}
