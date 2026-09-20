import type { CameraController, CameraViewMode } from '../render/CameraController';

const PRESETS: ReadonlyArray<{ mode: CameraViewMode; label: string; hint: string }> = [
  { mode: 'iso', label: '1 Iso', hint: 'Classic city-builder angle' },
  { mode: 'top', label: '2 Top', hint: 'Nearly top-down' },
  { mode: 'orbit', label: '3 Orbit', hint: 'Lower 3D vantage' },
];

/**
 * Camera preset buttons. Owns no sim state.
 */
export class CameraBar {
  constructor(container: HTMLElement, camera: CameraController) {
    container.innerHTML = '';
    container.classList.add('camera-bar');

    const hint = document.createElement('span');
    hint.className = 'camera-hint';
    hint.textContent = 'LMB paint · MMB / Alt+LMB / Space+LMB orbit · RMB pan · wheel zoom';
    container.appendChild(hint);

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
        btn.classList.toggle('active', btn.dataset.mode === mode);
      }
    };

    camera.onModeChange(sync);
    sync(camera.mode);
  }
}
