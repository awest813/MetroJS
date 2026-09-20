# OpenPublica — Fully 3D Web Port: Audit and Plan

**Date:** 2026-09-20  
**Scope:** Turn the existing browser city-builder into a **true 3D** WebGL city, not a 2.5D isometric board.  
**Strategy:** Keep the simulation layer. Replace the render/camera/asset layer. Do not port Micropolis canvas tiles or EA-derived sprites.

This document is an implementation plan for a future coding pass. It is not a licence to change gameplay formulas unless a listed sim-side field is required for 3D presentation (for example terrain elevation).

---

## 1. What “fully 3D” means here

A fully 3D web port is a city the player can **orbit, pitch, and zoom** in perspective, where:

- Ground has **volume** (water below grade, optional hills, extruded curbs).
- Buildings are **3D masses** (facades, roofs, chimneys), not tinted cubes on a painted grid.
- Roads, trolley tracks, parks, and water are **geometry**, not vertex colours on a flat quad.
- Lighting is **directional** (sun + shadows), so height and streets read in 3D.
- Vehicles and overlays live in the same world space, not as 2D stickers.

It is **not**:

- A Unity/Unreal/native download.
- Pixel-identical Micropolis / SimCity tile art.
- A byte-for-byte port of `src/gameCanvas.js`.
- A rewrite of `openpublica/src/sim/` into Babylon types.

**Recommended stack (already chosen):** TypeScript + Vite + Babylon.js 9 in the browser (WebGL2). Stay on this stack. Do not introduce a second engine.

---

## 2. Repository audit (two products)

This repo contains **two games**:

| Product | Location | Renderer | Status |
|---|---|---|---|
| MicropolisJS / MetroJS | `src/`, `index.html`, Webpack | HTML5 Canvas, 16×16 tile sheet | Complete 2D city sim |
| OpenPublica | `openpublica/` | Babylon.js, procedural meshes | Playable 2.5D prototype |

**Do the 3D port only in `openpublica/`.** Leave the canvas game as the historical reference and Jest host for simulation tests under `test/`.

Existing docs that remain valid as *sim* references, not as *3D* specs:

| Doc | Use for 3D work |
|---|---|
| `docs/MICROPOLIS_TO_OPENPUBLICA_GAP_ANALYSIS.md` | What sim systems still exist vs Micropolis. Independent of 3D. |
| `docs/OPENPUBLICA_PORTING_GUIDE.md` | Outdated “port Micropolis then Babylon adapter” strategy. Do not follow for rendering. |
| `docs/LICENSING_RISKS.md` / `docs/ASSET_INVENTORY.md` | **Do not** load `images/tiles.png`, `tilessnow.png`, or `sprites/` into OpenPublica. |
| `openpublica/docs/README.md` | Architecture boundary (sim vs render) is still the law. Feature checklist is stale. |

---

## 3. Current OpenPublica 3D audit

### 3.1 Architecture (keep)

The layer split is the right foundation for a 3D port:

| Layer | Path | Babylon allowed |
|---|---|---|
| Simulation | `src/sim/` | No |
| Tools | `src/tools/` | No |
| Data | `src/data/` | No |
| UI | `src/ui/` | No |
| Save | `src/save/` | No |
| Renderer | `src/render/` | Yes |
| Coordinator | `src/app/App.ts` | Yes (wires both) |

Simulation already models a city independently of how it looks: `CityMap` / `CityTile`, monthly systems (growth, power, land value, traffic, walkability, transit, pollution, economy), renderer-agnostic tools, localStorage save/load.

That is the correct split. A fully 3D port is almost entirely `src/render/` + `SceneSetup` + camera/input in `App.ts`, plus a small **visual catalog** next to `buildings.json`.

### 3.2 What is actually on screen today (2.5D, not 3D)

| System | Implementation | Why it is not fully 3D |
|---|---|---|
| Camera | `ArcRotateCamera` in **orthographic** mode, fixed α/β, **no `attachControl`** | Locked isometric postcard. No orbit, no perspective foreshortening, zoom limits unused. |
| Lighting | Single `HemisphericLight` from +Y | No sun, no shadows, no time-of-day, no material spec response. |
| Terrain | One merged mesh of **Y = 0** quads, vertex colours | Flat board. Roads/zones/water are paint, not forms. `TILE_FILL = 0.98` gaps look like a spreadsheet. |
| Buildings | One `CreateBox` per instance, `StandardMaterial`, zone tint | Lego cubes. No roofs, windows, variation, or shared GPU instances. |
| Parks / water | Colour only (`TerrainType` exists; map is all grass at start) | Water never sits in a basin; parks have no trees. `tile.watered` is unused. |
| Roads / trolley | Vertex colour on the same ground mesh | No asphalt thickness, lanes, rails, or intersections. |
| Highlight | `CreateGround` at Y = 0.005 | Works only on a perfectly flat board. |
| Overlays (power, land value, traffic, walkability, transit) | Duplicate full-map colour meshes at Y ≈ 0.02 | Five extra 64×64 meshes; break as soon as terrain has height. |
| Cars | Static boxes on high-pressure tiles | Decorative, not pathing; all one material; one mesh each. |
| Picking | `scene.pick` → `floor(x), floor(z)` assuming Y = 0 | Fails on slopes, water, and tall building occlusion if camera can pitch. |
| Materials | `StandardMaterial` only | No PBR, textures, or environment lighting. |
| Post-process / sky | Solid `clearColor` | No skybox, fog, SSAO, or horizon. |
| Audio | None | Out of scope for geometry, but 3D will feel empty without later SFX. |

`BuildingRenderer` shape table (all boxes):

| defId | footprint | height |
|---|---|---|
| `small_house` | 0.50 × 0.50 | 0.40 |
| `rowhouse` | 0.70 × 0.45 | 0.55 |
| `small_shop` | 0.65 × 0.65 | 0.35 |
| `light_workshop` | 0.75 × 0.75 | 0.50 |
| `small_power_plant` | 0.80 × 0.80 | 0.60 |
| `shopfront_apartments` | 0.75 × 0.55 | 0.65 |
| `corner_store_flats` | 0.65 × 0.65 | 0.60 |
| `main_street_block` | 0.85 × 0.60 | 0.75 |

There is **no** GLB/glTF loader, no `InstancedMesh` / thin instances, no shadow generator, no height field.

### 3.3 Simulation vs presentation debt (affects 3D, not formulas)

These are gaps that a 3D world will expose even if numbers stay the same:

| Issue | Detail |
|---|---|
| Dead `GameMap` / `TileType` | `TerrainRenderer.buildGrid()` and `tileTypes.ts` are the old 4-type board. Live path is `CityMap` + `buildCityGrid()`. |
| No terrain generation | Every tile starts `TerrainType.Grass`. Water/dirt colours exist but the city never uses them. |
| Overlay copy-paste | Five overlay classes share the same quad builder. A 3D port should collapse them. |
| `App.ts` god-object | Overlay buttons, save/load, picking, and renderer refresh all live in the constructor. Camera + input will make this worse unless extract. |
| Per-mesh buildings | Fine at dozens of boxes; painful at thousands of detailed meshes. Instancing is mandatory before real models. |
| Tests | Jest lives at repo root (`test/*`) against `openpublica/src/sim`. OpenPublica has **no** `npm test` script and no render tests. |
| Stale README | `openpublica/docs/README.md` still lists Phase 2 sim/save/overlays as unimplemented. |

### 3.4 Tooling

- Vite 8, TypeScript 6, `@babylonjs/core` ^9, port 3000.
- No `@babylonjs/loaders`, `@babylonjs/materials`, inspector, or Havok.
- Root `npm test` already covers sim; 3D work should not break those tests.

### 3.5 Licensing constraint (non-negotiable)

Original Micropolis tile/sprite sheets are **GPL + EA additional terms** and look like the 1989 commercial game. OpenPublica already chose **procedural / original art**. A 3D port must keep that:

- New or CC0/CC-BY models, or code-generated kits.
- No `tiles.png` / `sprites.png` atlases as building facades.
- No “Micropolis” / “SimCity” naming in the 3D product UI.

---

## 4. Target architecture after the port

```
openpublica/src/
  sim/          unchanged contract (CitySim, CityTile, systems)
  tools/        unchanged (tile coords, not meshes)
  ui/           HUD stays HTML; add camera-mode / overlay chrome only
  data/
    buildings.json          + optional visualRef
    buildingVisuals.ts      render-only kit ids, heights, colours
  render/
    SceneSetup.ts           engine, PBR pipeline, sun, shadows, sky
    CameraController.ts     perspective orbit/pan/zoom + iso preset
    TerrainRenderer.ts      heightfield + terrain materials
    WaterRenderer.ts        water plane / basin
    RoadRenderer.ts         extruded streets, highways, trolley
    BuildingRenderer.ts     instanced kits or imported GLB
    VegetationRenderer.ts   parks / trees (instances)
    VehicleRenderer.ts      moving instances on a road graph
    OverlayRenderer.ts      one mesh or material plugin; height-aware
    HighlightRenderer.ts    follows terrain height
    TilePicker.ts           ray → tile via heightfield, ignore vehicles
    SceneEnvironment.ts     fog, sky, optional day/night
  app/App.ts                wire CameraController vs tools (modifier keys)
```

**Coordinate system (keep):** tile (x, y) maps to world `(x * TILE_SIZE, height, y * TILE_SIZE)`. `TILE_SIZE = 1`. Y-up, Babylon left-handed.

**Sim stays 2D.** Elevation is a **render (and optional data) layer**. If hills should affect land value later, add `tile.elevation` in sim in a separate PR after the visual heightfield works. Do not block 3D on that.

---

## 5. Input: the hard 3D UX problem

Today, **left-click and drag paint tiles**. A free 3D camera also wants drag to orbit.

**Required contract before camera.attachControl:**

| Gesture | Meaning |
|---|---|
| Left click / left-drag | Active tool (place, zone, bulldoze, inspect) |
| Middle-drag or Alt+left-drag | Orbit |
| Right-drag | Pan |
| Wheel | Zoom (perspective radius) |
| Keys 1 / 2 / 3 | Iso preset / top-down / free 3D |
| Hold Space | Temporarily orbit even with left mouse (optional) |

`TilePicker` must ignore picks that originated as camera drags (movement threshold or Babylon `camera.inertial*` / pointer button filter).

When the camera is pitched low, picking must use the **terrain (or a dedicated pick mesh)** rather than the first building hit, except Inspect, which may select the building mesh.

---

## 6. Phased plan

Each phase is a mergeable slice. Do not start GLB catalogs or SSAO before camera + height + instancing exist.

### Phase A — Perspective camera and lighting (no new art)

**Goal:** The same boxes and coloured floor, but a real 3D viewport.

1. Switch `ArcRotateCamera` to **perspective** (`Camera.PERSPECTIVE_CAMERA`).
2. Add `CameraController`: attach controls with the gesture table above; clamp beta so the camera cannot go under the map; keep a one-click “classic iso” preset (current α = −π/4, β ≈ π/3.5).
3. Replace sole hemispheric light with **DirectionalLight** (sun) + dim hemispheric fill.
4. `ShadowGenerator` on the sun; terrain + buildings receive/cast. Start with a modest map shadow map (2048).
5. Sky: `ClearColor` gradient or `PhotoDome` / simple sky material; ground-level fog so the map edge does not clip to void.
6. Extract overlay toggles out of `App.ts` if the constructor grows again.

**Exit criteria:** Orbit around a grown city; shadows under boxes; tools still paint; Jest sim tests unchanged.

**Risk:** Left-drag orbit vs paint. Ship camera only when tools still work.

### Phase B — Height-aware ground and water

**Goal:** The board becomes a landscape.

1. Introduce a height sampler `height(x, y)` used by terrain, highlight, overlays, picker. Phase B can use a **generated** heightmap (very mild noise + water basins) without changing `CityTile`.
2. Rebuild `TerrainRenderer` as a heightfield (shared verts or skirts). Grass / dirt materials (even untextured PBR colours with slight roughness) instead of per-tile vertex colour for everything.
3. Roads and zones should **not** be “paint on the heightfield” forever; for Phase B it is acceptable to darken terrain under roads until Phase C.
4. Water: separate mesh at a constant water plane; tiles with `TerrainType.Water` sit below that plane (carve or set height).
5. `TilePicker`: convert hit point through the heightfield; do not assume Y = 0.
6. `HighlightRenderer`: sit on sampled height + epsilon.

**Sim hook (optional, later):** map generator writes `TerrainType.Water` / `Dirt` so 3D water is not only cosmetic. That is the first justified sim change.

**Exit criteria:** Camera pitched to the horizon still shows a ground plane with a river/lake; click maps to the correct tile.

### Phase C — Roads as geometry

**Goal:** Streets read as infrastructure.

1. `RoadRenderer` builds extruded strips from `tile.roadType` neighbours (N/E/S/W connectivity). Street vs highway vs trolley get different width, height, and colour.
2. Trolley: two rail lines or a centre strip on the avenue mesh.
3. Intersections: simple overlapping boxes or a junction template; do not start with spline networks.
4. Stop colouring road tiles on the terrain mesh (or leave a darker underlay only).
5. Decorative cars sit on road mesh height, aligned to the edge they occupy.

**Exit criteria:** A trolley avenue is visually distinct from a street from any camera angle.

### Phase D — Building kits (procedural first, GLB later)

**Goal:** A skyline, still original art, still fast.

**D1 — Procedural kits (required)**

For each `buildings.json` id, replace `CreateBox` with a small CSG/kit of boxes:

- House: body + pitched roof (prism) + door inset colour.
- Rowhouse: taller, shared-wall look, two window bands.
- Shop: awning slab + wider ground floor.
- Workshop: shed roof + stack.
- Power plant: bunker + two cylinders (stacks) + emissive warning already exists.
- Mixed-use: podium + upper storeys.
- Park: no building box; Phase E vegetation.

Store kit params in `buildingVisuals.ts` (render-only). Keep `BUILDING_SHAPES` heights as the source of silhouette until kits land.

**D2 — Instancing (required before detail)**

- One source mesh (or thin-instance buffer) per kit part.
- Colour / unpowered warning via instance attributes or a small set of materials (zone + warning + service), not a unique mesh material per tile.

**D3 — Optional GLB**

- Add `@babylonjs/loaders`.
- `visualRef` on building defs pointing at `public/models/*.glb`.
- Fallback to procedural kit if load fails.
- Licence each file in `openpublica/docs/ASSET_LICENSE.md`. Prefer original or CC0.

**Exit criteria:** 200+ buildings at 60 fps on a mid laptop; unpowered still reads red; inspect still returns `buildingId`.

### Phase E — Parks, trees, and props

1. Park tiles: ground material change + 1–4 tree instances (canopy sphere + trunk cylinder is enough).
2. Optional street trees along low-traffic streets (purely visual).
3. Power plant smoke: GPU particles from stacks when the plant exists (visual only).

### Phase F — Vehicles that move

Replace `DecorativeCarRenderer` spawn/despawn boxes with:

1. A **render-only** road graph built from `RoadType !== None` (nodes at tile centres, edges to 4-neighbours).
2. A pool of instanced cars that lerp along edges; speed or density scaled by `trafficPressure`.
3. Optional trolley mesh along `TrolleyAvenue` loops.

Do **not** port Micropolis sprite AI (`trainSprite.js`, etc.) for Phase F. If trains/boats come later, they are new OpenPublica actors driven by the same graph idea.

Keep the sim’s `TrafficPressureSystem` as the density source. Vehicles must not write sim state.

### Phase G — Overlays that survive 3D

Collapse five overlay classes into **one** `OverlayRenderer` with a mode enum.

Options (pick one):

1. **Projected quads** sampled to heightfield (fast, current look, height-correct).
2. **Building/terrain tint** via a shader uniform (better in pitched camera; more work).

Inspect tool should remain the source of numeric truth (pollution, land value, power) so overlays are optional.

Add a **pollution overlay** once the mesh path is unified (`tile.pollution` is already written).

### Phase H — Camera product polish

1. Minimap (HTML canvas or a second orthographic camera to a render target).
2. Frame-on-city / reset view.
3. Optional day/night slider (sun angle only; do not retune sim).
4. SSAO / FXAA via Babylon default rendering pipeline — **after** perf is measured.
5. Quality presets: shadows off, particles off, vegetation density.

### Phase I — Explicitly out of scope for the first 3D milestone

- Micropolis disasters, monster, tornado meshes.
- Census graphs (2D UI).
- Police/fire/crime sim (see gap analysis; not a 3D blocker).
- WebGPU-only features.
- Physics engine.
- Multiplayer.
- Map size jump 64 → 120 until instancing + LOD exist.

---

## 7. Performance budget

Assume a filled 64×64 city (~2–4k building parts, ~1–2k road segments, ~200 cars).

| Budget | Target |
|---|---|
| Frame time | ≤ 16 ms on integrated GPU (Chrome, 1080p) |
| Draw calls | Prefer < 50 after instancing (kits + terrain + water + overlays + HUD) |
| Shadow | One cascade or simple shadow map; disable below a quality preset |
| Pick | One ray per pointer event; ignore instance-heavy vehicle layer (`isPickable = false`) |

**Do not** create a unique `Mesh` per window pane. If a kit has many parts, bake to one mesh per building type.

When/if map size grows, add chunked terrain and distance culling (skip instances beyond a radius).

---

## 8. Suggested file-level work (Phase A–D)

| File | Action |
|---|---|
| `render/SceneSetup.ts` | Perspective camera, sun, shadows, fog, sky. Split camera into `CameraController.ts`. |
| `render/TilePicker.ts` | Button filter; heightfield hit; optional building inspect pick. |
| `render/TerrainRenderer.ts` | Heightfield; stop using roads as the only visual language. Remove dead `buildGrid(GameMap)`. |
| `render/BuildingRenderer.ts` | Kits + instances; keep `BuildingPickData`. |
| `render/TrafficVehicleRenderer.ts` | Moving instances on a render-only road graph (Phase F). |
| `render/*OverlayRenderer.ts` | Merge in Phase G; until then offset by sampled height. |
| `render/HighlightRenderer.ts` | Follow height. |
| `app/App.ts` | Wire camera vs tools; stop growing overlay button soup. |
| `data/buildings.json` | Optional `visualRef` only in D3. |
| `sim/*` | No change in A–D except optional terrain generator writing `TerrainType`. |
| `openpublica/package.json` | Add loaders only in D3; add `npm test` that defers to root Jest or a local vitest for sim. |

---

## 9. Verification

No browser tools are assumed for this planning PR. When implementing:

1. **Sim regression:** from repo root, `npm test` (Jest covering `openpublica/src/sim`).
2. **Playtest matrix:**
   - Place road, all zone brushes, park, power plant, trolley, bulldoze, inspect.
   - Orbit, pan, zoom, iso reset; confirm paint does not orbit.
   - Pitch to horizon; pick a far tile; confirm highlight matches status bar coords.
   - Save / load / new city: meshes rebuild, no orphan boxes.
   - Toggle each overlay after height exists.
   - Grow a city ~2 minutes at default clock; watch FPS with Babylon inspector (dev only).
3. **Visual:** powered vs unpowered; trolley vs street; water below ground.
4. **Licence:** no Micropolis sheet in the network tab.

`openpublica/docs/README.md` Phase 1/2 checkboxes should be updated when the 3D milestone ships so they stop claiming overlays/sim are missing.

---

## 10. Recommended first implementation PR (after this plan)

**Phase A only:** perspective camera + sun/shadows + input split + iso preset.

That single PR proves the 3D camera without committing to an art pipeline. Phases B–D are the actual “city in 3D” work.

---

## 11. Decision log

| Decision | Choice | Why |
|---|---|---|
| Engine | Keep Babylon.js 9 | Already in tree; WebGL2; inspector; instances; glTF. |
| Host | `openpublica/` only | Canvas game stays reference; avoid dual-renderer in `src/`. |
| Art | Procedural kits, then optional original/CC0 GLB | Licence; no EA tile identity. |
| Sim | Frozen during A–D | 3D is a presentation project. |
| Camera default | Perspective with an iso preset | “Fully 3D” without abandoning city-builder readability. |
| Elevation in sim | Later | Height can be render-only until it should affect land value. |
