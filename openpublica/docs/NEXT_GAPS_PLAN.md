# OpenPublica — Next gaps (after Phases A–H)

**Date:** 2026-09-20  
**Base:** 3D presentation Phases A–H are playable in `openpublica/` (perspective camera, heightfield + water, extruded roads, instanced kits, parks/trees/smoke, moving traffic, unified overlays, minimap/sun/quality, city/settings chrome, MIT simplex hills).

This is an implementation plan for **what is still missing**, not a licence to rewrite sim formulas or import Micropolis art.

---

## 1. Audit verdict

The city is already a **perspective 3D WebGL city**, not an orthographic postcard. The remaining work is:

1. **City-health simulation** the HUD pretends to care about but cannot yet play (crime, fire, evaluation, density).
2. **Honest player feedback** when growth stalls or the city is sick.
3. **Presentation depth** leftover after C1–C2 (optional GLB/SSAO). Untextured PBR + sky dome are shipped.
4. **Coordinator leftover** (`App.ts` still lists tools and HUD; mesh rebuild and city file live in `CityView` / `cityFile`).

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
| C1 Materials **shipped** | Untextured PBR colours (roughness) on terrain, kits, roads, water, trees, traffic | Micropolis sheets as albedo |
| C2 Sky **shipped** | Inverted sky dome, vertex horizon→zenith; fog + sun slider still drive it | Full atmosphere / SSAO in C2 |
| C3 Terrain read | Slight grass/dirt variation already from simplex; optional skirt on the city mesh | Change lake topology |
| C4 GLB (optional) | `@babylonjs/loaders` + `visualRef` + `ASSET_LICENSE.md`; procedural fallback | EA-looking kits |
| C5 PostFX | SSAO/FXAA only after a filled-city frame-time check on High quality | Always-on SSAO |

**Exit:** Horizon and materials read 3D without a second engine.

### Gap D — Tooling and structure

| Slice | What to ship |
|---|---|
| D1 `npm test` | `openpublica` script that runs root Jest (done in this polish PR) |
| D2 Split `App.ts` **shipped** | `CityView` rebuilds meshes; `mountCityMenu` owns save/load |
| D3 Render tests | Keep GPU tests out of Jest; add a few more **pure** layout tests (picker math, daylight lerp) |

### Gap E — Roads, traffic, road services, bridges **shipped**

An audit found the road layer telling small lies: jams could not be fixed by
adding roads (every road within three tiles took a full copy of each
building's traffic), highways cost 2.5× a street for no effect, cars sped *up*
in traffic, police and fire covered lots across lakes with no road at all, a
single trolley tile gave transit access though no trolley could run, a street
dragged across a highway downgraded it, and hover previews never fired for a
mouse. This slice names the traffic, transit, and service fields it changes.

| Slice | What shipped |
|---|---|
| E1 Traffic | `TrafficPressureSystem`: a lot's trips leave by its street (no street, no trips) and flood only the connected roads within 3 tiles. When a building reaches more road than `TRIP_SPREAD_BUDGET`, the same trips split across it, so a parallel street or highway relieves the jam. Highways draw and carry `HIGHWAY_CAPACITY` (2×). |
| E2 Cars | Congestion slows cars (half speed at pressure 8, floor 30%); highways are 1.5× faster; trolleys keep rail pace. Cars ride the rendered deck height and pitch on slopes; parked cars rejoin when roads return. |
| E3 Road tools | Highway / trolley paint upgrades streets; nothing downgrades a highway or trolley line without a bulldoze, so crossing strokes leave intersections. Failure copy names the reason. |
| E4 Services on roads | Police and fire (`roadDispatch`) need power **and** a street; reach is `policeRadius` / `fireRadius` = 14 road steps (highways ½ step, lots up to 2 tiles off the curb, never across water). Placement preview paints reachable tiles, not a disc. Advisory flags stations with no street. |
| E5 Transit | Only trolley lines of `MIN_TROLLEY_LINE_TILES` (4) connected tiles radiate transit; the renderer runs one trolley per 8 line tiles on those lines only. |
| E6 Bridges | A road on water is a bridge (no save change: water terrain + road type). Straight spans only: no turns, junctions, or side streets over water. 5× build cost, 3× upkeep, no driveways. Level decks between abutments (never below water + 0.2) with railings, girders, and piers; overlay, cursor, and cars sit on the deck. Budget shows "Roads now". |

**Exit:** Adding a parallel street visibly lowers a jammed street's pressure; a
fire station across an unbridged river covers nothing there until a bridge is
built.

### Gap F — Water edges **shipped**

A second audit measured the shoreline: about 90 tiles per map that the sim
calls dry land had their centres under the water plane (down to -0.48), so
players zoned, paved, and built on what looked like lake. Heights only exist at
tile corners, and every corner touching water was pulled under.

| Slice | What shipped |
|---|---|
| F1 Corner shaping | `shoreline.ts`: a corner's height steps with how many of its four tiles are water (1 → low beach above water, 2 → the waterline, 3 → shallows, 4 → bed), so the shore follows tile edges. |
| F2 Thin features | `smoothShoreline` at generation: one-tile spits, isthmuses, points with water on two sides and most diagonals, and one-tile notches are removed. Over 200 seeds every dry centre is ≥ 0.087 (surface 0.06) and every water centre ≤ -0.11; water area is unchanged within a few percent. Saves keep their terrain. |
| F3 Footing | `HeightField.footing`: roads, buildings, trees, smoke, and the cursor stand at least 0.04 above the water, covering thin spits in older saves. Trees sample the ground under each trunk and skip spots in the water. |
| F4 Picking | A ray that hits water or terrain under a bridge is marched back against deck heights, so clicks and hovers land on the deck the player sees. |
| F5 Junctions | Where a highway meets a street (or trolley), the wider arm necks down with short curbs so decks meet flush. |
| F6 Waterfront | Dry lots touching water get +8 land value, two tiles back +4. |

### Gap G — Terrain surface **shipped**

A third audit measured how objects meet the ground. Tiles were two triangles
on a fixed diagonal while everything was placed at the corners' average, so
things floated or sank by up to 0.16; the per-tile normals all pointed down,
so the sun never lit the ground and the tile grid showed; hills poked through
road decks on 5% of road tiles (up to 0.21); and the downhill side of 5% of
buildings floated up to 0.1.

| Slice | What shipped |
|---|---|
| G1 Tile fans | Each tile is four triangles around a centre at the corners' average; `HeightField.sample` follows the same surface, so roads, buildings, trees, and cars sit on the ground drawn. Overlay and reach tints use the same fans. |
| G2 Normals | Shared analytic normals per corner and centre: hills shade with the sun and the grid is gone. `TERRAIN_ALBEDO_SCALE` keeps flat ground near the old tone. |
| G3 Grading | Corners touched by land roads sit at the mean natural level of those roads (never shoreline corners); `regrade` runs on paint and bulldoze and re-seats terrain, roads, bridges, overlay, trees, buildings, and car decks nearby. Shore roads ride their dry corners over an earth embankment. With a street grid on four seeds no deck is under the ground. |
| G4 Foundations | Buildings on slopes stand on a stone plinth down past the lowest ground in their footprint. |
| G5 Edge | An earth wall (a blue cut through water) closes the map edge. |
| G6 Details | Corner street trees take the side with no road arm; cars keep a gap behind the car ahead in their lane instead of stacking. |

Hill noise was measured too: dropping the finest octave changed tile
bumpiness by about 3%, so hills are unchanged.

### Gap H — Placement and turns **shipped**

A fourth audit looked at how roads get laid and how things sit along them.
Kits front on +z, so 57% of buildings in a grid town turned their backs or
sides to every street. A diagonal road drag left a freehand staircase, and
the only feedback on cost, bridges, or refusals came after the fact. The cursor
looked the same over tiles every tool would refuse. Cars snapped from one
lane to the next at every node, so they jumped sideways and spun in place at
corners.

| Slice | What shipped |
|---|---|
| H1 Facing | `buildingFacing`: a building turns toward its land-road frontage (trolley avenue, then highway, then street; ties N, E, S, W; bridges are not frontage). Foundations turn with it and re-orient when a road is painted beside the lot. |
| H2 Road lines | Road tools press to anchor and drag a line: the longer axis first, one turn. `planRoadLine` dry-runs it in order (earlier tiles count for the bridge rules, money runs down) and tints each tile build, bridge, upgrade, keep, or skipped; the status line gives tiles, bridges, and cost; release builds through the normal stroke. Esc cancels, Shift paints freehand. |
| H3 Cursor | Tools gain an optional `canApply` dry run; the hover cursor turns red where the active tool would refuse (water or an occupied lot for a zone brush, an empty tile for the bulldozer, a bad station site, a road blocked by a building or the bridge rules). It re-tints on tool switch and after release, and while dragging a line it shows the end tile's verdict. |
| H4 Turns | `vehiclePose`: cars leave each node on a short quadratic curve from their incoming lane to the outgoing one (the next hop is chosen before the node), and dead ends loop onto the other lane. In the browser at a fixed 16 ms step no car moved more than about twice its median frame step. |
| H5 Details | Plan and reach tints on shore tiles stay above the raised beach instead of hiding under it; the page has an inline favicon, so loading no longer logs a 404. |

### Gap I — Large zones **shipped**

A fifth audit zoned big areas. Every zoned lot re-ran the whole-city refresh
(traffic, smog, land value, crime, water: about 1.6 ms a lot in the ES2020
build), and the view rebuilt the overlay, power tint, smoke, and traffic graph
per lot too, so zoning 1,300 lots took over 2 seconds of sim time alone. Zoning was a one-tile
brush. In a 48×48 area, about half the lots had no street beside them and
could never grow, with no warning. Growth rolled every lot every month, so a
big zone sprouted 200–580 buildings in its first month regardless of demand,
then emptied as crime caught up, and what grew was scattered across the area.

| Slice | What shipped |
|---|---|
| I1 Batching | `CitySim.batch` defers derived-state refresh to one pass (every refresh recomputes from the map, so results match). `ToolController.applyTiles` applies a list in one batch and reports the changed tiles together; `CityView.syncPaintedTiles` keeps per-tile work local and runs map-wide refreshes once. 1,296 lots: 2.1 s → 3 ms in the sim (ES2020; Jest's ES5 build runs these loops about 10× slower); a 107-tile area releases in about one SwiftShader frame. |
| I2 Areas | Zone brushes and Dezone drag a rectangle (`planZoneArea`): each tile is tinted zone, no street (amber), street, clear, already zoned, or skipped (building, funds); the status line gives lots, streets, cost, and lots that will wait. Release applies it through the tools. Esc cancels, Shift paints freehand. Road lines and zone areas share `PlannedDragInput`. |
| I3 Streets | `autoStreetLayout`: where lots would have no street, the area lays one every third line along its long side (two-lot blocks), plus a spine down a short side when needed to reach the existing roads. Pieces cut off by water are dropped, and it never bridges or paves through buildings. It only paves when each new street tile gives at least half a lot a new frontage, so an existing grid is left alone. S toggles it. |
| I4 Pace | `monthlyGrowthBudget`: each zone type fills at most 4 + demand/4 lots a month, scaled up by city size (doubling per 1,000 residents plus jobs). When more lots pass their roll, lots beside buildings are 8× likelier to be kept, so zones fill outward. A 45×45 zone now grows about 15 a month instead of 264–580 in month 1, with about 1.6–1.9 neighbours within two tiles of each building instead of 1.1. The lot hint shows the pace. |

### Gap J — Frame cost **shipped**

A sixth audit loaded a 64×64 test city (about 570 buildings, 1,200 road tiles,
52 civic buildings). The scene held 20,461 meshes: every road curb, dash, berm,
arm, pad, and crosswalk, every tree trunk and canopy, and every foundation was
its own instanced node. Babylon culled and updated each one every frame: 34 ms
of active-mesh evaluation per frame (SwiftShader), before drawing anything.
Month boundaries added a 50–140 ms frame. The sim itself was not the problem:
a month costs about 18 ms in the ES2020 build.

| Slice | What shipped |
|---|---|
| J1 Thin instances | `ThinInstanceGroups`: road pieces, trees, and building foundations are thin instances of their shared sources, grouped per tile; an edit rewrites only the sources it touched. Meshes 20,461 → 719; active-mesh evaluation 34.2 → 2.6 ms; SwiftShader frame 58.6 → 11.8 ms. Buildings stay instanced (selection draws their bounding box). |
| J2 Month frame | The traffic renderer skips rebuilding its graphs when `roadNetworkKey` is unchanged (monthly traffic only changes the car count); street trees re-plant only when a street crosses the busy threshold. Month frames 47–103 → 32–68 ms. |
| J3 Growth | Lots already past the smog or crime stress level no longer grow a building that would leave four months later; the lot hint says why (move plants and factories away, add parks, or police). Futile growth in the test city fell by about a third. |
| J4 Cleanup | Removed the unused `ResidentialTool`, and the console warnings per unaffordable road tile or civic building (the status line already explains). |

### Gap K — Utilities follow the streets **shipped**

A seventh audit looked at services, utilities, and how a player connects them.
Police and fire already drove the road network, but power and water were
discs: radius 8 around every plant, radius 10 around every powered tower, no
capacity, crossing lakes, ignoring roads. A town of 384 lots with its plant
out on the arterial got no power at all; powering it meant ten plants inside
the town ($800/mo), which left buildings at pollution 50 and land value 4.

| Slice | What shipped |
|---|---|
| K1 Street grid | `utilityGrid.distributeAlongStreets`: a plant feeds the streets its lot touches and every street joined to them (bridges and highways included); plants on one network pool their capacity (`powerCapacity` 400, residents plus jobs). Lots beside a live street draw their load nearest first; the far end of an overloaded network goes dark. Roads and zone edits now refresh power. The same town with one plant out west: 354 of 384 lots powered, population 178 (was 63); four plants there power everything for $320/mo. |
| K2 Mains | Powered towers feed water mains along the streets the same way (`waterCapacity` 600). Only lots draw water; bare ground stays dry. |
| K3 Seeing it | Hovering a plant or tower tints its network (short lots red); the plant and tower tools preview the streets a new one would join, and the old nearest-plant disc is gone. The Power map shows live streets; parks no longer show as dark. |
| K4 Telling it | Hints give each grid's load, supply, lots fed, and shortfall, or ask for a street; the hint stays after placing. Advisories tell apart a plant or tower with no street, buildings off the grid ("connect their street"), and plants at capacity ("add a plant on the grid"). The HUD shows Power load/supply, red when 90% full or short. |

Saves from before this change keep their buildings; a plant placed away from
any street now reports that it has none.

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
7. ~~**PBR + sky** (C1–C2).~~ Shipped: metallic-roughness colours (low IBL) + fog-matching sky dome.
8. ~~**App.ts split** (D2).~~ Shipped: `CityView` + `mountCityMenu`.

GLB (C4) and SSAO (C5) stay optional. C3 skirt is optional.

---

## 6. Verification for later slices

- Root `npm test` (or `cd openpublica && npm test`) stays green.
- No `@babylonjs` imports under `src/sim/`, `src/tools/`, `src/save/`.
- Network tab still has no `tiles.png` / `sprites/`.
- Play: grow a city, toggle Smog, Frame, Save/Load, mute, Dawn/Dusk.
- First minutes: Road is selected; HUD coach steps street → lots → plant; fire/water nags wait until population 40.
- Services: hover a plant/park/tower to see its coverage disc, or a police/fire tool over a lot to see the streets it reaches; Budget lists civic and road upkeep; water raises land value on covered lots.
- Roads: drag a street straight across a river (status names the bridge tiles), drag one across a highway (the highway stays), and watch Traffic drop on a jammed street after a parallel street is joined up.
- Water: from an angled camera, hover the edge of a bridge deck (the cursor sits on the deck); beach lots show dry ground to the water's edge; Value shows the waterfront premium.
- Terrain: drag a street across a hillside (the ground levels under it, no grass through the deck); hills shade with the sun at Dawn/Dusk; tilt the camera low at the map edge to see the skirt.
- Placement: with Road, drag an L across a lake so it turns on the water (blue bridge tiles, the turn tile red, status gives cost and bridges), press Esc before releasing (nothing is built), then release a line on land; Shift-drag paints freehand; hover water with a zone brush (red cursor); shops along a street face it; cars curve through corners.
- Zoning: with Z, drag a 12×9 area beside a street (grey street rows, blue lots, status gives lots/streets/cost), press S (streets drop, lots turn amber), press S again and release (one quick build); run at 4× and watch houses fill along the new streets a few a month.
- Frame cost: load a large city and check the scene holds a few hundred meshes, not tens of thousands; paint and bulldoze a road and reload the save (road pieces appear, vanish, and match after load).
- Utilities: place a plant beside a street at the edge of town (the whole joined network previews yellow), watch Power in the HUD, hover the plant to see what it feeds, place one in an empty field (the status asks for a street), and add a water tower beside a powered street.
