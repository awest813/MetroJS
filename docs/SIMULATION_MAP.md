# Simulation Map — MicropolisJS

A navigational guide to the major simulation systems for future porting or
refactoring work. Each section identifies the relevant source file(s), the
key entry-point functions, and how the system connects to others.

---

## Quick Reference

| System | File | Key function(s) |
|---|---|---|
| Main loop | `src/simulation.js` | `simTick()`, `_simFrame()`, `simulate()` |
| Demand valves | `src/valves.js` | `Valves.setValves()` |
| City census | `src/census.js` | `take10Census()`, `take120Census()`, `clearCensus()` |
| Map scanner | `src/mapScanner.js` | `MapScanner.mapScan()`, `addAction()` |
| Power grid | `src/powerManager.js` | `doPowerScan()`, `setTilePower()` |
| Residential growth | `src/residential.js` | `residentialFound()` (internal) |
| Commercial growth | `src/commercial.js` | `commercialFound()` (internal) |
| Industrial growth | `src/industrial.js` | `industrialFound()` (internal) |
| Traffic routing | `src/traffic.js` | `Traffic.makeTraffic()` |
| Pollution & land value | `src/blockMapUtils.js` | `pollutionTerrainLandValueScan()` |
| Crime | `src/blockMapUtils.js` | `crimeScan()` |
| Population density | `src/blockMapUtils.js` | `populationDensityScan()` |
| Fire coverage | `src/blockMapUtils.js` | `fireAnalysis()` |
| Emergency services | `src/emergencyServices.js` | `handleService()` (fire/police) |
| City evaluation | `src/evaluation.js` | `cityEvaluation()`, `getScore()` |
| Budget & tax | `src/budget.js` | `collectTax()`, `updateFundEffects()` |
| Disasters | `src/disasterManager.js` | `doDisasters()` |

---

## 1. Main Simulation Loop

**File:** `src/simulation.js`

`Simulation` is the top-level coordinator. The browser calls
`Simulation.prototype.simTick()` on every game-clock tick. `simTick` calls
`_simFrame()`, which rate-limits execution against real wall-clock time
(thresholds: 100 ms slow, 50 ms medium, 10 ms fast). When a frame is due,
`_simulate()` / `simulate()` runs one phase of the 16-phase cycle.

### The 16-Phase Cycle (`simulate()` in `simulation.js`)

```
Phase 0    Advance clock; recalculate demand valves; clear census.
Phase 1-8  Map scan – 1/8 of columns per phase (zones, roads, power…).
Phase 9    Census snapshots (10-tick, 120-tick); tax + city evaluation.
Phase 10   Decay growth-rate & traffic maps; send advisory messages.
Phase 11   Power-grid flood-fill scan.
Phase 12   Pollution / terrain / land-value scan.
Phase 13   Crime scan.
Phase 14   Population density scan; city-centre recalculation.
Phase 15   Fire-coverage analysis; disaster trigger.
```

### Data bus: `simData`

Every subsystem receives a `simData` object assembled in
`_constructSimData()`. It is a plain object containing references to:
`blockMaps`, `budget`, `census`, `cityTime`, `disasterManager`,
`gameLevel`, `repairManager`, `powerManager`, `simulator`,
`spriteManager`, `trafficManager`, `valves`.

---

## 2. Demand Valves

**File:** `src/valves.js`  
**Class:** `Valves`  
**Called from:** simulation.js phase 0, every other simCycle

`Valves.setValves(gameLevel, census, budget)` computes three signed integers:

| Valve | Range | Controls |
|---|---|---|
| `resValve` | −2000 … +2000 | Residential zone growth/shrink pressure |
| `comValve` | −1500 … +1500 | Commercial zone growth/shrink pressure |
| `indValve` | −1500 … +1500 | Industrial zone growth/shrink pressure |

**Algorithm (simplified):**
1. Normalise residential population: `normalizedResPop = resPop / 8`.
2. Employment ratio = `(comPop + indPop) / normalizedResPop`.
3. Project new population from employment, migration, and birth rate.
4. Project commercial need from internal market size × labour availability.
5. Project industrial need × an external market factor `extMarketParamTable[gameLevel]`.
6. Convert each projection to a ratio, scale by 600, apply `taxTable[tax + level]`.
7. Accumulate delta into each valve (clamped to range).
8. Hard-zero any valve whose cap flag (`resCap`, `comCap`, `indCap`) is set.

Cap flags are set by `Simulation._sendMessages()` when major infrastructure
(stadium → resCap, seaport → indCap, airport → comCap) is missing.

---

## 3. City Census

**File:** `src/census.js`  
**Class:** `Census`

Accumulates raw counts of every tile type found during the map scan:
- Zone counts: `resZonePop`, `comZonePop`, `indZonePop`, `firePop`, etc.
- Population sums: `resPop`, `comPop`, `indPop`.
- Infrastructure counts: `roadTotal`, `railTotal`, `coalPowerPop`, etc.
- Averages set externally by blockMapUtils: `landValueAverage`,
  `pollutionAverage`, `crimeAverage`.

`clearCensus()` resets all tile-count fields at the start of each cycle
(phase 0). History arrays survive across cycles.

**History arrays** (for graphs):
Each of `res`, `com`, `ind`, `crime`, `money`, `pollution` has a 10-entry
and 120-entry array (e.g. `resHist10[]`, `comHist120[]`).  
`take10Census()` is called every 4 ticks; `take120Census()` every 40 ticks.
Each call rotates the array (oldest discarded, newest at index 0).

---

## 4. Map Scanner

**File:** `src/mapScanner.js`  
**Class:** `MapScanner`

A generic tile-dispatch engine. Handlers register via:

```js
mapScanner.addAction(criterion, action);
// criterion: a tile value constant, or a predicate function (tile) => bool
// action: function(map, x, y, simData)
```

`mapScan(startX, maxX, simData)` iterates every `(x, y)` pair in the column
range `[startX, maxX)`, then for each tile:
1. Sets tile power state (if conductive).
2. Counts powered/unpowered zones (if zone centre tile).
3. Runs the first matching handler and breaks.

**Registered handlers:**

| System | Criterion | Action |
|---|---|---|
| PowerManager | `POWERPLANT` tile | `coalPowerFound` |
| PowerManager | `NUCLEAR` tile | `nuclearPowerFound` |
| Residential | `isResidentialZone(tile)` | `residentialFound` |
| Residential | `HOSPITAL` tile | `hospitalFound` |
| Commercial | `isCommercialZone(tile)` | `commercialFound` |
| Industrial | `isIndustrialZone(tile)` | `industrialFound` |
| EmergencyServices | `POLICESTATION` tile | `policeStationFound` |
| EmergencyServices | `FIRESTATION` tile | `fireStationFound` |
| Road | road predicates | road found/decay handlers |
| Transport | seaport/airport tiles | transport handlers |
| Stadia | stadium tile | stadium handler |
| MiscTiles | various | misc tile handlers |

---

## 5. Power Grid

**File:** `src/powerManager.js`  
**Class:** `PowerManager`  
**Called from:** simulation.js phase 11

Two-step process:
1. **Map scan (phases 1-8):** `coalPowerFound` / `nuclearPowerFound` push
   plant positions onto `_powerStack` and count capacity.
2. **Phase 11:** `doPowerScan(census)` BFS-floods from every stacked plant.
   - Coal plant: 700 capacity units. Nuclear plant: 2000.
   - Each tile traversed consumes 1 unit.
   - Tiles are marked in `powerGridMap` (BlockMap, chunk size 1).
   - If capacity is exhausted: emits `NOT_ENOUGH_POWER`.

`setTilePower(x, y)` (called during the map scan for conductive tiles) checks
`powerGridMap` from the *previous* cycle and sets/clears `POWERBIT` on the tile.
This one-cycle lag is intentional and matches the original Micropolis design.

---

## 6. Zone Growth (Residential / Commercial / Industrial)

**Files:** `src/residential.js`, `src/commercial.js`, `src/industrial.js`

All three zones follow the same pattern inside their `*Found` handler:

```
1. Census count += 1; population += zone population.
2. Probabilistic road-connectivity check (via traffic.makeTraffic).
   → No road found: immediate degradeZone() and return.
3. Compute zoneScore = demandValve + locationScore − powerPenalty.
4. if zoneScore > −350 and stochastic test passes → growZone()
5. elif zoneScore < 350 and stochastic test passes → degradeZone()
```

### Scoring differences by zone type

| | Location bonus | Demand valve | Growth base rate |
|---|---|---|---|
| Residential | `landValue − pollution` | `resValve` | ~9% |
| Commercial | `cityCentreDistScore` (±64) | `comValve` | ~3% |
| Industrial | none (0) | `indValve` | ~2.9% |

### Zone tile layout

- **Residential:** tiles from `RZB`, 9 tiles per zone variant, 4 population ×
  4 land-value grades = 16 developed variants + `FREEZ` (empty).
- **Commercial:** tiles from `CZB`, 9 tiles per variant, 5 population × 4
  grades = 20 developed variants + `COMCLR`.
- **Industrial:** tiles from `IZB`, 9 tiles per variant, 4 population × 2
  grades = 8 developed variants + `INDCLR`.

`lpValue` (0-3) encodes the combined land-value/pollution desirability index
computed by `ZoneUtils.getLandPollutionValue()`.

---

## 7. Traffic Routing

**File:** `src/traffic.js`  
**Class:** `Traffic`  
**Called from:** `residentialFound`, `commercialFound`, `industrialFound`

`makeTraffic(x, y, blockMaps, destFn)` determines whether a zone is usable:

1. `findPerimeterRoad(pos)` – scans a 5×5 perimeter for a driveable tile.
   Returns `NO_ROAD_FOUND` (−1) if none, causing the calling zone to degrade.
2. `tryDrive(pos, destFn)` – random walk for up to 30 steps along the road
   network. Succeeds (`ROUTE_FOUND = 1`) if a tile adjacent to the path
   satisfies `destFn`. Fails (`NO_ROUTE_FOUND = 0`) if no path is found.
3. `addToTrafficDensityMap()` – replays the recorded path, adding 50 to each
   road tile's density (capped at 240). Dense roads redirect the copter sprite.

The traffic density map feeds into:
- `pollutionTerrainLandValueScan()` — heavy traffic adds pollution.
- `Evaluation.getTrafficAverage()` — traffic complaints / city score.
- `neutraliseTrafficMap()` — gradual decay toward zero.

---

## 8. Pollution, Land Value & Terrain

**File:** `src/blockMapUtils.js` → `pollutionTerrainLandValueScan()`  
**Called from:** simulation.js phase 12

Iterates every 2×2 tile block and:
- Classifies raw terrain vs developed land.
- Sums pollution by tile type (`getPollutionValue()`: roads 0-75, fire 90,
  radiation 255, industrial zones 50, coal plants 100).
- Smooths the raw pollution map twice (`SMOOTH_ALL_THEN_CLAMP`).
- Computes land value = distance-to-centre base + terrain bonus − pollution −
  crime penalty; clamped 1-250 (0 = undeveloped).

Updates: `pollutionDensityMap`, `landValueMap`, `terrainDensityMap`,
`census.pollutionAverage`, `census.landValueAverage`, `map.pollutionMax{X,Y}`.

---

## 9. Crime

**File:** `src/blockMapUtils.js` → `crimeScan()`  
**Called from:** simulation.js phase 13

Three smoothing passes spread `policeStationMap` → `policeStationEffectMap`.
Then for each developed block:
```
crimeScore = 128 − landValue + populationDensity − policeStationEffect
             clamped 0-250
```
Low land value, high density, and weak police coverage all attract crime.

Updates: `blockMaps.crimeRateMap`, `census.crimeAverage`.

---

## 10. Population Density & City Centre

**File:** `src/blockMapUtils.js` → `populationDensityScan()`  
**Called from:** simulation.js phase 14

Builds a raw density map by querying each zone's population, scales ×8, then
applies three rounds of `SMOOTH_ALL_THEN_CLAMP`. Values are doubled when
copied into the final `populationDensityMap` (max 510 per block).

City centre is recomputed as the centroid of all zone positions. This drives
`cityCentreDistScoreMap`, which is used by commercial zone scoring.

---

## 11. Fire Coverage

**File:** `src/blockMapUtils.js` → `fireAnalysis()`  
**File:** `src/emergencyServices.js` → `fireStationFound()`  
**Called from:** simulation.js phase 15 / map scan

During the map scan, each fire station writes its `budget.fireEffect` (0-1000)
into `blockMaps.fireStationMap`, halved if unpowered or disconnected from roads.

`fireAnalysis()` smooths the map three times to produce `fireStationEffectMap`,
representing coverage radius. This is not directly consumed during gameplay in
the current JS port, but is exposed for the fire-coverage overlay.

---

## 12. Emergency Services (Police & Fire)

**File:** `src/emergencyServices.js`

`handleService()` is a factory that creates the map-scan action for both
`POLICESTATION` and `FIRESTATION`. Both work identically:
- Increment census counter.
- Look up `budget.*Effect` (reduced if unpowered or road-disconnected).
- Accumulate into the corresponding block map.

Police coverage feeds `crimeScan()`; fire coverage feeds `fireAnalysis()`.

---

## 13. City Evaluation & Score

**File:** `src/evaluation.js`  
**Class:** `Evaluation`  
**Called from:** simulation.js phase 9, every TAX_FREQUENCY (48) ticks

`cityEvaluation(simData)` computes:

| Output | Method | Description |
|---|---|---|
| `cityAssessedValue` | `getAssessedValue()` | Infrastructure dollar value |
| `cityPop` | `getPopulation()` | Population from census (×20 scale) |
| `cityClass` | `getCityClass()` | Village→Town→City→Capital→Metro→Megalopolis |
| `problemVotes[]` | `doProblems()` + `voteProblems()` | Top-4 citizen complaints |
| `cityScore` | `getScore()` | 0-1000 overall city health |
| `cityYes` | `doVotes()` | Mayoral approval 0-100 |

Problem inputs: crime avg, pollution avg, land value avg (housing cost proxy),
tax rate, traffic average, unemployment ratio, fire tile count.

Score penalties: demand caps (−15% each), underfunded services (up to −10%),
negative valves (<−1000, −15%), fires, high tax, low powered-zone ratio.

---

## 14. Budget & Tax

**File:** `src/budget.js`  
**Class:** `Budget`  
**Called from:** simulation.js phase 9, every TAX_FREQUENCY (48) ticks

`collectTax(gameLevel, census)` runs once per tax period:
1. Computes full-funding costs for roads/rail, fire stations, police stations.
2. Computes tax revenue: `floor(totalPop × landValueAverage / 120) × cityTax × FLevels[level]`.
3. Calls `doBudgetNow()` to allocate funds in priority order: road > fire > police.

`updateFundEffects()` converts spending ratios to effect integers used by
subsystems:
- `roadEffect` (0-32) — below 15/16 max triggers road decay in `road.js`.
- `policeEffect` (0-1000) — modulates police station contribution to crime suppression.
- `fireEffect` (0-1000) — modulates fire station contribution to fire coverage.

---

## 15. Disasters

**File:** `src/disasterManager.js`  
**Class:** `DisasterManager`  
**Called from:** simulation.js phase 15

When `disastersEnabled` is true, each call to `doDisasters()` has a
`1 / DisChance[gameLevel]` probability of triggering one of:

| Roll | Event |
|---|---|
| 0-1 | Fire (`setFire()`) |
| 2 | Flood |
| 3 | Air crash (via SpriteManager) |
| 4 | Tornado |
| 5 | Earthquake |
| 6-8 | No additional event |

Nuclear meltdown is handled separately inside
`PowerManager.nuclearPowerFound()` during the map scan.

Disaster events emit messages forwarded to the front-end via
`Simulation._wrapMessage()`.

---

## Data Flow Diagram

```
simTick()
  └─ _simFrame() ── rate limit ──► _simulate() → simulate()
                                       │
       ┌────────────────────────────────┼───────────────────────────────┐
       │                               │                               │
  Phase 0                         Phases 1-8                     Phase 9
  setValves()                     mapScan()                      take10Census()
  clearCensus()                     │                            take120Census()
                                    ├── residentialFound()        collectTax()
                                    ├── commercialFound()         cityEvaluation()
                                    ├── industrialFound()
                                    ├── coalPowerFound()
                                    ├── nuclearPowerFound()
                                    ├── policeStationFound()
                                    ├── fireStationFound()
                                    └── road/transport handlers
       │                               │                               │
  Phase 10                        Phase 11                       Phase 12
  neutralise maps                 doPowerScan()                  pollutionTerrainLandValueScan()
  _sendMessages()
       │                               │                               │
  Phase 13                        Phase 14                       Phase 15
  crimeScan()                     populationDensityScan()        fireAnalysis()
                                                                 doDisasters()
```

---

## Key Constants & Magic Numbers

| Constant | Value | Meaning |
|---|---|---|
| `CENSUS_FREQUENCY_10` | 4 ticks | How often the 10-cycle census runs |
| `CENSUS_FREQUENCY_120` | 40 ticks | How often the 120-cycle census runs |
| `TAX_FREQUENCY` | 48 ticks | How often tax is collected / city evaluated |
| `RES_VALVE_RANGE` | 2000 | Max magnitude of residential demand valve |
| `COM_VALVE_RANGE` | 1500 | Max magnitude of commercial demand valve |
| `IND_VALVE_RANGE` | 1500 | Max magnitude of industrial demand valve |
| `COAL_POWER_STRENGTH` | 700 | Power units per coal plant |
| `NUCLEAR_POWER_STRENGTH` | 2000 | Power units per nuclear plant |
| `MAX_TRAFFIC_DISTANCE` | 30 | Maximum road-walk steps per traffic check |
| grow threshold | ±26380 | Compared against `getRandom16Signed()` to gate growth |

---

*Generated during the documentation pass. See also `docs/FORMAT_PASS.md` and
`docs/REGRESSION_CHECKLIST.md`.*
