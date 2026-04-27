# Micropolis → OpenPublica: Gap Analysis

Compares the legacy MicropolisJS / MetroJS implementation against the current
OpenPublica TypeScript implementation under `openpublica/`.

**Sources compared**

| Source | Location |
|---|---|
| MicropolisJS reference map | `docs/SIMULATION_MAP.md` |
| MicropolisJS source | `src/*.js`, `src/*.ts` |
| OpenPublica sim layer | `openpublica/src/sim/*.ts` |
| OpenPublica tools/UI/render/save layers | `openpublica/src/{tools,ui,render,save}/` |

> Note: `docs/OPENPUBLICA_PORTING_GUIDE.md` describes an earlier direct-port
> strategy. OpenPublica has since moved toward a cleaner modern model: typed
> systems, data-driven buildings, renderer-independent tools, and original
> walkability/transit mechanics rather than a byte-for-byte simulation port.

---

## 1. OpenPublica Coverage Snapshot

### 1.1 Implemented or Replaced

| Micropolis area | Micropolis reference | OpenPublica status | Gap / caveat |
|---|---|---|---|
| Main simulation loop | `simulation.js` → `simTick()`, `_simFrame()`, `simulate()` | `CitySim.tick()`, `SimulationClock`, and `ZoneGrowthSystem.tick()` run monthly systems from the Babylon render loop. | Replaces the 16-phase cycle with explicit monthly system calls. |
| Demand valves | `valves.js` → `Valves.setValves()` | `ZoneGrowthSystem._updateDemand()` maintains R/C/I demand in `CityStats`. | Simpler [0–100] model; no Micropolis external market table, difficulty, or hard cap flags. |
| Residential / commercial / industrial growth | `residential.js`, `commercial.js`, `industrial.js` | `ZoneGrowthSystem._growBuildings()` grows data-driven `BuildingDef` entries from `buildings.json`. | No tile-sprite variants, no degradation path, no random road trip connectivity failure. |
| Mixed-use zoning | OpenPublica original | `ZoneType.MixedUse`, mixed-use building defs, mixed-use demand gate, walkability bonuses. | No Micropolis equivalent. |
| Power coverage | `powerManager.js` → `doPowerScan()` | `PowerSystem.tick()` marks `tile.powered` from service buildings with `powerRadius`. | Radius coverage replaces Micropolis BFS through conductive tiles. |
| Budget and taxes | `budget.js` → `collectTax()`, `updateFundEffects()` | `EconomySystem.tick()` collects separate R/C/I taxes and deducts roads, trolley avenues, and service building costs. | No service-quality multipliers (`roadEffect`, `fireEffect`, `policeEffect`). |
| Land value | `blockMapUtils.js` → `pollutionTerrainLandValueScan()` | `LandValueSystem.tick()` handles parks, industrial penalty, road access, walkability, transit, pollution, and traffic pressure. | `tile.pollution` is still unwritten; no terrain fertility or city-centre base score. |
| Traffic pressure | `traffic.js` → `makeTraffic()`, traffic density map | `TrafficPressureSystem.tick()` radiates pressure/noise from buildings to nearby roads. | Replaces random-walk routing; no origin/destination route success check. |
| City census totals | `census.js` → `clearCensus()`, `take10Census()` | `ZoneGrowthSystem._recalcStats()` recomputes population/jobs from the building registry. | No census history arrays or graph-oriented samples. |
| Save/load | `GameMap.save/load`, subsystem save methods | `SaveCodec` and `SaveSystem` encode sim state, buildings, stats, clock, and tile zoning/roads/buildings. | Tile derived fields (`powered`, land value, traffic, overlays) are recomputed rather than persisted. |
| Tools | Micropolis tool classes | Renderer-agnostic `Tool` implementations and `ToolController` manage inspect, road, zones, bulldoze, power plant, park, and trolley avenue. | No rail, wire, stadium, seaport, airport, police, fire, disaster, or query-equivalent detail panel yet. |
| UI/HUD | legacy DOM windows | `Toolbar`, `CityHUD`, and `BudgetPanel` show tools, money, date, RCI demand, happiness, walkability, transit, and tax sliders. | No city evaluation window, graphs window, advisory feed, or disaster/budget detail windows. |
| Rendering | canvas tile/sprite renderer | Babylon renderers for terrain, buildings, overlays, highlight, picking, and decorative cars. | Procedural visuals; no Micropolis sprite/tile asset parity by design. |
| Walkability | OpenPublica original | `WalkabilitySystem`, overlay, HUD stat, demand/land-value/happiness effects. | No Micropolis equivalent. |
| Trolley transit | OpenPublica original | `RoadType.TrolleyAvenue`, `TransitSystem`, overlay, HUD stat, traffic/demand/land-value/happiness effects. | No Micropolis equivalent. |

### 1.2 Still Missing or Partial

| Priority | Missing area | Micropolis reference | OpenPublica gap |
|---|---|---|---|
| High | Pollution writer | `pollutionTerrainLandValueScan()` | `CityTile.pollution` exists and `LandValueSystem` reads it, but no system writes it or computes a citywide pollution average. |
| High | Population density map | `populationDensityScan()` | No per-tile/per-block density field; crime and downtown scoring lack their main input. |
| High | Police coverage and crime | `emergencyServices.js`, `crimeScan()` | No police station building, police coverage field, `tile.crime`, `stats.crimeAverage`, or crime system. |
| High | Fire station coverage | `emergencyServices.js`, `fireAnalysis()` | No fire station building, fire coverage field/stat, or fire risk/coverage system. |
| High | City evaluation and complaints | `evaluation.js` | No city score/class, mayor approval, problem vote list, population milestone classification, or evaluation UI. |
| Medium | Advisory/message system | `simulation.js` → `_sendMessages()` | Existing callbacks are renderer refresh hooks, not player-facing event/advisory messages. |
| Medium | City-centre score | `populationDensityScan()`, `commercialFound()` | Commercial growth has walkability/transit boosts but no downtown centroid or distance score. |
| Medium | Zone degradation / abandonment | zone `degradeZone()` paths | Buildings do not shrink, downgrade, abandon, or clear because of low demand, no power, pollution, or poor access. |
| Medium | Terrain generation and terrain effects | map generation and land/pollution terrain scan | OpenPublica starts from a simple map; terrain does not feed land value, pollution absorption, or desirability. |
| Low | Census history graphs | `take10Census()`, `take120Census()` | No ring buffers for population, money, crime, or pollution; no graph panel. |
| Low | Infrastructure gates | stadium/seaport/airport cap messages | No stadium, seaport, airport, or demand caps. This may remain intentionally omitted. |
| Low | Road decay | `road.js` | Roads/trolley avenues charge maintenance but never degrade when underfunded. |
| Low | Disasters and repair | `disasterManager.js`, `repairManager.js` | No fire/flood/tornado/monster events or repair manager. |
| Low | Audio | sound event strings | No audio playback or bundled sound assets in OpenPublica. |

---

## 2. Systems That Should Be Reimplemented, Not Ported Directly

| Micropolis system | Recommendation |
|---|---|
| 16-phase map scan (`mapScanner.js`) | Keep OpenPublica's explicit system classes. Add new systems to the monthly pipeline instead of recreating phase dispatch. |
| Tile constants and 3×3 zone sprite layouts | Continue using `ZoneType`, `RoadType`, `TerrainType`, `BuildingDef`, and Babylon meshes. Sprite-layout tables are not useful in OpenPublica. |
| Power flood-fill through conductive tile constants | Keep radius-based service coverage unless a deliberate grid/wire mechanic is designed around OpenPublica tile fields. |
| Traffic random walk | Extend the current pressure model or add a road-graph model; do not port the stochastic 30-step Micropolis route search. |
| Budget quality multipliers | Model service effectiveness directly in each service system rather than recreating hidden `roadEffect`, `fireEffect`, and `policeEffect` scalars. |
| Sprite-driven disasters | If disasters are added, implement pure sim tile mutations first and keep visual effects in `render/`. |
| Proprietary-looking asset parity | Prefer procedural/new assets and comply with GPL/name-license constraints; do not make OpenPublica depend on Micropolis branding or legacy sprite identity. |

---

## 3. Recommended Implementation Roadmap

### Priority 1 — Core city-health systems

| # | Work item | Main changes | Depends on |
|---|---|---|---|
| 1 | Pollution writer | Add `PollutionSystem.ts`; write `tile.pollution`; add `stats.pollutionAverage`; feed land value and future evaluation. | Existing traffic/noise, industrial buildings, power plants. |
| 2 | Population density | Add `tile.populationDensity` and `PopulationDensitySystem.ts`; compute density around residential/mixed-use buildings. | Building registry and map iteration. |
| 3 | Police coverage | Add police station building/tool and coverage field/stat. | Service building pattern, power coverage. |
| 4 | Crime system | Add `tile.crime`, `stats.crimeAverage`, and `CrimeSystem.ts` using land value, density, and police coverage. | Population density, police coverage. |
| 5 | Fire coverage | Add fire station building/tool, `tile.fireCoverage`, `stats.fireCoverage`, and `FireCoverageSystem.ts`. | Service building pattern, power coverage. |
| 6 | City evaluation | Add score/class/approval/problem votes using pollution, crime, traffic, land value, taxes, unemployment, fire coverage, and bankruptcy. | Pollution, crime, fire coverage. |

### Priority 2 — Player feedback and growth quality

| # | Work item | Main changes |
|---|---|---|
| 7 | Advisory system | Add structured player messages for bankruptcy, high pollution/crime, no power, service gaps, population milestones, and growth blockers. |
| 8 | Evaluation/HUD UI | Surface city score, class, approval, and top complaints in the UI. |
| 9 | City-centre scoring | Compute a downtown centroid/distance score and apply it to commercial and mixed-use growth. |
| 10 | Zone degradation | Allow persistent low demand, missing power, pollution, traffic, or crime to downgrade/remove buildings. |
| 11 | Terrain generation/effects | Add terrain variation and have terrain influence land value/pollution absorption. |

### Priority 3 — Deferred or optional simulation depth

| # | Work item | Main changes |
|---|---|---|
| 12 | Census history graphs | Add ring-buffer samples and a graph panel for population, jobs, money, pollution, crime, traffic, and land value. |
| 13 | Road decay | Add optional underfunded-road degradation if maintenance quality becomes a mechanic. |
| 14 | Infrastructure gates | Only add stadium/seaport/airport if OpenPublica intentionally wants Micropolis-style milestone blockers. |
| 15 | Disasters/repair | Add pure-sim disasters with renderer-side effects after city health/evaluation systems exist. |
| 16 | Audio | Add original/licensed audio only after a licensing review. |

---

## 4. File-Level Mapping

| MicropolisJS file | OpenPublica equivalent | Status |
|---|---|---|
| `src/simulation.js` | `CitySim.ts`, `SimulationClock.ts`, `ZoneGrowthSystem.ts`, `App.ts` | ✅ Replaced |
| `src/valves.js` | `ZoneGrowthSystem._updateDemand()` | ✅ Simplified |
| `src/census.js` | `ZoneGrowthSystem._recalcStats()` | ⚠️ Totals only |
| `src/mapScanner.js` | Per-system `tick()` classes | ✅ Replaced |
| `src/powerManager.js` | `PowerSystem.ts` | ✅ Reimplemented |
| `src/residential.js` | `ZoneGrowthSystem.ts`, `buildings.json` | ✅ Reimplemented |
| `src/commercial.js` | `ZoneGrowthSystem.ts`, `buildings.json` | ✅ Reimplemented |
| `src/industrial.js` | `ZoneGrowthSystem.ts`, `buildings.json` | ✅ Reimplemented |
| `src/traffic.js` | `TrafficPressureSystem.ts`, `DecorativeCarRenderer.ts` | ✅ Reimplemented |
| `src/blockMapUtils.js` — land value | `LandValueSystem.ts` | ✅ Partial |
| `src/blockMapUtils.js` — pollution | None | ❌ Missing |
| `src/blockMapUtils.js` — population density | None | ❌ Missing |
| `src/blockMapUtils.js` — crime | None | ❌ Missing |
| `src/blockMapUtils.js` — fire coverage | None | ❌ Missing |
| `src/emergencyServices.js` | None | ❌ Missing |
| `src/evaluation.js` | None | ❌ Missing |
| `src/budget.js` | `EconomySystem.ts`, `BudgetPanel.ts` | ✅ Reimplemented |
| `src/gameMap.js` save/load | `SaveCodec.ts`, `SaveSystem.ts` | ✅ Reimplemented |
| `src/*Tool.js` | `openpublica/src/tools/*.ts` | ⚠️ Partial tool set |
| legacy canvas renderer / sprites | `openpublica/src/render/*.ts` | ✅ Replaced |
| `src/disasterManager.js` | None | 🚫 Deferred |
| `src/spriteManager.js` | Decorative cars only | 🚫 Mostly out of scope |

*Legend: ✅ covered or intentionally replaced · ⚠️ partial · ❌ missing · 🚫 deferred / out of scope*

---

## 5. Immediate Next Best Task

The best next implementation target is **PollutionSystem** because:

1. `CityTile.pollution` already exists.
2. `LandValueSystem` already consumes pollution.
3. Pollution is an input to city evaluation and complaints.
4. It can be implemented without new tools, new buildings, or new UI beyond an
   optional overlay/stat later.

After pollution, implement **PopulationDensitySystem → PoliceCoverageSystem →
CrimeSystem**, because crime depends on density and police coverage.
