// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CitySim } from '../sim/CitySim';
import { RoadType, ZoneType } from '../sim/CityTile';
import { CityBuilder } from './CityBuilder';

const { Street, Highway, TrolleyAvenue } = RoadType;
const { Residential, Commercial, Industrial, MixedUse } = ZoneType;

/**
 * Scripted cities for play-testing, screenshots, and scenario tests. Each is
 * built with the player's tools on its own map and grown with seeded dice, so
 * it comes out the same every time. Open one with `?city=<id>`.
 *
 * Together they cover the game: a first hour, bridges and waterfront, a large
 * planned city with every service, a badly run town that trips the warnings,
 * and a long commuter strip where power runs out along the line.
 */
export interface TestCity {
  /** URL name: `?city=<id>`. */
  readonly id: string;
  readonly title: string;
  /** One line for the status bar. */
  readonly summary: string;
  /** What the city is for: the systems and situations it exercises. */
  readonly covers: readonly string[];
  /**
   * Run the script. Returns the city and anything the tools would not build
   * (empty for a sound script). `watch` sees the city after every month.
   */
  build(watch?: (sim: CitySim) => void): BuiltCity;
}

export interface BuiltCity {
  readonly sim: CitySim;
  readonly refused: readonly string[];
}

type Script = (b: CityBuilder) => CityBuilder;

function run(script: Script, seed: number, money: number, watch?: (sim: CitySim) => void): BuiltCity {
  const builder = script(CityBuilder.start(seed, money, watch));
  return { sim: builder.finish(), refused: builder.refused };
}

const hamlet: TestCity = {
  id: 'hamlet',
  title: 'Hamlet',
  summary: 'Hamlet: a crossroads village two years in, with shops, a few factories, and one plant past the edge of town.',
  covers: [
    'the first hours on the default $10,000 budget',
    'starter demand, and jobs pulling housing demand up',
    'two-lot plats along streets, shops at the crossroads, a small network',
    'woods standing all around town',
  ],
  build: (watch) => run((b) => b
    .road(Street, [36, 8], [63, 8])
    .road(Street, [46, 3], [46, 14])
    .zone(Residential, [37, 7], [45, 9], false)
    .zone(Residential, [45, 3], [47, 6], false)
    .zone(Residential, [45, 10], [47, 14], false)
    .zone(Commercial, [47, 7], [53, 9], false)
    .zone(Industrial, [56, 7], [59, 9], false)
    .place('plant', 63, 9)
    .months(24), 11, 10_000, watch),
};

const riverside: TestCity = {
  id: 'riverside',
  title: 'Riverside',
  summary: 'Riverside: two banks joined by a street bridge and a highway bridge; every plant is on the north bank.',
  covers: [
    'street and highway bridges, and power crossing the river on them',
    'waterfront lots on the lake (higher land value) and shoreline tiles',
    'a park at the bridgehead, a water tower on the far bank, a police station on each bank',
    'factories across the lake, woods left standing between neighbourhoods',
  ],
  build: (watch) => run((b) => b
    .road(Highway, [14, 30], [63, 30])
    .road(Street, [36, 22], [36, 50])
    .zone(Residential, [37, 21], [47, 28])
    .zone(Commercial, [37, 29], [56, 31], false)
    .zone(Industrial, [15, 29], [24, 31], false)
    .zone(Residential, [26, 39], [35, 50])
    .zone(Residential, [37, 45], [42, 50])
    .place('plant', 62, 29)
    .place('plant', 62, 31)
    .place('plant', 61, 29)
    .place('park', 35, 38)
    .place('tower', 37, 44)
    .place('police', 48, 25)
    .place('police', 37, 41)
    .months(30), 2026, 40_000, watch),
};

const metro: TestCity = {
  id: 'metro',
  title: 'Metro',
  summary: 'Metro: a planned city in three phases, with a highway, a trolley line, industry, and every service.',
  covers: [
    'large zone areas with auto streets (two-lot blocks closed into loops, crossed halfway), grown over four and a half years',
    'densification, commercial and industrial demand, mixed use on a trolley line',
    'several plants and towers on one grid',
    'a trolley line crossing the highway at grade, and one trolley per eight tiles of it',
    'police, fire, and park coverage; a jammed downtown of office blocks',
  ],
  build: (watch) => run((b) => b
    // Phase 1: a highway, homes, shops, factories, and a plant past them.
    .road(Highway, [26, 18], [63, 18])
    .zone(Residential, [28, 2], [42, 16])
    .zone(Commercial, [32, 20], [42, 26])
    .zone(Industrial, [55, 20], [62, 28])
    .road(Street, [58, 29], [58, 33])
    .place('plant', 59, 32)
    .place('tower', 43, 17)
    .place('police', 27, 9)
    .months(12)
    // Phase 2: a trolley line, downtown and homes east of it, mixed use along it, services.
    .road(TrolleyAvenue, [44, 1], [44, 36])
    .zone(Commercial, [46, 2], [62, 8])
    .zone(Residential, [46, 10], [62, 16])
    .place('police', 55, 14)
    // The west district's first station, on its west spine, reaches only half of it.
    .place('police', 43, 9)
    .zone(MixedUse, [45, 20], [52, 30])
    .place('plant', 57, 32)
    .place('fire', 45, 19)
    .place('park', 33, 17)
    .months(18)
    // Phase 3: more power and water, police downtown, parks.
    .place('plant', 59, 33)
    .place('plant', 57, 33)
    .place('plant', 57, 31)
    .place('plant', 59, 31)
    .place('tower', 53, 17)
    .place('tower', 43, 27)
    .place('tower', 61, 17)
    .place('police', 43, 25)
    .place('park', 51, 17)
    .months(24), 7, 120_000, watch),
};

const troubled: TestCity = {
  id: 'troubled',
  title: 'Troubled',
  summary: 'Troubled: deep blocks with no frontage, a plant among the houses, factories next door, no police, and taxes just raised.',
  covers: [
    'the advisories: lots without a road, power at capacity, a stranded tower, a dark station, smog, taxes',
    'dark houses, stress, and abandonment',
    'industry beside homes and a plant inside the neighbourhood',
    'the Power map showing a network short of supply',
  ],
  build: (watch) => run((b) => b
    .road(Street, [2, 40], [30, 40])
    .road(Street, [2, 46], [30, 46])
    .road(Street, [2, 40], [2, 52])
    .road(Street, [30, 40], [30, 52])
    .road(Street, [2, 52], [30, 52])
    .zone(Residential, [3, 39], [29, 39], false)
    .zone(Residential, [3, 41], [29, 45], false)
    .zone(Industrial, [3, 47], [29, 51], false)
    .place('plant', 16, 45)
    .road(Street, [20, 58], [28, 58])
    .place('police', 24, 59)
    .place('tower', 34, 61)
    .months(30)
    .taxes(16, 14, 14)
    .months(6), 101, 30_000, watch),
};

const sprawl: TestCity = {
  id: 'sprawl',
  title: 'Sprawl',
  summary: 'Sprawl: a highway strip across the map with cul-de-sacs; growth waits at the grid\'s capacity until a second plant, and a third follows the factories.',
  covers: [
    'one long network at capacity: new lots wait for power instead of darkening the far end',
    'a second plant at the far end fixing the shortfall, and a third as the industrial park grows into factories',
    'highway traffic and low walkability, no transit',
    'dead-end streets, a shopping strip, and factories across the highway',
  ],
  build: (watch) => run((b) => {
    b.road(Highway, [0, 59], [63, 59]).place('plant', 1, 60);
    for (let x = 5; x <= 61; x += 7) {
      b.road(Street, [x, 58], [x, 49]);
      b.zone(Residential, [x - 1, 49], [x + 1, 57], false);
    }
    b.zone(Commercial, [2, 58], [63, 58], false);
    // An industrial park behind the plant, off the highway.
    b.road(Street, [10, 60], [10, 62]).road(Street, [2, 62], [22, 62]);
    b.zone(Industrial, [2, 61], [22, 63], false);
    b.place('tower', 33, 61).road(Street, [33, 60], [33, 60]);
    b.months(30);
    b.place('plant', 62, 60);
    b.months(6);
    // Jobs have caught up and the industrial park is turning into factories: a third plant.
    b.place('plant', 61, 60);
    return b.months(6);
  }, 314, 60_000, watch),
};

export const TEST_CITIES: readonly TestCity[] = [hamlet, riverside, metro, troubled, sprawl];

export function testCityById(id: string): TestCity | undefined {
  return TEST_CITIES.find((city) => city.id === id);
}
