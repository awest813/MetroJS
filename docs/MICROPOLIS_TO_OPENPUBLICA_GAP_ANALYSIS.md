# Micropolis → OpenPublica: Gap Analysis

Compares the MicropolisJS simulation systems documented in `docs/SIMULATION_MAP.md`
against the OpenPublica TypeScript simulation found in `openpublica/src/sim/`.

**Sources compared**

| Source | Location |
|---|---|
| MicropolisJS reference | `docs/SIMULATION_MAP.md` |
| OpenPublica sim layer | `openpublica/src/sim/*.ts` |

---

## Section 1 — Systems Already Present in OpenPublica

These Micropolis systems have a working equivalent in OpenPublica.

| Micropolis system | Micropolis file / function | OpenPublica equivalent | Notes |
|---|---|---|---|
| Main simulation loop | `simulation.js` → `simTick()`, `_simFrame()`, `simulate()` | `CitySim.ts` → `CitySim.tick()` + `SimulationClock.ts` | OpenPublica drives the loop from `scene.onBeforeRenderObservable` in `App.ts`; monthly phases replaced by a seconds-accumulator in `ZoneGrowthSystem._secondsAccumulator`. |
| Demand valves (Res/Com/Ind) | `valves.js` → `Valves.setValves()` | `ZoneGrowthSystem.ts` → `_updateDemand()` | OpenPublica uses `stats.residentialDemand / commercialDemand / industrialDemand` [0–100] updated monthly. Simpler linear model; no external market table or cap flags. |
| Zone growth — Residential | `residential.js` → `residentialFound()` | `ZoneGrowthSystem.ts` → `_growBuildings()` + `buildings.json` | OpenPublica: land-value-biased probability instead of tile-layout variants. Buildings are definitions (`BuildingDef`), not tile sprites. |
| Zone growth — Commercial | `commercial.js` → `commercialFound()` | Same as above | City-centre distance score absent in OpenPublica; walkability + transit bonuses serve a similar role. |
| Zone growth — Industrial | `industrial.js` → `industrialFound()` | Same as above | OpenPublica industrial convergence toward demand=20 replaces Micropolis external market table. |
| Power grid | `powerManager.js` → `doPowerScan()`, `setTilePower()` | `PowerSystem.ts` → `PowerSystem.tick()` | OpenPublica uses Euclidean radius from each power plant instead of BFS flood-fill. `tile.powered` is equivalent to Micropolis `POWERBIT`. |
| Budget & tax | `budget.js` → `collectTax()`, `updateFundEffects()` | `EconomySystem.ts` → `EconomySystem.tick()` | OpenPublica splits income by zone type (Res/Com/Ind tax rates). Expenses cover roads, trolley avenues, and service buildings. No road-effect / fire-effect multipliers yet. |
| Land value | `blockMapUtils.js` → `pollutionTerrainLandValueScan()` | `LandValueSystem.ts` → `LandValueSystem.tick()` | OpenPublica: park bonus, industrial penalty, road bonus, walkability bonus, transit bonus, pollution & traffic penalties. Missing: distance-to-centre base and terrain bonus. |
| Traffic (density) | `traffic.js` → `makeTraffic()`, `addToTrafficDensityMap()` | `TrafficPressureSystem.ts` → `TrafficPressureSystem.tick()` | OpenPublica: radial spread model, no random-walk routing. `tile.trafficPressure` [0–20] and `tile.noise` [0–100] replace Micropolis traffic density map. |
| City census (population / jobs) | `census.js` → `take10Census()` | `ZoneGrowthSystem.ts` → `_recalcStats()` | OpenPublica recalculates from building registry each month. No 10-cycle or 120-cycle history arrays yet. |
| Walkability | *(not in Micropolis — OpenPublica original)* | `WalkabilitySystem.ts` | No Micropolis equivalent. |
| Street transit (trolley) | *(not in Micropolis — OpenPublica original)* | `TransitSystem.ts` | No Micropolis equivalent. |

---

## Section 2 — Systems Missing from OpenPublica

These Micropolis systems have no meaningful equivalent yet.  Listed in
**priority order** (see Section 5 for the full prioritised roadmap).

### 2.1 Crime System *(High priority)*

**Micropolis:** `blockMapUtils.js` → `crimeScan()`

```
crimeScore = 128 − landValue + populationDensity − policeStationEffect   (clamped 0-250)
```

Requires `policeStationEffectMap` (built by smoothing the police station
coverage map produced during the map scan in `emergencyServices.js`).
`census.crimeAverage` feeds city score and city evaluation.

**OpenPublica gap:** `CityTile` has a `pollution` field but no `crime` field.
`CityStats` has no `crimeAverage`. No police station building definition exists
in `buildings.json`. No `CrimeSystem.ts` file.

---

### 2.2 Fire Station Coverage *(High priority)*

**Micropolis:** `blockMapUtils.js` → `fireAnalysis()` +
`emergencyServices.js` → `fireStationFound()`

Fire stations accumulate `budget.fireEffect` (0-1000) into
`blockMaps.fireStationMap`; three smoothing passes yield
`fireStationEffectMap`. Underpowered or road-disconnected stations contribute
at half strength.

**OpenPublica gap:** `BuildingDef.isService` exists and `small_power_plant`
and `small_park` use it, but there is no fire station building in
`buildings.json` and no `FireCoverageSystem.ts`.  `tile.powered` is available
but road-connectivity of service buildings is not checked.

---

### 2.3 City Evaluation & Score *(High priority)*

**Micropolis:** `evaluation.js` → `cityEvaluation()`, `getScore()`

Produces `cityScore` (0-1000), `cityClass` (Village→Megalopolis), top-4
citizen complaints (`problemVotes[]`), and mayoral approval `cityYes`.
Inputs: crime, pollution, land value, tax rate, traffic, unemployment, fires.

**OpenPublica gap:** No `CityScore`, no `CityClass`, no problem vote system.
`CityStats` has `happiness` [0-100] which is a partial substitute, but there
is no formal evaluation pass, no population-milestone messages, and no
mayoral approval rating.

---

### 2.4 Population Density Map *(Medium priority)*

**Micropolis:** `blockMapUtils.js` → `populationDensityScan()`

Builds a smoothed `populationDensityMap` used by `crimeScan()` (crime is
higher in dense areas) and by commercial zone scoring (commercial prefers
city-centre proximity).

**OpenPublica gap:** Population is aggregated into a single `stats.population`
number; there is no per-tile or per-block density map.  This currently blocks
implementing a crime system that is sensitive to density.

---

### 2.5 City Centre Score *(Medium priority)*

**Micropolis:** `populationDensityScan()` computes the centroid of all zones
→ `cityCentreDistScoreMap`, which feeds commercial zone scoring
(`commercialFound()` applies a ±64 bonus).

**OpenPublica gap:** `ZoneGrowthSystem._growBuildings()` does not apply any
city-centre distance bonus to commercial tiles.  Commercial demand is boosted
by walkability and transit instead, which is reasonable but produces an
even distribution rather than a downtown cluster.

---

### 2.6 Pollution Spread *(Medium priority)*

**Micropolis:** `blockMapUtils.js` → `pollutionTerrainLandValueScan()`
classifies pollution by tile type (roads 0-75, fire 90, radiation 255,
industrial 50, coal plants 100), smooths twice, updates `pollutionDensityMap`
and `census.pollutionAverage`.

**OpenPublica gap:** `CityTile.pollution` field exists and is read by
`LandValueSystem` (penalty) but is never written by any system.
`TrafficPressureSystem` writes `tile.noise` but not `tile.pollution`.
No `PollutionSystem.ts` exists.

---

### 2.7 Census History Graphs *(Low priority)*

**Micropolis:** `census.js` → `take10Census()` / `take120Census()` maintain
10-entry and 120-entry ring buffers for `res`, `com`, `ind`, `crime`, `money`,
`pollution`.  Displayed as an in-game graphs panel.

**OpenPublica gap:** `SimulationClock` tracks `monthsPassed` but
`CityStats` has no history arrays.  There is no graph UI component.

---

### 2.8 Infrastructure Demand Caps *(Low priority)*

**Micropolis:** `simulation.js` → `_sendMessages()` sets `resCap`, `comCap`,
`indCap` when stadium / seaport / airport buildings are absent, zeroing out
demand valves and blocking growth past certain population thresholds.

**OpenPublica gap:** `ZoneGrowthSystem._updateDemand()` has no cap mechanism.
Demand is only modulated by tax rates, job/worker balance, walkability, and
transit.  There is no stadium, seaport, or airport building type.

---

### 2.9 Road Decay (Underfunded Roads) *(Low priority)*

**Micropolis:** `road.js` — when `budget.roadEffect` drops below 15/16 of max,
road tiles have a small probability of degrading each map-scan pass.

**OpenPublica gap:** `EconomySystem` deducts maintenance costs but roads
never physically degrade.  `RoadType` and `ZoneGrowthSystem` have no decay
logic.

---

### 2.10 Message / Advisory System *(Low priority)*

**Micropolis:** `simulation.js` → `_sendMessages()` dispatches notifications
for milestone events (population thresholds, disaster warnings, service
underfunding) to the front-end.

**OpenPublica gap:** `CitySim` exposes callbacks (`onGrowth`, `onPowerChanged`,
etc.) but there is no structured city-wide message/advisory system.  Major
events (bankruptcy warning, high crime) are not surfaced as player notifications.

---

## Section 3 — Systems That Should Be Rewritten (Not Ported)

These Micropolis systems contain logic that is too coupled to the tile-sprite
model or the 1980s-era SimCity design to be ported cleanly. They should be
re-designed from scratch for OpenPublica.

| Micropolis system | Why rewrite instead of port |
|---|---|
| **Traffic routing** (`traffic.js` → `makeTraffic()`) | Relies on a random walk (`tryDrive`, 30-step limit) through a tile-sprite road network.  OpenPublica has no tile sprite types (roads are `RoadType` enum values) and no per-zone road-connectivity check.  `TrafficPressureSystem` already replaces this with a radial spread model. Any extension should stay within that model (e.g. road-graph BFS) rather than importing the random-walk approach. |
| **Zone tile layout / variants** (`residential.js`, `commercial.js`, `industrial.js` – `lpValue`, sprite tile arrays) | Micropolis stores 16 residential, 20 commercial, and 8 industrial tile-layout variants keyed by `(population, landValue)`.  OpenPublica uses `BuildingDef` JSON objects and Babylon mesh shapes. Tile variant logic is irrelevant. |
| **Power grid flood-fill** (`powerManager.js` → `doPowerScan()`) | BFS from a power-plant tile through the tile graph requires power-conductive tile constants (`POWERBIT`, wire tiles).  OpenPublica's `PowerSystem` uses Euclidean radius, which is appropriate for the current model.  A proper grid simulation (if ever needed) should be designed around `CityTile.roadType`/`buildingId` rather than the Micropolis tile constants. |
| **Map scan dispatch** (`mapScanner.js` → `MapScanner`, `addAction()`) | MicropolisJS centralises all per-tile logic into a single 8-column-per-phase scan.  OpenPublica separates concerns into independent system classes (`PowerSystem`, `LandValueSystem`, etc.), each iterating the map in `tick()`.  This architecture is cleaner and should be continued; the MapScanner pattern should not be imported. |
| **Budget effect multipliers** (`budget.js` → `updateFundEffects()`, `roadEffect`, `fireEffect`, `policeEffect`) | These multiply service quality by spending ratio.  OpenPublica's `EconomySystem` deducts flat maintenance costs; service effectiveness should instead be modelled as on/off (funded vs. not) or via a simple quality scalar on the relevant system (`FireCoverageSystem`, future `CrimeSystem`). |
| **Sprite / disaster system** (`disasterManager.js`, `spriteManager.js`) | Disasters and animated sprites require Babylon scene management and game state not yet in scope for OpenPublica's sim layer.  If disasters are ever added, they should be designed as pure-sim events (tile mutations) with renderer-side effects, not ported from the sprite-based Micropolis model. |

---

## Section 4 — Systems That Are Obsolete for OpenPublica's Modern Design

These Micropolis systems are superseded by OpenPublica's architecture choices and
should not be implemented.

| Micropolis system | Reason obsolete |
|---|---|
| **Tile constant / sprite table** (thousands of named tile constants in `tileConstants.js`) | OpenPublica uses `ZoneType`, `RoadType`, and `TerrainType` enums plus `BuildingDef` JSON.  There is no sprite sheet. |
| **`simData` object bus** (`simulation.js` → `_constructSimData()`) | OpenPublica systems receive their dependencies via constructor injection (`ZoneGrowthSystem` constructor) or direct method parameters.  The single-object bus is not needed. |
| **16-phase simulation cycle** | Replaced by independent monthly `tick()` calls chained inside `ZoneGrowthSystem.tick()`.  The ordering is explicit (LandValue → Demand → Grow → Power → Stats → Economy → Traffic → Walkability → Transit) and does not require phase numbers. |
| **BlockMap chunk resolution** (`BlockMap`, chunk size 2 or 8) | MicropolisJS down-samples data to coarser grids for performance.  OpenPublica operates on full per-tile resolution (`CityMap`, `CityTile`) and performance is adequate at 64×64. |
| **Game level (`gameLevel`)** (`valves.js`, `budget.js` — `FLevels`, `extMarketParamTable`) | Micropolis scales tax revenue and industrial demand by a 0/1/2 difficulty level.  OpenPublica makes all three tax rates player-adjustable (9% default) and models difficulty through map size and building costs instead. |
| **Nuclear power / coal plant tile types** | Micropolis distinguishes `NUCLEAR` and `COAL` plant tiles with separate capacity values (700 / 2000 units).  OpenPublica models this via `BuildingDef.powerRadius`, making plant types a data configuration concern, not a code-level distinction. |
| **Seaport / airport / stadium infrastructure caps** | These act as hidden population ceilings.  OpenPublica's design does not impose hidden caps; growth is bounded naturally by land, zoning, and finances. |
| **Sounds & SpriteManager** (`spriteManager.js`, sound event strings) | OpenPublica has no audio system in scope.  The MetroJS sound events in `src/messages.ts` are part of the legacy codebase, not OpenPublica. |

---

## Section 5 — Prioritised Implementation Roadmap

The following ranking balances player-visible impact, prerequisite dependencies,
and design fit with OpenPublica's existing architecture.

### Priority 1 — Implement Next (High Impact, Low Complexity)

| # | System | New file(s) | Key `CityTile` / `CityStats` fields needed | Depends on |
|---|---|---|---|---|
| 1 | **Pollution writer** | `PollutionSystem.ts` | `tile.pollution` (already exists, always 0) | TrafficPressureSystem (noise → pollution input) |
| 2 | **Fire station building + coverage** | `buildings.json` entry; `FireCoverageSystem.ts` | `tile.fireCoverage: number` (new), `stats.fireCoverage: number` (new) | PowerSystem (powered check), EconomySystem (service cost already covered) |
| 3 | **Police station building + crime** | `buildings.json` entry; `CrimeSystem.ts` | `tile.crime: number` (new), `stats.crimeAverage: number` (new) | FireCoverageSystem (pipeline ordering), PopulationDensitySystem |
| 4 | **City evaluation & score** | `CityEvaluation.ts` | `stats.cityScore: number`, `stats.cityClass: string`, `stats.problemVotes: string[]` (new) | CrimeSystem, FireCoverageSystem |

### Priority 2 — Medium Term (Medium Impact, Medium Complexity)

| # | System | New file(s) | Notes |
|---|---|---|---|
| 5 | **Population density map** | `PopulationDensitySystem.ts` | Needed by CrimeSystem; adds `tile.populationDensity: number`. |
| 6 | **City centre distance score** | Extend `ZoneGrowthSystem._updateDemand()` | No new file needed; compute centroid of buildings, add distance weight to commercial demand. |
| 7 | **Advisory / message system** | `AdvisorySystem.ts` | Emits structured events (bankruptcy, crime spike, underpowered zones) via a callback on `CitySim`. |

### Priority 3 — Deferred (Low Impact or High Complexity)

| # | System | Notes |
|---|---|---|
| 8 | **Census history arrays** | Add ring-buffer fields to `CityStats`; add a graph panel to `CityHUD`. |
| 9 | **Infrastructure demand caps** | Add stadium / seaport / airport building types; gate demand in `_updateDemand()`. |
| 10 | **Road decay** | Probabilistic degradation of road tiles when `EconomySystem` budget is insufficient. |
| 11 | **Disasters** | Pure-sim tile mutations (fire spread, flood); renderer-side particle effects out of scope for sim layer. |

---

## Appendix A — File-Level Mapping

| MicropolisJS file | Status | OpenPublica equivalent |
|---|---|---|
| `src/simulation.js` | ✅ Covered | `CitySim.ts`, `ZoneGrowthSystem.ts`, `SimulationClock.ts` |
| `src/valves.js` | ✅ Covered | `ZoneGrowthSystem.ts` → `_updateDemand()` |
| `src/census.js` | ⚠️ Partial | `ZoneGrowthSystem.ts` → `_recalcStats()` (no history arrays) |
| `src/mapScanner.js` | ✅ Replaced | Per-system `tick()` pattern (not ported by design) |
| `src/powerManager.js` | ✅ Covered | `PowerSystem.ts` (radius model instead of BFS) |
| `src/residential.js` | ✅ Covered | `ZoneGrowthSystem.ts` + `buildings.json` |
| `src/commercial.js` | ✅ Covered | `ZoneGrowthSystem.ts` + `buildings.json` |
| `src/industrial.js` | ✅ Covered | `ZoneGrowthSystem.ts` + `buildings.json` |
| `src/traffic.js` | ✅ Replaced | `TrafficPressureSystem.ts` (radial model, not random walk) |
| `src/blockMapUtils.js` — land value | ✅ Covered | `LandValueSystem.ts` |
| `src/blockMapUtils.js` — pollution | ❌ Missing | `PollutionSystem.ts` needed |
| `src/blockMapUtils.js` — crime | ❌ Missing | `CrimeSystem.ts` needed |
| `src/blockMapUtils.js` — density | ❌ Missing | `PopulationDensitySystem.ts` needed |
| `src/blockMapUtils.js` — fire | ❌ Missing | `FireCoverageSystem.ts` needed |
| `src/emergencyServices.js` | ❌ Missing | Fire/police station buildings + coverage systems needed |
| `src/evaluation.js` | ❌ Missing | `CityEvaluation.ts` needed |
| `src/budget.js` | ✅ Covered | `EconomySystem.ts` |
| `src/disasterManager.js` | 🚫 Out of scope | Deferred; pure-sim design needed before porting |

*Legend: ✅ Implemented equivalent · ⚠️ Partial · ❌ Not yet implemented · 🚫 Obsolete / out of scope*

---

*Generated for the OpenPublica sim layer. Do not port code based on this document alone —
consult the sim/render separation rule in `openpublica/src/sim/GameMap.ts` and the porting
guide in `docs/OPENPUBLICA_PORTING_GUIDE.md` before writing any new system.*
