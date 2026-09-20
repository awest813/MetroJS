/**
 * Dawn–dusk colour ramps. Babylon-free so Jest can lock the palette.
 * 0 = dawn, 0.5 = noon, 1 = dusk.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface DaylightPalette {
  readonly sun: Rgb;
  readonly fill: Rgb;
  readonly fillGround: Rgb;
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly ambient: Rgb;
  readonly sunIntensity: number;
  readonly fillIntensity: number;
  readonly azimuth: number;
  readonly height: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

const DAWN_SUN: Rgb = { r: 1.0, g: 0.68, b: 0.42 };
const NOON_SUN: Rgb = { r: 1.0, g: 0.96, b: 0.88 };
const DUSK_SUN: Rgb = { r: 1.0, g: 0.62, b: 0.50 };

const DAWN_ZENITH: Rgb = { r: 0.58, g: 0.42, b: 0.36 };
const NOON_ZENITH: Rgb = { r: 0.42, g: 0.58, b: 0.74 };
const DUSK_ZENITH: Rgb = { r: 0.34, g: 0.36, b: 0.55 };

const DAWN_HORIZON: Rgb = { r: 0.78, g: 0.48, b: 0.32 };
const NOON_HORIZON: Rgb = { r: 0.62, g: 0.72, b: 0.82 };
const DUSK_HORIZON: Rgb = { r: 0.55, g: 0.38, b: 0.42 };

export function daylightPalette(day: number): DaylightPalette {
  const t = Math.max(0, Math.min(1, day));
  const noon = Math.sin(t * Math.PI);
  const dusk = t;
  const blend = dusk * (1 - noon);
  const sun = lerpRgb(lerpRgb(DAWN_SUN, NOON_SUN, noon), DUSK_SUN, dusk * (1 - noon));
  const zenith = lerpRgb(lerpRgb(DAWN_ZENITH, NOON_ZENITH, noon), DUSK_ZENITH, dusk * (1 - noon * 0.35));
  const horizon = lerpRgb(lerpRgb(DAWN_HORIZON, NOON_HORIZON, noon), DUSK_HORIZON, blend);
  return {
    sun,
    fill: {
      r: lerp(0.80, 0.82, noon),
      g: lerp(0.62, 0.88, noon),
      b: lerp(0.52, 0.78, noon),
    },
    fillGround: {
      r: lerp(0.26, 0.32, noon),
      g: lerp(0.22, 0.38, noon),
      b: lerp(0.24, 0.28, noon),
    },
    zenith,
    horizon,
    ambient: {
      r: lerp(0.16, 0.18, noon),
      g: lerp(0.14, 0.20, noon),
      b: lerp(0.16, 0.24, noon),
    },
    sunIntensity: 0.72 + noon * 0.50,
    fillIntensity: 0.55 + noon * 0.32,
    azimuth: -0.55 + t * 2.6,
    height: 0.22 + noon * 1.15,
  };
}
