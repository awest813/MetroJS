// ⚠️  This file must NOT import anything from @babylonjs/core.

import { createSeededRng } from '../math/seededNoise';

/**
 * Weather: one spell per game month, drawn from the season's odds with dice
 * fixed by the map seed and the month, so a city's weather is the same on
 * every load and a scripted test city comes out the same every time.
 *
 * Effects are modest and spelled out to the player: a heatwave runs air
 * conditioning and sprinklers (power and water load up), snow needs plowing
 * (road upkeep up) and heating (power load up), rain and storms wash the smog
 * out of the air. Fog and cloud are only looks.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'heat';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export interface Weather {
  readonly kind: WeatherKind;
  readonly season: Season;
  /** Daytime temperature, °C. */
  readonly temperature: number;
}

/** Multipliers a weather spell puts on the month's numbers. */
export interface WeatherEffects {
  readonly powerLoad: number;
  readonly waterLoad: number;
  readonly smog: number;
  readonly roadUpkeep: number;
}

const NO_EFFECT: WeatherEffects = { powerLoad: 1, waterLoad: 1, smog: 1, roadUpkeep: 1 };

export const WEATHER_EFFECTS: Readonly<Record<WeatherKind, WeatherEffects>> = {
  clear: NO_EFFECT,
  cloudy: NO_EFFECT,
  fog: NO_EFFECT,
  rain: { ...NO_EFFECT, smog: 0.8 },
  storm: { ...NO_EFFECT, smog: 0.65 },
  snow: { ...NO_EFFECT, powerLoad: 1.1, roadUpkeep: 1.5 },
  heat: { ...NO_EFFECT, powerLoad: 1.15, waterLoad: 1.25 },
};

/** Relative odds of each spell by season. */
const SEASON_ODDS: Readonly<Record<Season, ReadonlyArray<readonly [WeatherKind, number]>>> = {
  winter: [['clear', 3], ['cloudy', 3], ['snow', 4], ['fog', 1]],
  spring: [['clear', 4], ['cloudy', 2], ['rain', 3], ['storm', 1], ['fog', 1]],
  summer: [['clear', 5], ['heat', 2], ['cloudy', 1], ['rain', 1], ['storm', 2]],
  autumn: [['clear', 3], ['cloudy', 3], ['rain', 3], ['fog', 2], ['storm', 1]],
};

/** Typical daytime temperature (°C) by month, January first. */
const MONTH_TEMPERATURE = [-1, 1, 6, 11, 16, 21, 24, 23, 18, 12, 6, 1] as const;

const KIND_TEMPERATURE: Readonly<Record<WeatherKind, number>> = {
  clear: 1,
  cloudy: -1,
  rain: -2,
  storm: -2,
  snow: -4,
  fog: -1,
  heat: 9,
};

const SEASON_OF_MONTH: readonly Season[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
];

/** Season of a calendar month (0 = January). */
export function seasonOf(monthOfYear: number): Season {
  return SEASON_OF_MONTH[((monthOfYear % 12) + 12) % 12];
}

/** The weather of game month `monthIndex` (0 = the city's first month) on map `seed`. */
export function weatherFor(seed: number, monthIndex: number): Weather {
  const month = ((monthIndex % 12) + 12) % 12;
  const season = seasonOf(month);
  const roll = createSeededRng(`openpublica-weather-${seed}-${monthIndex}`);
  const odds = SEASON_ODDS[season];
  const total = odds.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = roll() * total;
  let kind: WeatherKind = odds[0][0];
  for (const [candidate, weight] of odds) {
    pick -= weight;
    if (pick < 0) {
      kind = candidate;
      break;
    }
  }
  const jitter = Math.round((roll() - 0.5) * 4);
  return { kind, season, temperature: temperatureOf(kind, month, jitter) };
}

function temperatureOf(kind: WeatherKind, monthOfYear: number, jitter: number): number {
  const t = MONTH_TEMPERATURE[monthOfYear] + KIND_TEMPERATURE[kind] + jitter;
  // Snow falls at or below freezing-ish; a heatwave is hot.
  if (kind === 'snow') return Math.min(t, 1);
  if (kind === 'heat') return Math.max(t, 30);
  if (kind === 'rain' || kind === 'storm') return Math.max(t, 2);
  return t;
}

/** A given kind of weather in game month `monthIndex`, at that month's usual temperature. */
export function weatherOfKind(kind: WeatherKind, monthIndex: number): Weather {
  const month = ((monthIndex % 12) + 12) % 12;
  return { kind, season: seasonOf(month), temperature: temperatureOf(kind, month, 0) };
}

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'heat'];

/** The kind named `name`, or null (for `?weather=` and the like). */
export function parseWeatherKind(name: string | null): WeatherKind | null {
  return WEATHER_KINDS.find((k) => k === name) ?? null;
}

const LABELS: Readonly<Record<WeatherKind, string>> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  storm: 'Storms',
  snow: 'Snow',
  fog: 'Fog',
  heat: 'Heatwave',
};

/** Short HUD text, e.g. "Snow −3°". */
export function formatWeather(weather: Weather): string {
  const t = weather.temperature;
  return `${LABELS[weather.kind]} ${t < 0 ? '−' : ''}${Math.abs(t)}°`;
}

/** What the spell does to the city, or null when it is only weather. */
export function describeWeatherEffects(kind: WeatherKind): string | null {
  switch (kind) {
    case 'heat': return 'air conditioning adds 15% to power load and sprinklers 25% to water load';
    case 'snow': return 'plowing adds 50% to road upkeep and heating 10% to power load';
    case 'rain': return 'rain washes a fifth of the smog out of the air';
    case 'storm': return 'storms wash a third of the smog out of the air';
    default: return null;
  }
}

/** Full label for tooltips and forecasts, e.g. "Heatwave". */
export function weatherLabel(kind: WeatherKind): string {
  return LABELS[kind];
}
