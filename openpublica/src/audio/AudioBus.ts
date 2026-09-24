import type { Voice } from './voices';
import { FAIL_GAP_MS, GROWTH_GAP_MS, PAINT_GAP_MS } from './voices';

export const MUTE_STORAGE_KEY = 'openpublica.mute';

/** Rain hiss at full downpour: well under the paint blips. */
const RAIN_GAIN = 0.035;

type WebAudioContext = AudioContext;

function readStoredMute(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function makeContext(): WebAudioContext | null {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

/**
 * Tiny Web Audio mixer. Silent until a user gesture unlocks the context.
 * Master mute is persisted; no autoplay.
 */
export class AudioBus {
  private _ctx: WebAudioContext | null = null;
  private _master: GainNode | null = null;
  private _ambient: GainNode | null = null;
  private _ambientNoise: AudioBufferSourceNode | null = null;
  private _muted = readStoredMute();
  private _unlocked = false;
  private _lastAt = new Map<string, number>();
  private _ambientLevel = 0;
  private _rain: GainNode | null = null;
  private _rainLevel = 0;
  private readonly _listeners = new Set<(muted: boolean) => void>();

  get muted(): boolean {
    return this._muted;
  }

  get unlocked(): boolean {
    return this._unlocked;
  }

  onMuteChange(fn: (muted: boolean) => void): void {
    this._listeners.add(fn);
  }

  setMuted(muted: boolean): void {
    if (this._muted === muted) return;
    this._muted = muted;
    writeStoredMute(muted);
    this._applyMute();
    for (const fn of this._listeners) fn(this._muted);
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  /**
   * Create/resume AudioContext. Must run inside a user gesture; stays sync so
   * the same click can also play a paint blip.
   */
  unlock(): void {
    if (!this._ctx) {
      const ctx = makeContext();
      if (!ctx) return;
      this._ctx = ctx;
      this._master = ctx.createGain();
      this._master.connect(ctx.destination);
      this._ambient = ctx.createGain();
      this._ambient.gain.value = 0;
      this._ambient.connect(this._master);
      this._applyMute();
      this._startAmbientBed();
      this._startRainBed();
      this._unlocked = true;
    }
    if (this._ctx.state === 'suspended') {
      void this._ctx.resume().catch(() => {
        /* still locked until the next gesture */
      });
    }
  }

  /** City-size bed: 0 silent … 1 still quiet. */
  setAmbientLevel(level: number): void {
    const next = Math.max(0, Math.min(1, level));
    this._ambientLevel = next;
    if (!this._ambient || !this._ctx || this._muted) return;
    const now = this._ctx.currentTime;
    this._ambient.gain.cancelScheduledValues(now);
    this._ambient.gain.setTargetAtTime(next * 0.018, now, 0.6);
  }

  /** Rain hiss: 0 dry … 1 downpour. Follows the weather on screen. */
  setRain(level: number): void {
    const next = Math.max(0, Math.min(1, level));
    if (Math.abs(next - this._rainLevel) < 0.01) return;
    this._rainLevel = next;
    if (!this._rain || !this._ctx) return;
    const now = this._ctx.currentTime;
    this._rain.gain.cancelScheduledValues(now);
    this._rain.gain.setTargetAtTime(next * RAIN_GAIN, now, 0.8);
  }

  /** A low roll of thunder, a moment after the flash. */
  thunder(): void {
    if (this._muted || !this._ctx || !this._master || !this._unlocked) return;
    const ctx = this._ctx;
    const t0 = ctx.currentTime + 0.25 + Math.random() * 0.6;
    const seconds = 2.6;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._master);
    src.start(t0);
    src.stop(t0 + seconds + 0.05);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  playPaint(voice: Voice): boolean {
    return this.play(voice, 'paint');
  }

  play(voice: Voice, lane = 'default'): boolean {
    if (this._muted || !this._ctx || !this._master || !this._unlocked) return false;
    const nowMs = performance.now();
    const last = this._lastAt.get(lane) ?? 0;
    const gap =
      lane === 'paint' ? PAINT_GAP_MS : lane === 'fail' ? FAIL_GAP_MS : lane === 'growth' ? GROWTH_GAP_MS : 0;
    if (gap > 0 && nowMs - last < gap) return false;
    this._lastAt.set(lane, nowMs);

    if (this._ctx.state === 'suspended') {
      void this._ctx.resume();
    }

    const t0 = this._ctx.currentTime;
    if (voice.kind === 'noise') {
      this._noiseBurst(voice, t0);
    } else if (voice.kind === 'chord') {
      this._tone(voice, t0, 1);
      this._tone({ ...voice, freq: voice.freq * 1.25, gain: voice.gain * 0.7 }, t0, 1);
      this._tone({ ...voice, freq: voice.freq * 1.5, gain: voice.gain * 0.5 }, t0, 1);
    } else {
      this._tone(voice, t0, 1);
    }
    return true;
  }

  private _applyMute(): void {
    if (!this._master || !this._ctx) return;
    const now = this._ctx.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setTargetAtTime(this._muted ? 0 : 1, now, 0.03);
    if (this._ambient) {
      this._ambient.gain.cancelScheduledValues(now);
      this._ambient.gain.setTargetAtTime(
        this._muted ? 0 : this._ambientLevel * 0.018,
        now,
        0.08,
      );
    }
    if (this._rain) {
      this._rain.gain.cancelScheduledValues(now);
      this._rain.gain.setTargetAtTime(this._muted ? 0 : this._rainLevel * RAIN_GAIN, now, 0.08);
    }
  }

  /** Looping hiss for rain; silent until {@link setRain}. */
  private _startRainBed(): void {
    if (!this._ctx || !this._master || this._rain) return;
    const ctx = this._ctx;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, rate * 2, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.4;
    this._rain = ctx.createGain();
    this._rain.gain.value = this._muted ? 0 : this._rainLevel * RAIN_GAIN;
    src.connect(filter);
    filter.connect(this._rain);
    this._rain.connect(this._master);
    src.start();
  }

  private _startAmbientBed(): void {
    if (!this._ctx || !this._ambient || this._ambientNoise) return;
    const seconds = 2;
    const rate = this._ctx.sampleRate;
    const buffer = this._ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5;
    }
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    src.connect(filter);
    filter.connect(this._ambient);
    src.start();
    this._ambientNoise = src;
  }

  private _tone(voice: Voice, t0: number, detuneRatio: number): void {
    if (!this._ctx || !this._master) return;
    const osc = this._ctx.createOscillator();
    osc.type = voice.type ?? 'sine';
    const startF = Math.max(40, voice.freq * detuneRatio);
    osc.frequency.setValueAtTime(startF, t0);
    if (voice.slide) {
      osc.frequency.linearRampToValueAtTime(Math.max(40, startF + voice.slide), t0 + voice.duration);
    }
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, voice.gain), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + voice.duration);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(t0);
    osc.stop(t0 + voice.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private _noiseBurst(voice: Voice, t0: number): void {
    if (!this._ctx || !this._master) return;
    const rate = this._ctx.sampleRate;
    const n = Math.max(1, Math.floor(rate * voice.duration));
    const buffer = this._ctx.createBuffer(1, n, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = voice.freq;
    filter.Q.value = 0.7;
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, voice.gain), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + voice.duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._master);
    src.start(t0);
    src.stop(t0 + voice.duration + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
}
