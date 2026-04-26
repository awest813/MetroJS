# OpenPublica Porting Guide

A practical reference for implementing OpenPublica Phase 1 systems, derived from
MicropolisJS / MetroJS. Each section covers what the system does, where to find
it in the source, what data it needs, what it produces, and how to approach the
port into Babylon.js / TypeScript.

> **Ground rules:** Do not port code yet. Do not modify gameplay logic. This
> guide is input for a future implementation agent.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [GameMap — Tile Grid](#2-gamemap--tile-grid)
3. [SimulationClock — Main Loop](#3-simulationclock--main-loop)
4. [DemandValves — Growth Pressure](#4-demandvalves--growth-pressure)
5. [CityCensus — Population Counters](#5-citycensus--population-counters)
6. [MapScanner — Tile Dispatch](#6-mapscanner--tile-dispatch)
7. [PowerGrid — Electricity BFS](#7-powergrid--electricity-bfs)
8. [ZoneGrowth — Residential / Commercial / Industrial](#8-zonegrowth--residential--commercial--industrial)
9. [TrafficRouter — Road Connectivity](#9-trafficrouter--road-connectivity)
10. [TerrainAnalyser — Pollution, Land Value & Density](#10-terrainanalyser--pollution-land-value--density)
11. [CrimeModel — Crime Score](#11-crimemodel--crime-score)
12. [EmergencyServices — Police & Fire](#12-emergencyservices--police--fire)
13. [CityEvaluator — Score & Classification](#13-cityevaluator--score--classification)
14. [BudgetManager — Tax & Spending](#14-budgetmanager--tax--spending)
15. [DisasterManager — Random Events](#15-disastermanager--random-events)
16. [SaveSystem — Persistence](#16-savesystem--persistence)
17. [TileRenderer — Visual Output](#17-tilerenderer--visual-output)
18. [SpriteManager — Animated Actors](#18-spritemanager--animated-actors)
19. [Asset Summary & Licensing](#19-asset-summary--licensing)
20. [Phase 1 Recommended Build Order](#20-phase-1-recommended-build-order)

---

## 1. Architecture Overview

MicropolisJS is a single-page browser app written in ES6-style JavaScript with
a handful of TypeScript files for constants and types. It runs a discrete-time
simulation driven by a `requestAnimationFrame` / `setInterval` loop. All
subsystems share a single `simData` plain-object data bus assembled each tick.

OpenPublica replaces the 2-D canvas renderer with a Babylon.js 3-D scene but
**must preserve the simulation logic unchanged** in Phase 1.

The cleanest strategy is to:

1. Port every simulation subsystem to a standalone TypeScript class with no DOM
   or canvas dependency.
2. Keep all numeric constants identical to MicropolisJS.
3. Provide a thin Babylon.js adapter layer that reads the simulation's output
   each tick and updates the 3-D scene.

---

## 2. GameMap — Tile Grid

### What it does

Holds the 120 × 100 grid of tiles that constitutes the city. Each tile is a
16-bit packed integer storing a type index (bits 9-0) and six flag bits
(POWERBIT, CONDBIT, BURNBIT, BULLBIT, ANIMBIT, ZONEBIT).

### Source files / key functions

| File | Role |
|---|---|
| `src/gameMap.js` | `GameMap` class; `getTile`, `setTileValue`, `save`, `load` |
| `src/tile.ts` | `Tile` class; `getRawValue`, flag getters |
| `src/tileFlags.ts` | Flag bitmask constants (`POWERBIT = 0x8000`, etc.) |
| `src/tileValues.ts` | Tile-type index constants (e.g. `RESIDENTIAL`, `ROAD`) |
| `src/tileUtils.js` | Helpers: `isRoad`, `isZone`, `isDriveable`, etc. |
| `src/zoneUtils.js` | `getZoneSize`, `getLandPollutionValue`, zone-tile layout helpers |

### Data it needs

- Map dimensions: `width = 120`, `height = 100` (constants; do not change).
- A flat `Uint16Array` or equivalent typed array of `width × height` packed
  tile values.

### Output it produces

- `getTile(x, y)` → `Tile` object (type index + flag accessors).
- `setTileValue(x, y, packedInt)` → mutates the grid in place.
- The grid is the shared truth consumed by every other system.

### Port recommendation: **Port directly**

The tile grid has no rendering or DOM code. Wrap it in a typed `GameMap.ts`
class backed by a `Uint16Array`. Keep flag constants and tile-type constants as
TypeScript `const enum` in dedicated files.

### Recommended TypeScript module

```
src/simulation/GameMap.ts
src/simulation/TileFlags.ts      (was tileFlags.ts)
src/simulation/TileValues.ts     (was tileValues.ts)
src/simulation/TileUtils.ts      (was tileUtils.js)
src/simulation/ZoneUtils.ts      (was zoneUtils.js)
```

---

## 3. SimulationClock — Main Loop

### What it does

Drives the entire simulation. `simTick()` is called by the browser frame loop
and rate-limits execution to three speed modes (fast/med/slow). When a frame is
due, `simulate()` advances one phase (0–15) of a 16-phase cycle. Every
subsystem is called from a specific phase.

### Source files / key functions

| File | Role |
|---|---|
| `src/simulation.js` | `Simulation`, `simTick`, `_simFrame`, `simulate`, `_constructSimData`, `_sendMessages` |

### Data it needs

- Wall-clock timestamps (via `Date.now()` — no DOM dependency).
- References to all subsystem objects assembled in `_constructSimData()`.
- Speed setting (`SPEED_PAUSED=0`, `SPEED_SLOW=1`, `SPEED_MED=2`, `SPEED_FAST=3`).
- Game level (`LEVEL_EASY=0`, `LEVEL_MED=1`, `LEVEL_HARD=2`).

### Output it produces

- Advances `cityTime` (integer tick counter).
- Calls every subsystem in phase order (see SIMULATION_MAP.md §1 for the
  complete schedule).
- Emits advisory messages via an event emitter for the UI layer.

### Port recommendation: **Rewrite the shell, preserve phase logic**

The 16-phase schedule and all timing constants must be preserved exactly. The
frame-rate-limiting code (`_simFrame`) depends on `Date.now()` and is already
DOM-free. Replace the `requestAnimationFrame` callback registration with a
Babylon.js `scene.onBeforeRenderObservable` or a dedicated update loop. The
`_constructSimData()` factory can become a typed `SimData` interface in
TypeScript.

### Recommended TypeScript module

```
src/simulation/SimulationClock.ts
src/simulation/SimData.ts        (typed data-bus interface)
```

---

## 4. DemandValves — Growth Pressure

### What it does

Computes three signed integers (`resValve`, `comValve`, `indValve`) that
represent net demand for residential, commercial, and industrial zones. Positive
= grow, negative = shrink. Updated each cycle at phase 0.

### Source files / key functions

| File | Role |
|---|---|
| `src/valves.js` | `Valves`, `setValves(gameLevel, census, budget)`, `save`, `load` |

### Data it needs

- `census`: `resPop`, `comPop`, `indPop`, `totalPop`, `landValueAverage`.
- `budget`: `cityTax`, current tax level.
- `gameLevel`: controls `extMarketParamTable` and `taxTable` look-ups.
- Internal state: `resCap`, `comCap`, `indCap` (cap flags set by `_sendMessages`
  when major infrastructure is absent).

### Output it produces

- `resValve` (−2000 … +2000)
- `comValve` (−1500 … +1500)
- `indValve` (−1500 … +1500)

### Port recommendation: **Port directly**

Pure arithmetic; no DOM or rendering code. Translate all lookup tables
(`extMarketParamTable`, `taxTable`) into TypeScript `const` arrays. The cap
flags need to be set by whatever message-dispatch mechanism OpenPublica uses.

### Recommended TypeScript module

```
src/simulation/DemandValves.ts
```

---

## 5. CityCensus — Population Counters

### What it does

Accumulates zone and infrastructure counts during the map scan, and maintains
12 ring-buffer history arrays (120 entries each) for the statistics graphs.
`take10Census()` rotates the 10-cycle arrays every 4 ticks; `take120Census()`
rotates the 120-cycle arrays every 40 ticks.

### Source files / key functions

| File | Role |
|---|---|
| `src/census.js` | `Census`, `clearCensus`, `take10Census`, `take120Census`, `save`, `load` |

### Data it needs

- Raw counts fed by the map scanner (zone counts, road/rail counts, etc.).
- `landValueAverage`, `pollutionAverage`, `crimeAverage` fed by `blockMapUtils`.

### Output it produces

- `resPop`, `comPop`, `indPop`, `totalPop` (used by valves, budget, evaluation).
- `resHist10[]`, `resHist120[]`, and ten other history arrays (graph data).

### Port recommendation: **Port directly**

No DOM dependency. The history arrays are plain `number[]`. Implement
`clearCensus()`, `take10Census()`, `take120Census()` with identical logic.

### Recommended TypeScript module

```
src/simulation/CityCensus.ts
```

---

## 6. MapScanner — Tile Dispatch

### What it does

Iterates the tile grid column by column (8 equal slices across phases 1-8) and
fires the first registered handler whose criterion matches each tile. Handlers
perform zone growth, power counting, station accounting, and road maintenance.

### Source files / key functions

| File | Role |
|---|---|
| `src/mapScanner.js` | `MapScanner`, `addAction(criterion, action)`, `mapScan(startX, maxX, simData)` |

### Data it needs

- The full `GameMap` tile grid.
- `simData` (passed through to every handler).
- The registered handler table (populated at startup by each subsystem).

### Output it produces

- Mutations to `GameMap` tiles (zone upgrades/downgrades, power flags).
- Increments to census counters.
- Entries on the power stack (`powerManager._powerStack`).
- Updates to block maps (police/fire station accumulation).

### Port recommendation: **Port directly**

The scanner is a pure dispatch engine with no rendering logic. The
`addAction` registration pattern maps cleanly to a TypeScript array of
`{ criterion: TilePredicate; action: TileAction }` objects.

### Recommended TypeScript module

```
src/simulation/MapScanner.ts
```

---

## 7. PowerGrid — Electricity BFS

### What it does

Two-phase process:
1. During the map scan (phases 1-8), power plant tiles are pushed onto a stack
   with their capacity (coal = 700, nuclear = 2000).
2. At phase 11, a BFS flood-fill spreads power from each plant outward, marking
   reachable conductive tiles in `powerGridMap`. Each tile traversed costs 1
   capacity unit. If capacity runs out, a "not enough power" event fires.

### Source files / key functions

| File | Role |
|---|---|
| `src/powerManager.js` | `PowerManager`, `coalPowerFound`, `nuclearPowerFound`, `doPowerScan`, `setTilePower` |
| `src/blockMap.ts` | `BlockMap` (chunk-based 2-D map used for `powerGridMap`) |

### Data it needs

- `GameMap` tile grid (to read tile types and set `POWERBIT`).
- `census` (to count powered/unpowered zones).
- Internal `_powerStack` (plant positions + remaining capacity).

### Output it produces

- `powerGridMap` (BlockMap, chunk size 1): marks every powered tile.
- `POWERBIT` set or cleared on each conductive tile in `GameMap`.
- Event: `NOT_ENOUGH_POWER` if capacity exhausted.

### Port recommendation: **Port directly**

Pure graph traversal; no rendering code. The one-cycle lag (power state from
previous cycle used during current scan) is intentional and must be preserved.

### Recommended TypeScript module

```
src/simulation/PowerGrid.ts
src/simulation/BlockMap.ts       (was blockMap.ts — already TypeScript)
```

---

## 8. ZoneGrowth — Residential / Commercial / Industrial

### What it does

Determines whether each zone tile grows, shrinks, or stays the same. Called by
the map scanner once per zone tile per scan. Growth is gated by:
- Road connectivity (via `TrafficRouter.makeTraffic`).
- A `zoneScore` combining demand valve, location bonus, and power penalty.
- A stochastic threshold against `getRandom16Signed()`.

Zone tiles are replaced with higher or lower variants from fixed tile ranges
(e.g. residential: 16 developed variants + `FREEZ` empty variant).

### Source files / key functions

| File | Role |
|---|---|
| `src/residential.js` | `residentialFound`, `growZone`, `degradeZone` |
| `src/commercial.js` | `commercialFound`, `growZone`, `degradeZone` |
| `src/industrial.js` | `industrialFound`, `growZone`, `degradeZone` |
| `src/zoneUtils.js` | `getLandPollutionValue`, `getZoneSize`, `getZonePowerBonus` |
| `src/random.ts` | `getRandom16Signed`, `getRandom` |

### Data it needs

- `blockMaps`: `landValueMap`, `pollutionDensityMap`, `crimeRateMap`,
  `cityCentreDistScoreMap`, `populationDensityMap`.
- Demand valves: `resValve`, `comValve`, `indValve`.
- Power state: `POWERBIT` from `GameMap`.
- Traffic result from `TrafficRouter.makeTraffic`.

### Output it produces

- Mutations to zone tiles in `GameMap` (type index changes via `setTileValue`).
- `worldEffects` queue (deferred tile writes applied after scan completes).
- Census increments: `resZonePop`, `comZonePop`, `indZonePop`, and population
  sums.

### Port recommendation: **Port directly**

The growth logic is pure arithmetic. The main porting work is ensuring all
referenced block maps are available. The `worldEffects` deferred-write pattern
must be preserved to avoid modifying tiles while the scanner is reading them.

### Recommended TypeScript module

```
src/simulation/ResidentialZone.ts
src/simulation/CommercialZone.ts
src/simulation/IndustrialZone.ts
src/simulation/WorldEffects.ts   (was worldEffects.js)
```

---

## 9. TrafficRouter — Road Connectivity

### What it does

Answers "can this zone reach a destination?" by scanning the perimeter for a
driveable tile, then doing a random walk of up to 30 steps along road tiles. If
a satisfying tile is reached, the path is stamped onto the traffic density map
(+50 per tile, capped at 240).

### Source files / key functions

| File | Role |
|---|---|
| `src/traffic.js` | `Traffic`, `makeTraffic(x, y, blockMaps, destFn)`, `findPerimeterRoad`, `tryDrive`, `addToTrafficDensityMap` |
| `src/tileUtils.js` | `isDriveable`, `isRoad` predicates |

### Data it needs

- `GameMap` tile grid (to walk road tiles).
- `blockMaps.trafficDensityMap` (to write density values).
- `destFn`: a predicate passed by each zone type (e.g. "is this tile adjacent
  to a commercial zone?").

### Output it produces

- Return value `ROUTE_FOUND (1)` or `NO_ROUTE_FOUND (0)` used by zone growth.
- Mutations to `trafficDensityMap` (accumulated traffic density per road tile).

### Port recommendation: **Port directly**

Pure graph traversal. The random walk uses `getRandom` from `random.ts`.
The 30-step limit (`MAX_TRAFFIC_DISTANCE`) must stay unchanged to preserve
gameplay balance.

### Recommended TypeScript module

```
src/simulation/TrafficRouter.ts
```

---

## 10. TerrainAnalyser — Pollution, Land Value & Density

### What it does

Three separate scans run in phases 12–14:

1. **Pollution / Land Value** (phase 12, `pollutionTerrainLandValueScan`):
   Iterates 2×2 blocks, accumulates raw pollution by tile type, smooths twice,
   then computes land value as a function of distance-to-centre, terrain,
   pollution, and crime. Updates `pollutionDensityMap`, `landValueMap`,
   `terrainDensityMap`.

2. **Population Density** (phase 14, `populationDensityScan`):
   Builds a raw density map from zone populations, applies three smoothing
   passes. Recomputes city centre centroid, updating `cityCentreDistScoreMap`.

3. **Fire Analysis** (phase 15, `fireAnalysis`):
   Smooths the fire station accumulation map three times to produce
   `fireStationEffectMap` (coverage radius).

### Source files / key functions

| File | Role |
|---|---|
| `src/blockMapUtils.js` | `pollutionTerrainLandValueScan`, `populationDensityScan`, `fireAnalysis`, `crimeScan` |
| `src/blockMap.ts` | `BlockMap`, `smooth`, `SMOOTH_ALL_THEN_CLAMP` |

### Data it needs

- `GameMap` tile grid.
- `census`: `landValueAverage`, `pollutionAverage`, `crimeAverage` (written back).
- `trafficDensityMap` (roads add pollution).
- `policeStationMap` and `fireStationMap` (accumulated by emergency services).

### Output it produces

- `pollutionDensityMap`, `landValueMap`, `terrainDensityMap` (BlockMaps).
- `populationDensityMap`, `cityCentreDistScoreMap` (BlockMaps).
- `fireStationEffectMap` (BlockMap, used by overlay and disaster logic).
- `map.pollutionMaxX/Y` (spawn point for monster disaster).
- Updated `census` averages.

### Port recommendation: **Port directly**

No rendering code. The smoothing algorithm (`SMOOTH_ALL_THEN_CLAMP`) is in
`BlockMap` and must be ported faithfully. The city-centre centroid recalculation
is an O(tiles) pass that sets `GameMap.cityCentreX/Y`.

### Recommended TypeScript module

```
src/simulation/TerrainAnalyser.ts
```

---

## 11. CrimeModel — Crime Score

### What it does

Three smoothing passes spread the raw `policeStationMap` values to produce a
`policeStationEffectMap`. Then for each developed block:

```
crimeScore = 128 − landValue + populationDensity − policeStationEffect
             clamped 0–250
```

Updates `crimeRateMap` and `census.crimeAverage`.

### Source files / key functions

| File | Role |
|---|---|
| `src/blockMapUtils.js` | `crimeScan(blockMaps, census)` |

### Data it needs

- `blockMaps.policeStationMap` (accumulated during map scan).
- `blockMaps.landValueMap` (from TerrainAnalyser).
- `blockMaps.populationDensityMap` (from TerrainAnalyser).

### Output it produces

- `blockMaps.crimeRateMap` (BlockMap).
- `census.crimeAverage` (scalar).

### Port recommendation: **Port directly**

Entirely arithmetic. Lives in `blockMapUtils.js` alongside the terrain scan
functions. In OpenPublica, extract it into `TerrainAnalyser.ts` or give it its
own small module.

### Recommended TypeScript module

```
src/simulation/CrimeModel.ts
```

*(or merge into `TerrainAnalyser.ts` since it is called in the same phase group)*

---

## 12. EmergencyServices — Police & Fire

### What it does

A single factory function `handleService()` generates the map-scan action for
both `POLICESTATION` and `FIRESTATION`. Each station:
- Increments the census counter.
- Looks up the budget effect value (`budget.fireEffect` or `budget.policeEffect`),
  reduced by half if the station is unpowered or road-disconnected.
- Writes the effect into the appropriate block map (`fireStationMap` or
  `policeStationMap`).

### Source files / key functions

| File | Role |
|---|---|
| `src/emergencyServices.js` | `handleService(type, census, budget, blockMaps)` |

### Data it needs

- `budget.fireEffect` / `budget.policeEffect` (0–1000).
- Power bit and road connectivity of the station tile.
- `blockMaps.fireStationMap` / `policeStationMap` (written into).

### Output it produces

- Incremented `census.firePop` / `census.policePop`.
- Values in `fireStationMap` / `policeStationMap` consumed by `TerrainAnalyser`
  and `CrimeModel`.

### Port recommendation: **Port directly**

Simple accumulation logic. The factory pattern can be replaced with two typed
methods on a class.

### Recommended TypeScript module

```
src/simulation/EmergencyServices.ts
```

---

## 13. CityEvaluator — Score & Classification

### What it does

Runs every 48 ticks (phase 9). Computes:
- `cityAssessedValue`: dollar value of all infrastructure tiles.
- `cityPop`: population scaled ×20.
- `cityClass`: one of VILLAGE / TOWN / CITY / CAPITAL / METROPOLIS /
  MEGALOPOLIS based on `cityPop`.
- `problemVotes[]`: top 4 citizen complaints drawn from 7 possible problems
  (crime, pollution, housing cost, taxes, traffic, unemployment, fires).
- `cityScore`: 0–1000 health metric; smoothed average over time.
- `cityYes`: mayoral approval 0–100.

### Source files / key functions

| File | Role |
|---|---|
| `src/evaluation.js` | `Evaluation`, `cityEvaluation`, `getScore`, `getAssessedValue`, `getCityClass`, `doProblems`, `voteProblems`, `doVotes`, `save`, `load` |

### Data it needs

- `census`: crime / pollution / land value averages, population counts.
- `budget`: `cityTax`, spending effects.
- `valves`: `resValve`, `comValve`, `indValve` (demand cap penalties).
- `gameMap`: counts of fire tiles.
- Previous `cityScore` (smoothed).

### Output it produces

- `cityClass` (string), `cityScore` (number), `cityYes`, `problemVotes[]`.
- `cityAssessedValue`, `cityPop`.
- These feed the UI scorecard and are persisted in the save file.

### Port recommendation: **Port directly**

Pure arithmetic and table lookups. The smoothing formula for `cityScore`
(`(prev + new) / 2`) must be preserved.

### Recommended TypeScript module

```
src/simulation/CityEvaluator.ts
```

---

## 14. BudgetManager — Tax & Spending

### What it does

Runs every 48 ticks (phase 9). Computes:
1. Full-funding costs for roads, fire stations, and police stations.
2. Tax revenue: `floor(totalPop × landValueAverage / 120) × cityTax × FLevels[level]`.
3. Allocates funds in priority order: roads > fire > police.
4. Converts spending ratios into effect integers (`roadEffect` 0-32,
   `policeEffect` 0-1000, `fireEffect` 0-1000).

### Source files / key functions

| File | Role |
|---|---|
| `src/budget.js` | `Budget`, `collectTax`, `doBudgetNow`, `updateFundEffects`, `save`, `load` |

### Data it needs

- `census`: `roadTotal`, `railTotal`, `firePop`, `policePop`, `totalPop`,
  `landValueAverage`.
- `gameLevel`: determines `FLevels` multiplier.
- Player settings: `cityTax`, `autoBudget`, spending percentages.

### Output it produces

- `totalFunds` (mutated each tax period).
- `roadEffect` (0–32): below ~15 triggers road decay.
- `policeEffect` (0–1000): modulates crime suppression.
- `fireEffect` (0–1000): modulates fire coverage.

### Port recommendation: **Port directly**

Pure arithmetic. The auto-budget allocation loop in `doBudgetNow` must be
preserved exactly. OpenPublica may want to expose budget sliders in the UI,
which should map directly to `roadPercent`, `firePercent`, `policePercent`.

### Recommended TypeScript module

```
src/simulation/BudgetManager.ts
```

---

## 15. DisasterManager — Random Events

### What it does

Called at phase 15. When `disastersEnabled` is true, there is a
`1 / DisChance[gameLevel]` probability each tick of triggering one of:
fire, flood, air crash, tornado, or earthquake. Nuclear meltdown is triggered
separately inside `PowerManager` during the map scan.

### Source files / key functions

| File | Role |
|---|---|
| `src/disasterManager.js` | `DisasterManager`, `doDisasters`, `setFire`, `makeFlood`, `makeTornado`, `makeEarthquake` |
| `src/spriteManager.js` | Receives requests to spawn disaster sprites |

### Data it needs

- `disastersEnabled` flag.
- `gameLevel` (determines probability thresholds).
- `GameMap` (to find and set fire/flood tiles).
- `spriteManager` (to spawn tornado, monster, plane-crash sprites).
- `pollutionMaxX/Y` (monster spawn point).

### Output it produces

- Tile mutations (fire tiles placed, buildings destroyed).
- Sprites spawned via `SpriteManager`.
- Event messages forwarded to the UI.

### Port recommendation: **Port directly, disable for Phase 1**

The disaster logic is self-contained. For Phase 1, set `disastersEnabled =
false` by default and defer full disaster implementation to a later phase.

### Recommended TypeScript module

```
src/simulation/DisasterManager.ts
```

---

## 16. SaveSystem — Persistence

### What it does

Serialises the full game state to a single flat JSON object and writes it to
`localStorage` under key `"micropolisJSGame"`. Reads it back on load with
version migration support (currently versions 1–3).

The tile array is stored as `Array<{value: number}>` where each `value` is the
raw packed 16-bit tile integer.

### Source files / key functions

| File | Role |
|---|---|
| `src/storage.js` | `Storage`, `saveGame`, `getSavedGame`, `transitionOldSave` |
| `src/game.js` | `Game.prototype.save` / `.load` (top-level orchestration) |
| `src/simulation.js` | `Simulation.prototype.save` / `.load` |
| `src/gameMap.js` | `GameMap.prototype.save` / `.load` |
| `src/budget.js` | `Budget.prototype.save` / `.load` |
| `src/census.js` | `Census.prototype.save` / `.load` |
| `src/evaluation.js` | `Evaluation.prototype.save` / `.load` |
| `src/valves.js` | `Valves.prototype.save` / `.load` |
| `src/baseTool.js` | `BaseTool.save` / `.load` (`autoBulldoze`) |

### Data it needs / produces

See `docs/SAVE_FORMAT.md` for the complete key-by-key schema. The critical
runtime-state that is **not** saved (and must be recomputed on load):
block maps, power grid, sprite positions, disaster cooldowns.

### Port recommendation: **Rewrite for OpenPublica storage backend**

The core serialisation logic (each subsystem has `save(obj)` / `load(obj)`
methods that mutate/read a shared flat object) is a good pattern to preserve.
However:
- Replace `localStorage` with whatever persistence backend OpenPublica uses
  (IndexedDB, server-side, or cloud save).
- Add an OpenPublica-specific `version` field alongside the MicropolisJS
  `version` field to allow independent migration paths.
- The tile encoding (16-bit packed integer) must stay identical if
  MicropolisJS save compatibility is required.

### Recommended TypeScript module

```
src/persistence/SaveSystem.ts
src/persistence/SaveSchema.ts    (typed interfaces for the save object)
src/persistence/StorageAdapter.ts  (abstract backend; swap localStorage ↔ cloud)
```

---

## 17. TileRenderer — Visual Output

### What it does

Reads the tile grid and paints each tile onto an HTML `<canvas>` using a
496 × 496 px sprite sheet (`images/tiles.png`) sliced into 961 individual
16 × 16 px images by `src/tileSet.js`. A snow variant (`tilessnow.png`)
is swapped in by `Game.onDateChange()` in October and reverted in January.

### Source files / key functions

| File | Role |
|---|---|
| `src/gameCanvas.js` | `GameCanvas`; `draw`, `renderTiles`, scroll, mouse-box overlay |
| `src/tileSet.js` | `TileSet`; loads and slices `tiles.png` into 961 frames |
| `src/tileSetURI.ts` | Base64 fallback for `tiles.png` (cross-origin fallback) |
| `src/tileSetSnowURI.ts` | Base64 fallback for `tilessnow.png` |
| `src/animationManager.js` | Advances animated tile frames each tick |

### Data it needs

- `GameMap` tile grid (type index drives which tile image to draw).
- `ANIMBIT` flag (to select animated frame offset).
- Scroll offset.
- `spriteSheet` for animated actors.

### Output it produces

- Pixels on a 2-D `<canvas>`.

### Port recommendation: **Ignore / replace entirely**

This is the one system to replace, not port. In OpenPublica, a Babylon.js
adapter reads the tile grid and renders each tile as a textured mesh or instanced
geometry on the 3-D scene. The tile-type-to-texture mapping must replicate the
sprite sheet index exactly so the visual result matches.

Keep the tile-type index as the common language between simulation and renderer.

### Recommended TypeScript module

```
src/renderer/BabylonTileRenderer.ts   (OpenPublica-specific; new code)
src/renderer/TileTextureAtlas.ts      (maps tile index → Babylon.js texture UV)
```

---

## 18. SpriteManager — Animated Actors

### What it does

Manages a list of live sprite objects (trains, helicopters, airplanes, boats,
monsters, tornadoes, explosions). Each sprite has position, speed, direction,
and frame state. `SpriteManager.moveObjects()` advances every sprite each tick.
Sprites interact with the tile grid (trains follow rails, boats follow water,
the copter follows traffic density).

### Source files / key functions

| File | Role |
|---|---|
| `src/spriteManager.js` | `SpriteManager`, `moveObjects`, `getSprite`, `addSprite` |
| `src/baseSprite.js` | `BaseSprite` base class |
| `src/trainSprite.js` | Train path-following |
| `src/copterSprite.js` | Traffic-density-seeking helicopter |
| `src/airplaneSprite.js` | Airplane (disaster source) |
| `src/boatSprite.js` | Boat on water |
| `src/monsterSprite.js` | Monster (pollution-origin disaster) |
| `src/tornadoSprite.js` | Tornado |
| `src/explosionSprite.js` | Explosion |
| `src/spriteConstants.ts` | `SPRITE_TRAIN=1` … `SPRITE_EXPLOSION=7` |

### Data it needs

- `GameMap` tile grid (for rail/road/water following, collision).
- `blockMaps.trafficDensityMap` (copter seeks high traffic).
- `pollutionMaxX/Y` (monster origin).

### Output it produces

- Sprite position/frame state (consumed by renderer).
- Tile mutations: explosions and disaster sprites can modify tile values.
- Sound events (currently dead stubs in `messages.ts`).

### Port recommendation: **Port logic, replace rendering**

Port the movement and collision logic (position tracking, path-following
algorithms) into TypeScript classes. Replace the 2-D pixel rendering with
Babylon.js animated meshes or sprite billboards. For Phase 1, disable monsters,
tornadoes, and disaster sprites; retain train and helicopter for visual
ambiance.

### Recommended TypeScript module

```
src/simulation/SpriteManager.ts
src/simulation/sprites/TrainSprite.ts
src/simulation/sprites/CopterSprite.ts
src/simulation/sprites/BaseSprite.ts
src/renderer/BabylonSpriteRenderer.ts   (rendering adapter)
```

---

## 19. Asset Summary & Licensing

The following MicropolisJS assets are relevant to OpenPublica. Full details in
`docs/ASSET_INVENTORY.md`.

| Asset | License | Action for OpenPublica |
|---|---|---|
| `images/tiles.png` (961 tiles, 16×16 each) | GPL v3 + EA terms | Port as-is or replace with new art. Same tile-type index must be preserved. |
| `images/tilessnow.png` | GPL v3 + EA terms | Optional; port if seasonal variation is wanted. |
| `images/sprites.png` + `sprites/obj1-7` frames | GPL v3 + EA terms | Port or replace with 3-D models for Babylon.js. |
| `css/chunk.woff` ("Chunk" font) | SIL OFL 1.1 | May be bundled with OpenPublica. Cannot be sold standalone. |
| Open Sans (remote Google Fonts) | Apache 2.0 | Use or choose another font; note offline packaging requirement. |
| Audio files | None in repo | Fresh audio must be sourced and licensed separately. |
| "MICROPOLIS" name | Non-commercial trademark license | Do not use "Micropolis" in OpenPublica's product name without a separate license review. |
| "SimCity" name | EA trademark — no rights granted | Never use this name. |

**Action required before shipping OpenPublica:**
1. Confirm whether the GPL v3 + EA additional terms permit inclusion in
   OpenPublica's distribution model.
2. If using MicropolisJS tile/sprite graphics, the GPL copyleft requires
   OpenPublica source to also be GPL v3.
3. New art assets would eliminate this licensing dependency entirely.

---

## 20. Phase 1 Recommended Build Order

The following sequence minimises dependency cycles and allows incremental
testing at each step.

| Step | Module | Depends on |
|---|---|---|
| 1 | `TileFlags.ts`, `TileValues.ts` | (none) |
| 2 | `BlockMap.ts` | (none) |
| 3 | `TileUtils.ts`, `ZoneUtils.ts` | TileFlags, TileValues |
| 4 | `GameMap.ts` | TileFlags, TileValues, TileUtils |
| 5 | `SimData.ts` (typed data-bus interface) | All subsystem types |
| 6 | `CityCensus.ts` | (none) |
| 7 | `DemandValves.ts` | CityCensus |
| 8 | `BudgetManager.ts` | CityCensus |
| 9 | `PowerGrid.ts` | GameMap, BlockMap |
| 10 | `TrafficRouter.ts` | GameMap, BlockMap |
| 11 | `EmergencyServices.ts` | GameMap, BudgetManager, BlockMap |
| 12 | `TerrainAnalyser.ts` + `CrimeModel.ts` | GameMap, BlockMap, CityCensus |
| 13 | `ResidentialZone.ts`, `CommercialZone.ts`, `IndustrialZone.ts` | GameMap, TrafficRouter, DemandValves, BlockMap |
| 14 | `MapScanner.ts` | GameMap, all zone + service handlers |
| 15 | `CityEvaluator.ts` | CityCensus, BudgetManager, DemandValves |
| 16 | `SimulationClock.ts` | All of the above |
| 17 | `SaveSystem.ts` | All of the above |
| 18 | `DisasterManager.ts` | GameMap, SpriteManager (disable for Phase 1) |
| 19 | `BabylonTileRenderer.ts` | GameMap, Babylon.js |
| 20 | `SpriteManager.ts` + sprite classes | GameMap, Babylon.js |

---

*This guide was created from `docs/SIMULATION_MAP.md`, `docs/SAVE_FORMAT.md`,
and `docs/ASSET_INVENTORY.md`. Cross-check those documents when implementation
details differ from this summary.*
