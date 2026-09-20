# OpenPublica — Next gaps (after Phases A–H)

**Date:** 2026-09-20  
**Base:** 3D presentation Phases A–H are playable in `openpublica/` (perspective camera, heightfield + water, extruded roads, instanced kits, parks/trees/smoke, moving traffic, unified overlays, minimap/sun/quality, city/settings chrome, MIT simplex hills).

This is an implementation plan for **what is still missing**, not a licence to rewrite sim formulas or import Micropolis art.

---

## 1. Audit verdict

The city is already a **perspective 3D WebGL city**, not an orthographic postcard. The remaining work is:

1. **City-health simulation** the HUD pretends to care about but cannot yet play (crime, fire, evaluation, density).
2. **Honest player feedback** when growth stalls or the city is sick.
3. **Presentation depth** that was deferred on purpose (PBR/sky/GLB/SSAO).
4. **Coordinator debt** (`App.ts` still constructs the whole game).

Do **not** treat leftover comments in `FULL_3D_WEB_PORT_PLAN.md` §3.2 as current reality. That table is the pre-A snapshot.

---

## 2. What is already true (do not re-do)

| Claim | Status |
|---|---|
| Perspective orbit / iso / top, paint vs orbit | Shipped |
| Sun + fill + shadows; dawn–dusk slider | Shipped |
| Heightfield, lakes/river, water plane, height picks | Shipped |
| Extruded streets / trolley, sloped arms | Shipped |
| Instanced procedural kits | Shipped |
| Parks, street trees, plant smoke | Shipped |
| Moving cars/trolleys on a render-only graph | Shipped |
| One overlay mesh including pollution | Shipped |
| `PollutionSystem` writes `tile.pollution` / `stats.pollutionAverage` | Shipped (older gap analysis is stale) |
| Procedural Web Audio, mute M | Shipped |
| Minimap, Frame/Home, quality High/Low | Shipped |
| City confirms; Settings vs Look | Shipped |
| MIT `simplex-noise` + `alea` for hills/trees | Shipped |
| Sim layer Babylon-free | Still law |

**Still frozen unless a slice below names a justified sim field:** growth/tax/power/traffic/walk/transit formulas.

---

## 3. Major gaps (player-visible or architecture)

Ordered by what a player actually hits, then by what other work depends on.

### Gap A — City-health loop (sim + HUD)

The HUD shows Poll / Happy / Walk / Transit plus Crime / Fire / Water / Score. Density, police, fire, crime, evaluation, and water coverage are playable. Remaining city-health work is degradation (B2), not more unused HUD fields.

| Slice | What to ship | Must not |
|---|---|---|
| A1 Density **shipped** | `tile.populationDensity` from residential/mixed buildings; Crowd overlay | Port Micropolis `populationDensityScan` tables |
| A2 Police **shipped** | Station def + tool + coverage radius like power; `tile.policeCoverage` | Sprite cops |
| A3 Crime **shipped** | `tile.crime` from density, land value, police; HUD average | Hidden Micropolis crime RNG as-is |
| A4 Fire **shipped** | Station def + tool + `tile.fireCoverage`; Fire overlay + HUD average | Disasters in the same PR |
| A5 Evaluation **shipped** | Monthly score / approval / top problems from pollution, crime, traffic, taxes, power, bankruptcy | Census graphs in the same PR |
| A6 Roads + water **shipped** | Highway tool + maintenance; `tile.watered` from powered towers; HUD Water / Mains overlay | Power-line network; growth/tax formulas |

**Exit:** A grown city can be “unsafe” or “underserved” in HUD + overlay without opening the console.

### Gap B — Honest growth and advice

Buildings **do** empty after sustained neglect. Status is city-local (HUD advisory) plus inspect hints.

| Slice | What to ship |
|---|---|
| B1 Advisory **shipped** | Structured messages (no power plant, bankrupt, smog spike, no road access) in the HUD feed |
| B2 Degradation **shipped** | Zone buildings downgrade or leave after 4 stressed months (no road/demand/power, smog, crime); 2-month grow cooldown | Disasters; Micropolis decay tables |
| B3 Downtown **shipped** | Commercial/mixed land-value boost from the residential centroid; honest zone plats (no painting roads/buildings) |

**Exit:** A player who never places a plant sees a clear advisory, then empty lots, not a silent stall.

### Gap C — Presentation depth (render only)

| Slice | What to ship | Must not |
|---|---|---|
| C1 Materials | Untextured PBR colours (roughness) on terrain, kits, roads, water | Micropolis sheets as albedo |
| C2 Sky | Simple sky/horizon (dome or gradient mesh), keep fog; daylight still drives it | Full atmosphere / SSAO in C2 |
| C3 Terrain read | Slight grass/dirt variation already from simplex; optional skirt on the city mesh | Change lake topology |
| C4 GLB (optional) | `@babylonjs/loaders` + `visualRef` + `ASSET_LICENSE.md`; procedural fallback | EA-looking kits |
| C5 PostFX | SSAO/FXAA only after a filled-city frame-time check on High quality | Always-on SSAO |

**Exit:** Horizon and materials read 3D without a second engine.

### Gap D — Tooling and structure

| Slice | What to ship |
|---|---|
| D1 `npm test` | `openpublica` script that runs root Jest (done in this polish PR) |
| D2 Split `App.ts` | Extract “rebuild all renderers” + save/load wiring from the constructor |
| D3 Render tests | Keep GPU tests out of Jest; add a few more **pure** layout tests (picker math, daylight lerp) |

---

## 4. Explicitly still out of scope (Phase I)

Unchanged from the 3D plan:

- Disasters / monster / tornado meshes
- Census graph window
- WebGPU-only features
- Physics
- Multiplayer
- Map 64 → 120 until LOD/chunking exists
- Howler / Micropolis samples / Three.js

---

## 5. Recommended next PRs (mergeable)

1. ~~**Density + crime overlay inputs** (A1–A3).~~ Shipped: Crowd/Crime overlays, Police tool, HUD Crime.
2. ~~**Fire coverage** (A4).~~ Shipped: Fire tool, overlay, HUD Fire (no disasters).
3. ~~**Evaluation + advisory** (A5 + B1).~~ Shipped: HUD Score + mayor alert line.
4. ~~**Highways + water towers** (A6).~~ Shipped: Highway tool, Water HUD/overlay, dry-lots advisory.
5. ~~**Zoning plats + downtown** (B3).~~ Shipped: Dezone, hard empty-lot colours, C/M land value near housing.
6. ~~**Degradation** (B2).~~ Shipped: four stressed months then downgrade/leave; HUD emptying advisory.
7. **PBR + sky** (C1–C2) — visual, no sim.
8. **App.ts split** (D2) whenever the next feature would add another 80 lines to the constructor.

GLB (C4) and SSAO (C5) stay optional after C1–C2.

---

## 6. Verification for later slices

- Root `npm test` (or `cd openpublica && npm test`) stays green.
- No `@babylonjs` imports under `src/sim/`, `src/tools/`, `src/save/`.
- Network tab still has no `tiles.png` / `sprites/`.
- Play: grow a city, toggle Smog, Frame, Save/Load, mute, Dawn/Dusk.
