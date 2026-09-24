import type { Weather, WeatherKind } from '../sim/weather';
import type { Rgb } from './skyColors';

/**
 * How each kind of weather looks: how much sun gets through, how far the fog
 * reaches, what the sky turns, how hard shadows fall, what comes down, and
 * how white the ground goes. Babylon-free so Jest can lock it.
 */
export interface WeatherLook {
  /** Multipliers on the daylight sun and fill. */
  readonly sunScale: number;
  readonly fillScale: number;
  /** Colour the sky and fog blend toward, and how far. */
  readonly skyTint: Rgb;
  readonly skyBlend: number;
  /**
   * Linear fog range in world units (the map is 64 across, the default camera
   * about 78 away). Only fog itself hides the city; rain and snow haze it.
   */
  readonly fogStart: number;
  readonly fogEnd: number;
  /** Babylon shadow darkness: 0 black, 1 none. Overcast skies cast faint shadows. */
  readonly shadowDarkness: number;
  /** Rain and snow falling, 0–1. */
  readonly rain: number;
  readonly snow: number;
  /** Snow lying on flat ground and roofs, 0–1. */
  readonly snowCover: number;
  readonly lightning: boolean;
}

const CLEAR: WeatherLook = {
  sunScale: 1,
  fillScale: 1,
  skyTint: { r: 0, g: 0, b: 0 },
  skyBlend: 0,
  fogStart: 70,
  fogEnd: 220,
  shadowDarkness: 0.38,
  rain: 0,
  snow: 0,
  snowCover: 0,
  lightning: false,
};

const LOOKS: Readonly<Record<WeatherKind, WeatherLook>> = {
  clear: CLEAR,
  cloudy: {
    ...CLEAR, sunScale: 0.62, fillScale: 1.05, skyTint: { r: 0.62, g: 0.66, b: 0.70 }, skyBlend: 0.45,
    fogStart: 65, fogEnd: 210, shadowDarkness: 0.68,
  },
  rain: {
    ...CLEAR, sunScale: 0.5, fillScale: 0.95, skyTint: { r: 0.50, g: 0.55, b: 0.60 }, skyBlend: 0.6,
    fogStart: 55, fogEnd: 190, shadowDarkness: 0.78, rain: 0.7,
  },
  storm: {
    ...CLEAR, sunScale: 0.36, fillScale: 0.85, skyTint: { r: 0.30, g: 0.33, b: 0.38 }, skyBlend: 0.72,
    fogStart: 45, fogEnd: 170, shadowDarkness: 0.85, rain: 1, lightning: true,
  },
  snow: {
    ...CLEAR, sunScale: 0.62, fillScale: 1.12, skyTint: { r: 0.80, g: 0.82, b: 0.86 }, skyBlend: 0.6,
    fogStart: 50, fogEnd: 180, shadowDarkness: 0.7, snow: 0.8, snowCover: 0.8,
  },
  fog: {
    ...CLEAR, sunScale: 0.55, skyTint: { r: 0.74, g: 0.76, b: 0.78 }, skyBlend: 0.75,
    fogStart: 8, fogEnd: 85, shadowDarkness: 0.8,
  },
  heat: {
    ...CLEAR, sunScale: 1.1, skyTint: { r: 0.88, g: 0.80, b: 0.64 }, skyBlend: 0.22,
    fogStart: 60, fogEnd: 200, shadowDarkness: 0.34,
  },
};

/** Snow that lingers on the ground in a freezing month without fresh snow. */
const LINGERING_SNOW = 0.35;

/** The look of a month's weather. */
export function weatherLook(weather: Weather): WeatherLook {
  const look = LOOKS[weather.kind];
  if (weather.kind !== 'snow' && weather.temperature <= 0) {
    return { ...look, snowCover: Math.max(look.snowCover, LINGERING_SNOW) };
  }
  return look;
}

export const CLEAR_LOOK = CLEAR;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Part way from look `a` to look `b` (t = 0 → a, 1 → b). */
export function blendLooks(a: WeatherLook, b: WeatherLook, t: number): WeatherLook {
  const k = Math.max(0, Math.min(1, t));
  return {
    sunScale: mix(a.sunScale, b.sunScale, k),
    fillScale: mix(a.fillScale, b.fillScale, k),
    // Blend the tints as colours already mixed into the sky, so clear → rain greys smoothly.
    skyTint: {
      r: mix(a.skyTint.r * a.skyBlend, b.skyTint.r * b.skyBlend, k) / Math.max(1e-6, mix(a.skyBlend, b.skyBlend, k)),
      g: mix(a.skyTint.g * a.skyBlend, b.skyTint.g * b.skyBlend, k) / Math.max(1e-6, mix(a.skyBlend, b.skyBlend, k)),
      b: mix(a.skyTint.b * a.skyBlend, b.skyTint.b * b.skyBlend, k) / Math.max(1e-6, mix(a.skyBlend, b.skyBlend, k)),
    },
    skyBlend: mix(a.skyBlend, b.skyBlend, k),
    fogStart: mix(a.fogStart, b.fogStart, k),
    fogEnd: mix(a.fogEnd, b.fogEnd, k),
    shadowDarkness: mix(a.shadowDarkness, b.shadowDarkness, k),
    rain: mix(a.rain, b.rain, k),
    snow: mix(a.snow, b.snow, k),
    snowCover: mix(a.snowCover, b.snowCover, k),
    lightning: k < 0.5 ? a.lightning : b.lightning,
  };
}

/** Mix a daylight colour toward the weather's sky tint. */
export function tintSky(base: Rgb, look: WeatherLook): Rgb {
  const t = look.skyBlend;
  return {
    r: mix(base.r, look.skyTint.r, t),
    g: mix(base.g, look.skyTint.g, t),
    b: mix(base.b, look.skyTint.b, t),
  };
}
