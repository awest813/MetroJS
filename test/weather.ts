import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import {
  WEATHER_EFFECTS,
  WEATHER_KINDS,
  formatWeather,
  parseWeatherKind,
  seasonOf,
  weatherFor,
  weatherOfKind,
  type WeatherKind,
} from '../openpublica/src/sim/weather';
import { CLEAR_LOOK, blendLooks, weatherLook } from '../openpublica/src/render/weatherLook';
import { weatherTooltip } from '../openpublica/src/ui/CityHUD';

/** A street of lit small houses with a plant and a water tower at the west end. */
function litTown(): CitySim {
  const sim = CitySim.createCity(32, 8);
  sim.stats.money = 1_000_000;
  sim.batch(() => {
    for (let x = 0; x < 32; x++) sim.placeRoad(x, 3, RoadType.Street);
    for (let x = 12; x < 22; x++) {
      const tile = sim.getTile(x, 4)!;
      tile.zoneType = ZoneType.Residential;
      tile.buildingId = 'small_house';
      sim.growth.buildings.set(`${x},4`, { defId: 'small_house', x, y: 4 });
    }
    sim.placeServiceBuilding(0, 4, 'small_power_plant', 0);
    sim.placeServiceBuilding(1, 2, 'small_water_tower', 0);
  });
  return sim;
}

function underWeather(kind: WeatherKind): CitySim {
  const sim = litTown();
  sim.pinWeather(kind);
  return sim;
}

describe('weather rolls', () => {
  it('should give the same weather for the same map and month', () => {
    for (let m = 0; m < 24; m++) expect(weatherFor(7, m)).toEqual(weatherFor(7, m));
    const a = Array.from({ length: 48 }, (_, m) => weatherFor(1, m).kind).join();
    const b = Array.from({ length: 48 }, (_, m) => weatherFor(2, m).kind).join();
    expect(a).not.toBe(b);
  });

  it('should keep snow to winter, heatwaves to summer, and rain out of winter', () => {
    const counts = new Map<string, number>();
    let winterMonths = 0;
    let winterSnow = 0;
    for (let m = 0; m < 1200; m++) {
      const w = weatherFor(2026, m);
      expect(w.season).toBe(seasonOf(m % 12));
      counts.set(`${w.season}:${w.kind}`, (counts.get(`${w.season}:${w.kind}`) ?? 0) + 1);
      if (w.kind === 'snow') expect(w.temperature).toBeLessThanOrEqual(1);
      if (w.kind === 'heat') expect(w.temperature).toBeGreaterThanOrEqual(30);
      if (w.season === 'winter') {
        winterMonths += 1;
        if (w.kind === 'snow') winterSnow += 1;
      }
    }
    for (const key of counts.keys()) {
      const [season, kind] = key.split(':');
      if (kind === 'snow') expect(season).toBe('winter');
      if (kind === 'heat') expect(season).toBe('summer');
      if (season === 'winter') expect(['clear', 'cloudy', 'snow', 'fog']).toContain(kind);
    }
    // Four in eleven winter months snow.
    expect(winterSnow / winterMonths).toBeGreaterThan(0.28);
    expect(winterSnow / winterMonths).toBeLessThan(0.45);
  });

  it('should name the weather for the HUD with a true minus sign', () => {
    expect(formatWeather({ kind: 'snow', season: 'winter', temperature: -3 })).toBe('Snow −3°');
    expect(formatWeather({ kind: 'heat', season: 'summer', temperature: 31 })).toBe('Heatwave 31°');
    expect(parseWeatherKind('storm')).toBe('storm');
    expect(parseWeatherKind('hail')).toBeNull();
    expect(parseWeatherKind(null)).toBeNull();
    expect(weatherOfKind('rain', 0).temperature).toBeGreaterThanOrEqual(2);
  });

  it('should spell out next month in the tooltip', () => {
    const now = { kind: 'clear', season: 'summer', temperature: 24 } as const;
    const next = { kind: 'heat', season: 'summer', temperature: 32 } as const;
    expect(weatherTooltip(now, next)).toBe(
      'Clear, 24°C this summer month. Next month: heatwave — air conditioning adds 15% to power load and sprinklers 25% to water load.',
    );
    expect(weatherTooltip(next, next)).toMatch(/Next month: heatwave again\.$/);
  });
});

describe('weather in the sim', () => {
  it('should follow the calendar month by month', () => {
    const sim = CitySim.createCity(8, 8, 314);
    for (let m = 0; m < 14; m++) {
      expect(sim.weather).toEqual(weatherFor(314, m));
      expect(sim.nextWeather).toEqual(weatherFor(314, m + 1));
      sim.tick(MONTH_SECONDS);
    }
  });

  it('should announce new weather only when it changes', () => {
    const sim = CitySim.createCity(8, 8, 314);
    let calls = 0;
    sim.onWeatherChanged = () => { calls += 1; };
    let changes = 0;
    for (let m = 0; m < 36; m++) {
      const a = weatherFor(314, m);
      const b = weatherFor(314, m + 1);
      if (a.kind !== b.kind || a.temperature !== b.temperature) changes += 1;
      sim.tick(MONTH_SECONDS);
    }
    expect(calls).toBe(changes);
  });

  it('should load a heatwave onto power and water, and snow onto power', () => {
    const clear = underWeather('clear');
    const heat = underWeather('heat');
    const snow = underWeather('snow');
    // Ten houses of 4 and the tower's 2 jobs.
    expect(clear.stats.powerLoad).toBe(42);
    expect(heat.stats.powerLoad).toBe(Math.round(42 * WEATHER_EFFECTS.heat.powerLoad));
    expect(heat.stats.waterLoad).toBe(Math.round(clear.stats.waterLoad * WEATHER_EFFECTS.heat.waterLoad));
    expect(snow.stats.powerLoad).toBe(Math.round(42 * WEATHER_EFFECTS.snow.powerLoad));
    expect(snow.stats.waterLoad).toBe(clear.stats.waterLoad);
  });

  it('should wash smog out in rain and storms', () => {
    const clear = underWeather('clear');
    const rain = underWeather('rain');
    const storm = underWeather('storm');
    const smog = (sim: CitySim): number => sim.getTile(1, 4)!.pollution;
    expect(smog(clear)).toBeGreaterThan(0);
    expect(smog(rain)).toBeLessThan(smog(clear));
    expect(smog(storm)).toBeLessThan(smog(rain));
  });

  it('should return to the seasons when unpinned', () => {
    const sim = litTown();
    const seasonal = sim.weather;
    sim.pinWeather(seasonal.kind === 'heat' ? 'fog' : 'heat');
    expect(sim.weather.kind).not.toBe(seasonal.kind);
    sim.pinWeather(null);
    expect(sim.weather).toEqual(seasonal);
  });

  it('should come back with the same weather after a save', () => {
    const sim = CitySim.createCity(8, 8, 101);
    for (let m = 0; m < 7; m++) sim.tick(MONTH_SECONDS);
    const restored = CitySim.createCity(8, 8);
    SaveCodec.decode(JSON.parse(JSON.stringify(SaveCodec.encode(sim))), restored);
    restored.refreshDerivedState({ notify: false });
    expect(restored.weather).toEqual(sim.weather);
  });

  it('should warn before a heatwave pushes a full grid past capacity', () => {
    const sim = underWeather('clear');
    sim.stats.powerLoad = 380;
    sim.stats.powerSupply = 400;
    sim.evaluation.tick(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats, {
      label: 'Heatwave',
      powerLoadRatio: WEATHER_EFFECTS.heat.powerLoad,
      waterLoadRatio: 1,
    });
    expect(sim.stats.advisory).toBe('Heatwave next month will push power load to about 437 of 400 — add a plant before it comes.');
    sim.evaluation.tick(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats, {
      label: 'Clear',
      powerLoadRatio: 1,
      waterLoadRatio: 1,
    });
    expect(sim.stats.advisory).not.toMatch(/next month/);
  });
});

describe('weather looks', () => {
  it('should have a look for every kind, clear being plain daylight', () => {
    for (const kind of WEATHER_KINDS) expect(weatherLook(weatherOfKind(kind, 6))).toBeDefined();
    expect(weatherLook({ kind: 'clear', season: 'summer', temperature: 20 })).toBe(CLEAR_LOOK);
    expect(weatherLook(weatherOfKind('rain', 6)).rain).toBeGreaterThan(0);
    expect(weatherLook(weatherOfKind('snow', 0)).snowCover).toBeGreaterThan(0.5);
  });

  it('should leave old snow lying in a freezing month', () => {
    expect(weatherLook({ kind: 'clear', season: 'winter', temperature: -2 }).snowCover).toBeGreaterThan(0);
    expect(weatherLook({ kind: 'clear', season: 'winter', temperature: 3 }).snowCover).toBe(0);
  });

  it('should blend from one look to the next', () => {
    const rain = weatherLook(weatherOfKind('rain', 4));
    expect(blendLooks(CLEAR_LOOK, rain, 0)).toEqual({ ...CLEAR_LOOK, skyTint: expect.any(Object) });
    const half = blendLooks(CLEAR_LOOK, rain, 0.5);
    expect(half.rain).toBeCloseTo(rain.rain / 2);
    expect(half.skyTint.r).toBeCloseTo(rain.skyTint.r);
    expect(half.skyBlend).toBeCloseTo(rain.skyBlend / 2);
    expect(blendLooks(CLEAR_LOOK, rain, 1).fogEnd).toBe(rain.fogEnd);
  });
});
