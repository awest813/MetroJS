import type { AudioBus } from '../audio/AudioBus';

/**
 * Mute toggle on the camera/speed strip. M is the shortcut (Space stays orbit).
 */
export class SoundBar {
  constructor(container: HTMLElement, bus: AudioBus) {
    const split = document.createElement('span');
    split.className = 'bar-split';
    split.setAttribute('aria-hidden', 'true');
    container.appendChild(split);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sound-toggle';
    btn.addEventListener('click', () => {
      bus.unlock();
      bus.toggleMute();
    });
    container.appendChild(btn);

    const sync = (muted: boolean): void => {
      btn.textContent = muted ? 'Muted' : 'Sound';
      btn.title = muted
        ? 'Unmute city sounds (key M). Sounds stay off until you click.'
        : 'Mute city sounds (key M)';
      btn.classList.toggle('active', !muted);
      btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    };

    bus.onMuteChange(sync);
    sync(bus.muted);

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
        bus.unlock();
        bus.toggleMute();
      }
    });
  }
}
