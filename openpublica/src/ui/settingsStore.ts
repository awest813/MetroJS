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
