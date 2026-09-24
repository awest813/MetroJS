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

export function writeStoredQuality(level: QualityLevel): void {
  try {
    globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, level);
  } catch {
    /* private mode */
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

export function writeStoredSun(day: number): void {
  try {
    globalThis.localStorage?.setItem(SUN_STORAGE_KEY, String(Math.max(0, Math.min(1, day))));
  } catch {
    /* private mode */
  }
}

export const AMBIENT_OCCLUSION_STORAGE_KEY = 'openpublica.ambientOcclusion';

/** Ambient occlusion is opt-in: its GPU cost was only measured in software (Gap AB). */
export function readStoredAmbientOcclusion(): boolean {
  try {
    return globalThis.localStorage?.getItem(AMBIENT_OCCLUSION_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeStoredAmbientOcclusion(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(AMBIENT_OCCLUSION_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}

/**
 * Ambient occlusion draws only on High quality, when asked for, where the
 * browser can, and not under a data map: it would darken the map's colours
 * around every building, and those colours are the data.
 */
export function ambientOcclusionActive(opts: {
  quality: QualityLevel;
  wanted: boolean;
  supported: boolean;
  mapShown: boolean;
}): boolean {
  return opts.supported && opts.wanted && opts.quality === 'high' && !opts.mapShown;
}
