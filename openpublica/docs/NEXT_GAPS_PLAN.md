# OpenPublica — Next gaps (after Phases A–H)

**Date:** 2026-09-25 (first written 2026-09-20)  
**Base:** 3D presentation Phases A–H are playable in `openpublica/` (perspective camera, heightfield + water, extruded roads, instanced kits, parks/trees/smoke, moving traffic, unified overlays, minimap/sun/quality, city/settings chrome, MIT simplex hills), and gap slices A–AL below have shipped on top.

This is an implementation plan for **what is still missing**, not a licence to rewrite sim formulas or import Micropolis art.

---

## 1. Audit verdict

The city is a **perspective 3D WebGL city** with a playable city-health loop:
every HUD number is simulated, shown on a map, explained by an advisory, and
checked against five scripted test cities (Gap N). The first audit's four
open items (city health, honest feedback, PBR/sky, the `App.ts` split) have
all shipped. What is left (section 5) is depth, not missing systems:

1. **Presentation** extras have shipped: SSAO as an opt-in after its full-city frame check (Gaps AB, AC), and GLB kits with a model for every building (Gap AE). What is left there is art: an artist's kit can replace the generated one.
2. **Happiness** now decides how many people move in (Gap AF): below 80, housing grows at a falling share of its demand, and at 30 or less residents leave.
3. **Tile interactions** were audited tool by tile (Gap AG). Every outcome was consistent and every refusal had a reason. Two drags were not right: a freehand stroke across water bought bridge spans that joined nothing, and the bulldozer cleared tiles as the pointer crossed them, with no preview. Both are fixed.
4. **Systems** were audited over ten-year runs of every test city (Gap AH). Shop demand now follows the residents instead of sitting at 100%. The advice names the real cause when buildings empty. High taxes keep an emptied town empty instead of letting it regrow and die in a loop. A loaded city now plays on exactly as the saved one would have.
5. **Strategy and gameflow** were audited with a scripted player (see [STRATEGY_AND_GAMEFLOW.md](./STRATEGY_AND_GAMEFLOW.md)). Careful play builds a thriving town, but the game has no goals, its score ranks failure above success, mixed use dominates, and taxes are free up to 11% and a cliff at 12%. That document plans the fixes (G1–G11).

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

**Sim formulas change only inside a named slice** that states the old and new
numbers and the test city that measured the change (as Gaps E, I, K, N, O, and
S do). Nothing else retunes growth, tax, power, traffic, walk, or transit.

---

## 3. Major gaps (player-visible or architecture)

Ordered by what a player actually hits, then by what other work depends on.

### Gap A — City-health loop (sim + HUD)

The HUD shows Poll / Happy / Walk / Transit plus Crime / Fire / Water / Score. Density, police, fire, crime, evaluation, and water coverage are playable, and degradation (B2) has shipped.

| Slice | What to ship | Must not |
|---|---|---|
| A1 Density **shipped** | `tile.populationDensity` from residential/mixed buildings; Crowd overlay | Port Micropolis `populationDensityScan` tables |
| A2 Police **shipped** | Station def + tool + coverage radius like power; `tile.policeCoverage` | Sprite cops |
| A3 Crime **shipped** | `tile.crime` from density, land value, police; HUD average | Hidden Micropolis crime RNG as-is |
| A4 Fire **shipped** | Station def + tool + `tile.fireCoverage`; Fire overlay + HUD average | Disasters in the same PR |
| A5 Evaluation **shipped** | Monthly score / approval / top problems from pollution, crime, traffic, taxes, power, bankruptcy | Census graphs in the same PR |
| A6 Roads + water **shipped** | Highway tool + maintenance; `tile.watered` from powered towers; HUD Water / Mains overlay | Power-line network (since superseded: Gap K runs power and water along the streets); growth/tax formulas |

**Exit:** A grown city can be “unsafe” or “underserved” in HUD + overlay without opening the console.

### Gap B — Honest growth and advice

Buildings **do** empty after sustained neglect. Status is city-local (HUD advisory) plus inspect hints.

| Slice | What to ship |
|---|---|
| B1 Advisory **shipped** | Structured messages (no power plant, bankrupt, smog spike, no road access) in the HUD feed |
| B2 Degradation **shipped** | Zone buildings downgrade or leave after 4 stressed months (no road or power, smog, crime); a want of demand alone thins a zone 5% a month (Gap N); factories ignore smog; 2-month grow cooldown | Disasters; Micropolis decay tables |
| B3 Downtown **shipped** | Commercial/mixed land-value boost from the residential centroid; honest zone plats (no painting roads/buildings) |

**Exit:** A player who never places a plant sees a clear advisory, then empty lots, not a silent stall.

### Gap C — Presentation depth (render only)

| Slice | What to ship | Must not |
|---|---|---|
| C1 Materials **shipped** | Untextured PBR colours (roughness) on terrain, kits, roads, water, trees, traffic | Micropolis sheets as albedo |
| C2 Sky **shipped** | Inverted sky dome, vertex horizon→zenith; fog + sun slider still drive it | Full atmosphere / SSAO in C2 |
| C3 Terrain read **shipped** | Grass/dirt variation from simplex; the earth skirt (Gap G); lawns, yards, and woods (Gap L) | Change lake topology |
| C4 GLB **shipped** (Gap AE) | `@babylonjs/loaders` + `visualRef` + `ASSET_LICENSE.md`; procedural fallback | EA-looking kits |
| C5 PostFX **shipped (opt-in)** | SSAO/FXAA only after a filled-city frame-time check on High quality: checked in Gap AB, shipped in Gap AC as a Settings toggle, off by default | Always-on SSAO |

**Exit:** Horizon and materials read 3D without a second engine.

### Gap D — Tooling and structure

| Slice | What to ship |
|---|---|
| D1 `npm test` **shipped** | `openpublica` script that runs root Jest |
| D2 Split `App.ts` **shipped** | `CityView` rebuilds meshes; `mountCityMenu` owns save/load |
| D3 Render tests **shipped** | GPU stays out of Jest; every pure render module has tests (deck picking, sky colours, weather looks, road layout and decks, vegetation, kits, facing, foundations, skirt) |
| D4 Faster tests **shipped** | Jest compiles to ES2020 (`tsconfig.jest.json`; the build's ES5 iterators made the sim loops much slower), and each test city has its own file (`test/testCity.<id>.ts`) so the five build in parallel. Each city builds once per run, recording a snapshot every month for the checks that used to build it again (`test/support/testCityChecks.ts`). Full run, warm, 4 cores: 44 s → 22 s; Metro is the longest file at about 15 s. |

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
| E6 Bridges | A road on water is a bridge (no save change: water terrain + road type). Straight spans only: no turns, junctions, or side streets over water. 5× build cost, 3× upkeep, no driveways. Level decks between abutments (never below water + 0.2) with railings, girders, and piers; overlay, cursor, and cars sit on the deck. Budget shows road upkeep, bridges included. |

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
| I1 Batching | `CitySim.batch` defers derived-state refresh to one pass (every refresh recomputes from the map, so results match). `ToolController.applyTiles` applies a list in one batch and reports the changed tiles together; `CityView.syncPaintedTiles` keeps per-tile work local and runs map-wide refreshes once. 1,296 lots: 2.1 s → 3 ms in the sim (ES2020; Jest compiles to ES2020 too, see D4); a 107-tile area releases in about one SwiftShader frame. |
| I2 Areas | Zone brushes and Dezone drag a rectangle (`planZoneArea`): each tile is tinted zone, no street (amber), street, clear, already zoned, or skipped (building, funds); the status line gives lots, streets, cost, and lots that will wait. Release applies it through the tools. Esc cancels, Shift paints freehand. Road lines and zone areas share `PlannedDragInput`. |
| I3 Streets | `autoStreetLayout`: where lots would have no street, the area lays one every third line along its long side (two-lot blocks), plus a spine down a short side when needed to reach the existing roads (Gap T ties long lines at both ends). Pieces cut off by water are dropped, and it never bridges or paves through buildings. It only paves when each new street tile gives at least half a lot a new frontage, so an existing grid is left alone. S toggles it. |
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

### Gap L — Ground and woods **shipped**

An eighth audit looked at the terrain tiles and how they meet zoning and the
other tile types. Hills are gentle (median drop 0.11 a tile, 90% under 0.19;
only shore tiles fall steeply to the lake bed), so slope needs no rules.
Dirt is beaches plus about 3% scattered specks, with no sim effect. The
problems were in how lots looked: every zoned lot, empty or built, was a flat
saturated swatch, so a city read as a pastel spreadsheet with no grass left;
zone and building colours bled into the lake bed along every waterfront; and
open land was bare green with nothing for the city to replace.

| Slice | What shipped |
|---|---|
| L1 Lots | Empty zoned lots are tinted plots: 90% zone colour at the edges (the lot line), 55% at the centre so the ground shows through. Grown buildings stand on mown lawn (R), pavement (C), gravel yards (I), or warm paving (M); the kit carries the zone colour. |
| L2 Shore | Corners that touch water blend natural colours only, and a waterfront plat fades to the bank there, so no zone or yard colour tints the lake bed. |
| L3 Woods | `sim/woods`: a seeded noise field marks groves on open grass (about 22% of it); zoning, paving, or building on a tile clears it. Lots beside the woods get +6 land value, two tiles away +3. The renderer plants 2–3 trees per grove tile and the odd lone tree, as thin instances with a low-poly canopy (drawn indices 9.5M → 0.9M on a fresh map). The zone preview says how many wooded tiles it clears; inspecting woods explains them. Low quality drops groves with street trees. |

### Gap M — Menu and UI **shipped**

A ninth audit measured the chrome at 1920×1080, 1400×900, 1280×720,
1024×768, and a 390×844 phone. The left rail was a flex column that squeezed
the tool list: at 1280×720 the toolbar was 20px tall with no tools showing,
and at 1400×900 the zone and service tools were cut off. The HUD ran 22px
under the Budget panel, and on a phone the tool strip covered the camera bar
and minimap.

| Slice | What shipped |
|---|---|
| M1 Rail | Tools sit two to a row in groups (look/clear, roads, zones, services) with their shortcut key on each button; the rail is 200px and the toolbar 301px tall at every desktop size, with no rail scroll. Tool names lost their emoji; buttons carry `aria-keyshortcuts`. Settings starts folded below 980px tall. |
| M2 Layout | The HUD ends 10px short of Budget at every width. On a phone the tools are one 51px scrolling strip, and the camera bar, look panel, and open Settings sit above it. |
| M3 Polish | Buttons, inputs, and selects use the UI face instead of the browser's Arial. Instanced buildings and cars no longer set shadow flags on each instance (about 100 console warnings on every load). |

### Gap N — Test cities **shipped**

The cities used for audits were hand-made saves in a scratch folder: two,
both flawed (4×4 blocks whose middles had no street, plants among houses),
and nothing in the repo could rebuild them. `src/scenarios/` now scripts five
cities with the player's own tools and prices (`CityBuilder`: road lines,
zone rectangles with auto streets, service clicks, months), grows them with
seeded dice, and logs anything a tool refuses. Open one with `?city=<id>` or
from the New confirm; `test/testCity.<id>.ts` builds each once and checks it.

| City | Seed, budget, time | What it shows | Where it ends |
|---|---|---|---|
| `hamlet` | 11, $10,000, 2 years | The first hours: a crossroads, shops, a few factories, one plant past town, woods all round | 140 people, 120 jobs (its workshops grown into factories), power 260/400, treasury $17k |
| `riverside` | 2026, $40,000, 2½ years | A street bridge and a highway bridge; the plants are all on the north bank and light the far one across the bridge; shore lots, a bridgehead park, a far-bank tower, factories across the lake | 464 people, 480 jobs (works along the highway), both banks lit by three north-bank plants and policed by a station each (no building over the crime line), waterfront valued above inland, the south bank's commuters on the street bridge |
| `metro` | 7, $120,000, 4½ years in 3 phases | Zone areas with looped auto streets, a highway, a trolley line crossing it at grade, downtown, mixed use, industry, six plants, four towers, four police and three fire stations, parks, a downtown of office blocks | 973 people, 999 jobs, 17 office blocks on land worth 83–100, fire cover on 134 of 325 buildings, one house struggling at the far corner of the west district, power 2008/2400 (growth waited for each new plant), one 36-tile trolley line, 5 dead ends (all scripted road ends) |
| `troubled` | 101, $30,000, 3 years | Blocks four lots deep, a plant among the houses, factories next door, no police, a tower with no street, a police station on a dark street, taxes raised to 16/14/14 | 150 lots with no road, power 399/400 with dark houses, approval 0 |
| `sprawl` | 314, $60,000, 3½ years | A highway across the map with cul-de-sacs, a shopping strip, an industrial park; one plant at the west end until month 30, a second at the far end, a third at month 36 as the park turns into factories | With one plant, growth waits at the grid's capacity (population steady at about 220, nothing dark); each new plant lets it grow on (584 people, power 1198/1200, and the grid-full advisory) |

Building them turned up six sim faults, now fixed:

| Fault | Found in | Fix |
|---|---|---|
| Density saturated at 100 on any street of small houses (6 per resident over radius 4), so crime ran 69–85 before police and the first village churned (population 96 → 28 → 80) | hamlet | 2 per resident: a street of houses settles near 50 (crime about 40, under the stress line of 50); rowhouse and main-street blocks still reach 100 and need police |
| Demand at 0 stressed every building of a zone at once, so the whole town left in the same month (128 → 0) and regrew from starter demand | hamlet | Demand alone thins a zone by 5% a month (at least one), least valued first; a town settles where its jobs are. Power, road, smog, and crime still drive buildings out on their own |
| Factories counted their own smog: each workshop fouled its neighbours past 60 and the district emptied and regrew (17 → 7 → 15 workshops) | troubled | Smog stresses and blocks homes and shops, not industry (58 workshops hold) |
| The street between two rows of small houses, the plat the zone tool lays, read 13 traffic (jammed at 8); every real city sat near 0 happiness and had no street trees | metro | Trip rates 0.3 rounded up per house, 4 per shop, 6 per workshop → 0.15 per resident, 2, 3: small houses 4, rowhouses 8, shops on both sides 13. Happiness loses 80 × the jammed share of roads (short networks count as 20) instead of 2 per jammed tile. Metro 0 → about 90 |
| A zone area drawn a tile or two off a road laid an island street grid, and its houses stayed dark | riverside | The grid lays a straight stub of up to 4 tiles to the nearest road (never a bridge) when it would not otherwise join one |
| Month end published power load and the census from before buildings left, so the HUD disagreed with a reload of the same city (load 202 vs 194) | every save round trip | Power and the census are refreshed at month end |

The emptying advisory now names its cause: more homes than jobs, the dark,
smog, or crime.

### Gap O — Economy **shipped**

A tenth audit ran the five test cities' books month by month. Every one took
in three to five times its upkeep: the $10,000 hamlet banked $650 a month,
the troubled town $1,000, and Metro grew from $120k to $250k in four years,
so money stopped mattering a minute in. The Budget panel mixed last month's
bill with today's projection under labels like "Last billed" and "Civic now".

| Slice | What shipped |
|---|---|
| O1 Rates | Tax take per resident or job at 1% goes 0.5/0.4/0.3 → 0.3/0.25/0.2 (res/com/ind); street, highway, and trolley upkeep 2/4/5 → 3/6/8 a tile (bridges still ×3). Taxes now cover upkeep about 2× in the hamlet, 2× in Sprawl, 1.3× in Metro and Riverside; treasuries grow, slowly. |
| O2 Budget panel | Taxes, civic upkeep, road upkeep (marked when snow adds plowing), and net for this month at today's city and weather; last month's bill below; a warning with the months left when the net is negative, or that nothing can be built in debt. Each tax row shows its rate and its take; the rows explain what a point of tax does to demand. |
| O3 Warning | An advisory once a deficit would empty the treasury within a year: "The budget is $192/mo in the red — money runs out in about 5 months." |

### Gap P — Time **shipped**

| Slice | What shipped |
|---|---|
| P1 Hidden tabs | A frame counts for at most 0.25 s of sim time. Browsers stop drawing a hidden tab, so the first frame back could span minutes, and the city aged a month for every 30 seconds away, unwatched. |
| P2 Calendar | The HUD shows the day ("Jan 12, 2004"), ticking through each 30-second month; the speed buttons say how long a month takes at each speed. |

### Gap Q — Weather **shipped**

`sim/weather`: each game month has one spell drawn from its season's odds
with dice fixed by the map seed and the month, so a city's weather survives a
reload and a test city builds the same every time. `?weather=<kind>` pins it
for testing.

| Kind | Season | Effect |
|---|---|---|
| Heatwave | summer | Power load +15%, water load +25% |
| Snow | winter | Road upkeep +50% (plowing), power load +10% |
| Rain / Storms | spring–autumn | A fifth / a third of the smog washed out |
| Clear, Cloudy, Fog | all | Looks only |

The HUD shows the weather and temperature (amber when it costs you) with a
tooltip giving its effect and next month's weather; an advisory warns a month
ahead when a heatwave would push power or water past capacity. On screen,
each kind sets the sun, sky, fog, and shadow strength over the Dawn–Dusk
slider and rolls in over three seconds; rain and snow fall around the camera;
snow lies on ground, lawns, roofs, and tree tops (a PBR material plugin on
upward faces) while roads stay plowed, and lingers in freezing months;
storms flash (not with reduced motion) and thunder; rain hisses. Low quality
drops the falling rain and snow and the lightning. Reloading no longer leaks
a terrain material.

### Gap S — Shops grow up **shipped**

The test cities kept running short of jobs: Metro's shop demand sat at 100%
with every commercial lot built, and three of five cities ended with houses
emptying for want of work. Shops had one building (a 3-job small shop) while
housing and mixed use had two and three sizes, so a busy downtown could never
hold more than 3 jobs a lot.

| Slice | What shipped |
|---|---|
| S1 Buildings | Shop Row (7 jobs, walkable) and Office Block (14 jobs) join the small shop as the mid and top commercial tiers, on the same land-value and demand bars as housing (45/35 and 70/60). New kits: a two-storey row with an awning, a glass-banded tower with a lobby. |
| S2 Traffic | Shops and factories make trips by job (2/3 and 0.6 a job), so a 3-job shop and 5-job workshop are unchanged and an office block draws its 14 jobs' worth. A downtown jams unless it gets a grid, transit, or a highway. |

Metro now ends with 20 office blocks and 10 shop rows: jobs 601 → 848,
housing demand 16 → 58, happiness 90 → 84 from the downtown traffic. Its
extra jobs outgrew three water towers, so its last phase adds a fourth.
Factories stay single-size: industrial demand settles near 20, below the
tier bar (section 5).

### Audit of the branch **shipped**

A review of every pass on this branch (roads through weather) turned up:

| Fault | Fix |
|---|---|
| After dragging a tax or sun slider it kept focus, and every shortcut handler treated any input as a text field: R, P, M, the speed keys, and Ctrl+S did nothing until you clicked elsewhere | One `ui/keys.keyBelongsToField` for all handlers: text fields and menus keep every key, a slider keeps only the keys that move it (so Home still frames the camera, not the tax to 0%) |
| In a heatwave or snow, hovering a plant printed its load unrounded ("48.300000000000004/400") | Rounded |
| The deficit advisory could say "about 1 months" | Singular |
| Every month re-ran a three-second weather transition, even into the same look | Only a changed look rolls in; the sim announces weather only when it changes |
| A deep zone area beside a bridge planned side streets onto the span, which the road tool then refused | Planned streets and stubs skip tiles that would branch off a bridge |
| Test cities opened framed on the whole map, the town a speck at one edge | Framed on the town; Home still frames the map |
| Snow reached a test city's rebuilt ground up to two seconds late | Laid at once |
| Rain, storms, and snow fogged the city at the default camera distance | Their fog starts past the default distance; only Fog hides the city |
| Docs said Budget shows "Roads now" and that plants and towers show a coverage disc | Corrected |

### Gap T — Transport **shipped**

An audit of roads, traffic, bridges, and the trolley against the test cities
found:

- Metro's trolley line was cut in two by the highway it crossed. The trolley
  tool keeps a highway it is dragged over, and lines did not join across it,
  so no trolley ever crossed and each half ran as its own line.
- Upgrading a street to a highway or trolley avenue charged the full new
  price, as if the street were not there.
- Transit took a flat 4 off every road near a line. Quiet streets and the
  trolley avenue itself read zero traffic, while a jammed street stayed
  jammed, so a trolley line did not fix the jam the advisory sent players to
  fix with it.
- The traffic advisory suggested "a highway", but trips stay within three
  tiles of home. Metro's highway, which no lot fronts, carried a mean pressure
  of 0.6 while the streets beside it jammed.
- Auto streets ended in a dead end on the far side of every zone area (Metro
  had 26 dead ends, Riverside 12).

| Slice | What shipped |
|---|---|
| T1 Level crossings | `levelCrossingAxis`: a street or highway tile with trolley avenue running straight at it from both sides (and the road running on across) carries the line at grade. `trolleyLines`, transit, and the trolley graph join across it: trolleys go straight over, never onto the road. The road kit sets rails into the paving and keeps lane marks and crosswalks off them. Two parallel avenues with a street between them do not form a ladder of crossings. Inspect names the crossing, and the trolley tool explains a highway click as a crossing rather than "bulldoze it first". |
| T2 Upgrade price | `roadPaveCost`: paving over a street pays the difference (highway $15, trolley $20; bridges at the bridge prices). The drag preview and the tooltips say so. |
| T3 Transit relief | `transitRelief`: a road sheds up to `TRANSIT_TRIP_SHARE` (half) of its trips at full access, less with less access. A jammed street near a line gets real relief and quiet ones keep some cars. Replaying both rules on the same grown Metro, the flat rule leaves 85 jammed roads and the share 82. Inspect shows transit access. |
| T4 Honest advice | "Traffic is jammed on N roads — upgrade them to a highway or trolley line, or add a street behind the block." Each fix was measured on Hamlet's jammed high street: upgrading it to highway takes jams 10 → 2, to trolley 10 → 2, and streets behind both sides 10 → 0. |
| T5 Looped auto streets | Lines of `LOOP_MIN_LINE` (8) tiles or more are tied at both ends, by a run of up to two tiles to a road just past the area, or else a spine down the far side. The loop is dropped when it would break the lots-per-street-tile bar. Spine tails past the last line go back to lots. |

| City | Before | After |
|---|---|---|
| Metro | 2 trolley lines (split at the highway); 26 dead ends; 76 jammed roads; police on 465 tiles; happiness 84; 1,074 people | 1 line of 36 tiles; 5 dead ends (the scripted road ends); 69 jammed; police on 580 tiles; happiness 86; 986 people (the second spines take lots) |
| Riverside | 12 dead ends; 292 people | 4 dead ends; 276 people |

**Exit:** A trolley line dragged across a highway runs through it: rails
cross the highway, trolleys cross, and Inspect says level crossing. A jammed
street clears when it is upgraded or given a street behind it.

### Gap U — Commutes **shipped**

Every trip stayed within three tiles of the building that made it. A highway
only helped the lots beside it, a bridge's mid-span carried nothing, and the
one street out of a district was no busier than its back streets.

| Slice | What shipped |
|---|---|
| U1 Routing | `commutes.ts`: every road tile knows its distance to a workplace street (road steps, a highway tile half a step, as police and fire drive). Each home's commuters enter at its street and roll downhill to work, splitting evenly between equally short routes, so a grid shares the flow and a district's way out carries all of it. The search runs once per round over a compact road graph, and the roll reuses the search's own order. |
| U2 Jobs with room | Workplaces take commuters in proportion to their jobs. One that draws more than its share looks farther away the next round (up to 10 rounds), so the overflow drives on to jobs elsewhere instead of every commuter stopping at the first shop street on the edge of a job district. |
| U3 Traffic | When a workplace is on a home's network, half its trips (`COMMUTE_SHARE`) commute, loading every tile on the way at `COMMUTE_LOAD` (0.15: 400 residents make 30 commute trips, adding about 4.5 to the one street out of their district on top of its own lots' trips). Homes with no jobs to reach keep every trip local, so the street calibration and the older tests are unchanged. |
| U4 Cars | `pickCarStart`: new cars appear on busy roads (weighted by pressure), and a road's commute share of them start as commuters. `pickCommuteNext`: a commuter drives downhill to work on the sim's final distance field, weighted by flow, turns at work, drives back up the routes commuters came in on, and turns again among the homes. Other cars still turn at random. The renderer only reads `sim.traffic.commutes`. |

| Measure | Before | After |
|---|---|---|
| Riverside street-bridge mid-span pressure | 0, 0, 1 | 2, 2, 3 (the south bank's commuters) |
| Jammed roads (Metro, Riverside, Sprawl) | 69, 8, 34 | 73, 12, 26 |
| Happiness (Metro, Riverside, Sprawl) | 86, 89, 78 | 84, 88, 81 |
| Metro office blocks | 13 | 11 |
| Traffic tick on Metro (Node) | 0.7 ms | 1.65 ms |
| Mean pressure under the 48 cars on screen (Metro, Riverside; road mean 4.1, 2.5) | 3.9, 2.5 | 7.3, 4.0 |

Metro's highway barely changes (mean 0.6 → 0.7) because it runs between the
homes and the shops across it: its commuters cross it rather than drive it.
The routing tests show a parallel highway taking the whole commute of a
street it shortens.

**Exit:** Open Traffic in `?city=riverside`: the street bridge carries the
south bank to work, and cars shuttle across it. A street between homes and
far-off jobs is busy along its whole length, not just at either end.

### Gap V — Industry grows **shipped**

Industrial demand drifted back to 20 every month whatever the city needed,
industry had one 5-job building, and three of five test cities ended with
houses emptying for want of work (Metro: 1,014 people, 705 jobs). Industry's
own smog keeps its land value near 0, so the land-value bars that grow homes
and shops could never grow a factory.

| Slice | What shipped |
|---|---|
| V1 Demand | `nextIndustrialDemand`: demand heads for a target of 20 plus 2 points per percent of residents without a job (10% idle → 40, 20% → 60), taxes moving the target 4 a point. It rises 4 a month and falls 8, so it chases unemployment without running away: a flat +4 while anyone lacked a job drove every workshop into a factory and overshot jobs past residents. |
| V2 Tiers | Factory (12 jobs, sawtooth roof, two stacks) and Industrial Works (24 jobs, hall, tank, conveyor, tall stack). `industrialTier` / `lotTier`: industry grows on demand, not land value — a factory needs the mid bar (35), and works need the top bar (60) and a highway within `FREIGHT_REACH` (3 tiles) for their freight, so heavy industry lines highways. More jobs mean more power, water, traffic, and smog, all through the existing systems. |

| City | People, jobs before | After |
|---|---|---|
| Hamlet | 104, 70 | 140, 120 (8 factories, no highway so no works; smog 41 trips the smog advisory) |
| Riverside | 308, 220 | 460, 468 (11 factories, 9 works on the highway) |
| Metro | 1,014, 705 | 1,070, 981 (35 factories; jammed roads 73 → 86, happiness 84 → 81) |
| Sprawl | 404, 342 | 616, 604 (34 factories) |

Riverside and Sprawl outgrew their plants, as a player's city would: each
script adds a plant (Riverside a third on the north bank; Sprawl a third at
month 36, after its second has lit the far end).

**Exit:** In `?city=riverside` the industrial strip along the highway is
works and factories; Hamlet's, with no highway, stops at factories.

### Gap W — Budget levers **shipped**

In the red, the only lever was taxes. `budgetLevers.ts` adds three more,
all in Budget:

| Lever | What it does |
|---|---|
| Safety funding (50–120%) | Police and fire upkeep and reach scale together (`fundedReach`: 14 road steps at 100%, 7 at 50%, 17 at 120%). The placement preview and hints show the funded reach. |
| Road funding (50–100%) | Road upkeep (bridges and snow included) scales down, but worn roads carry less: traffic × `roadWearFactor` (1.5 at half funding). |
| Bonds | $10,000 now, repaid as $12,000 over 24 months ($500/mo), up to 3 at once. Repayments are their own Budget row and count in the net and the runway. |

Plants and water towers always run at full cost. Levers are saved (`levers`
in the save; older saves load at full funding with no bonds). The bankrupt
advisory points to a bond; the deficit one to taxes or funding (a bond only
delays a deficit). Measured in the browser on Metro: safety at 70% cuts its
cost $240 → $168; roads at 80% cut $1,519 → $1,215.

**Exit:** Borrow in Budget and the treasury rises $10,000 with a $500/mo
repayment line; cut Safety and the police preview shrinks.

### Gap X — Growth within the grid **shipped**

A city kept growing after its plants were at capacity. Power goes nearest
first, so each new building took power from the far end: those lots went
dark, their buildings left, and the lots grew dark again. Sprawl's
population swung 344 → 157 → 543 around its second plant, and Metro spent
2,843 building-months dark.

| Slice | What shipped |
|---|---|
| X1 Power room | `PowerRoom`: each month's growth passes start from the last distribution, with each grid's spare supply. A new building, or a bigger one, only goes up where its grid can carry the extra load (weather included), and nowhere on a grid that already leaves a building dark. Lots no plant reaches still fill slowly, dark, as the opening coach expects. With load kept within supply, nearest-first distribution serves everyone, so growth never darkens a built lot. |
| X2 Telling the player | Inspect on a waiting lot: "waiting for power — its grid is full, so add a plant on these streets" (`CitySim.gridFullAt`). Advisory: "The power grid is full — N new buildings waited for power last month. Add a plant on the grid." (`stats.powerHeld`). |

| City | Dark building-months (peak) before | After |
|---|---|---|
| Metro | 2,843 (198) | 62 (19) |
| Sprawl | 2,088 (114) | 61 (17) |
| Troubled | 471 (35) | 39 (8) — its plant sits among built houses, by design |

What dark months remain are weather: a heatwave or snow raises every lot's
load past the grid for a month, which the forecast advisory warns about.
Metro now ends at 901 people instead of 1,070: it grows as fast as its plants
allow instead of overshooting them.

**Exit:** In `?city=sprawl`, Inspect an empty lot at the end: it is waiting
for power, and no house on the strip is dark.

### Gap Y — Buildings that shrink **shipped**

A building kept its size after whatever grew it was gone: Metro had office
blocks on land worth 36 (grown at 70), and works would have kept their size
without the highway that justified them.

| Slice | What shipped |
|---|---|
| Y1 Outgrown lots | `outgrownLot`: homes, shops, and mixed use are outgrown when their land value is more than `SHRINK_SLACK` (10) under the bar that grew them (an office block under 60, a rowhouse under 35); industry when it is in decline (demand under 10) or works have lost their highway. Weak demand elsewhere stays the stress pass's business. After `SHRINK_MONTHS` (6) straight outgrown months a building steps down one size, at most `demandExodusCap` (5%) of a zone a month, least valued first; the rest wait their turn. Inspect says "outgrown — … it steps down in N months". |
| Y2 Offices are walkable | Measuring the shrink showed why Metro's offices sat on cheap land: a shop row gives its block a walkability and land-value bonus, and the office block it grew into gave none, so upgrading pulled its own lot from 100 to about 27 and offices would shrink and regrow every seven months. Office blocks now have the shop row's `walkabilityRadius` (3). |

Two fixes the measurements forced along the way: industry is judged against
decline, not the growth bars (at full employment demand sits at 20, which
means no new factories are needed, not that the old ones are not; judging
works against 60 stepped every Riverside works down); and the monthly cap,
without which all 27 of Metro's factories stepped down in the same month
and jobs fell 963 → 674.

| Metro | Before | After |
|---|---|---|
| Office blocks at the end (mean land value) | 7 (36) | 13 (100) |
| Mixed use (flats / shopfront / main-street blocks) | 33 / 0 / 0 | 0 / 1 / 27 |
| People, jobs | 901, 870 | 1,064, 962 |

**Exit:** Inspect a building whose land value fell well under its size's bar:
it says it is outgrown and when it will step down.

### Gap Z — Crime in a policed city **shipped**

Metro ended with buildings emptying to crime although it had three powered
police stations; Riverside, with none, did too. The crime map showed why:

| Finding | Fix |
|---|---|
| Metro's west district had its only station on its west spine; a 14-step reach patrolled the western half, and the dense eastern half (small houses and rowhouses at density 60–79) ran crime of 51–65 | Metro's script adds a station on the district's east spine, and Riverside's a station on each bank (Troubled stays the city with no police) |
| Where two stations overlapped, a tile took the stronger coverage only, so the middle of a district between two stations got about 20 from each and 20 in all | `combineCoverage`: overlapping police and fire coverage add up with diminishing returns (two at 20 make 36, two at 50 make 75) |
| Metro's mixed-use core, one street in from the trolley, is reached only round its loop ends (13–14 steps from the station beside it) | Left as the player's call (another station), and logged as the next PR: cross streets through wide districts |

| City | Buildings over the crime line (crime average) before | After |
|---|---|---|
| Metro | 48 (27) | 10 (20) |
| Riverside | 37 (33) | 16 (25) |

**Exit:** Crime map in `?city=metro`: the west district is patrolled across
its width; what stays red is the mixed-use core behind its first street.

### Gap AA — Cross streets **shipped**

The crime pass (Gap Z) left Metro's mixed-use core unpatrolled: a zone
area's lines met only at its spines, so the inner lines of a wide district
were reached round the ends (13–14 patrol steps from a station across the
street), and commutes and trucks went the same long way.

| Slice | What shipped |
|---|---|
| AA1 Cross streets | `crossStreetOffsets`: two or more lines longer than `CROSS_STREET_SPACING` (9) get a cross street through the middle, one per nine to ten tiles (a 15-tile line gets one at its midpoint, a 19-tile line two), so blocks are five to seven lots long. The same lots-per-street-tile bar applies, and tails past the outer lines are pruned. |
| AA2 Metro's script | Its east-district police station moves off the new cross street to (55, 14), and its last phase runs six months longer: the extra streets cost Metro about 6% of its residential lots, and on that path its housing demand crossed the rowhouse bar only later. |

| | Before | After |
|---|---|---|
| Metro: buildings over the crime line / struggling / crime average | 10 / 13 / 20 | 10 (8 of them patrolled) / 0 / 15 |
| Riverside: buildings over the crime line / struggling | 16 / 11 | 0 / 0 |
| Residential lots given up to cross streets (Metro, Riverside) | — | 12, 10 (6–7%) |

A spacing of 12 kept those lots but left Metro with 26 buildings over the
crime line and 33 struggling, so 9 it is.

**Exit:** Zone a 15-wide area in the open: its lines meet at a cross street
halfway along as well as at both ends.

### Gap AB — Frame time in a full city **shipped**

C5 asked for a filled-city frame-time check on High before SSAO. The test
cities are not full (Metro builds on 9% of its land), so the check adds a
stress map: seed 7, a street every 15 tiles each way, sixteen zone areas with
their own streets and services, twelve months of growth, then every zoned lot
topped up with its zone's biggest building (1,671 buildings on 1,546 road
tiles, 26k thin instances). The container has no GPU (Chromium draws with
SwiftShader on the CPU), so the check measures what carries over to other
machines: JavaScript per frame (`scene.render()` back to back, render loop
stopped), the GPU's workload (draw calls, triangles per pass), and each
pass's share of SwiftShader's raster time (render plus a one-pixel readback),
which only ranks costs. 1280×720, High, a 2.1 GHz Xeon core.

| Slice | What shipped |
|---|---|
| AB1 Shadow casters | Of the road pieces, only embankments, girders, piers, and railings cast shadows. Decks, curbs, paint, and rails lie on graded ground, where their shadows were a texel wide at most, yet they were two thirds of the shadow pass (346k → 117k triangles). Bridges still shade the water through their girders. |
| AB2 Road boxes | `keepBoxFaces` trims the unit boxes the road pieces share: paint, crosswalks, and ties keep only their tops, and no piece keeps its underside (the camera stays above the ground). Road triangles in the main pass: 275k → about 200k. |
| AB3 Frozen buildings | Building instances compute their world matrix once, and again only when turned or re-seated: active-mesh evaluation at street level 3.7 → 1.5 ms. Thin instances would save the last 0.9 ms but lose per-building culling, so they stay instances. |
| AB4 One traffic pass a month | A month's last step routes traffic on its final layout; publishing the month routed it again. It now reuses it (a test checks a fresh recompute changes nothing). |
| AB5 Weather shaders at load | Rain and snow compile their shaders in the first frames. Left to the first wet month, the compile stalled that frame: 400–600 ms in Metro. |

| Full city | Before | After |
|---|---|---|
| JavaScript per frame, overview (median) | 4.7–4.9 ms | 4.4 ms |
| Draw calls | 78 | 73 |
| Triangles per frame (main + shadow) | 530k + 346k | 451k + 117k |
| SwiftShader raster (ranks costs only) | 1,607 ms | 1,283 ms |
| Month-end frame at 4× (app work) | 169 ms | 135 ms |
| Month-end sim alone (Node) | 38 ms | 28 ms |

Metro: 444k → 354k triangles, 65 → 57 draw calls, and its worst frame over
two months at 4× (with the first rain) 580 → 36 ms. The JavaScript side
leaves over 10 ms of a 60 fps frame free on a slow core, and the month end is
the only hitch. SwiftShader spends about 55% of the main pass on road pieces
and 20% on buildings, and a quarter of the pixels saves only 15%: it is bound
by vertices and instances, where real GPUs are bound by pixels, so the
triangle count is the number to compare.

**SSAO (C5).** Babylon's `SSAO2RenderingPipeline` (16 samples, blurred) takes
the prepass route on WebGL2: no second geometry pass, the same triangles,
four or five more draw calls, and no JavaScript cost. It adds 7% to the
SwiftShader frame at half resolution and 21% at full, a floor on its share
since SwiftShader underweights pixel work. It seats buildings and trees on
the ground, but at the default strength it also greys open ground and
shorelines. Verdict: ship it as an opt-in at half resolution, off by default,
and time it on a real integrated GPU before turning it on for everyone
(shipped: Gap AC).

**Exit:** Open a full city on High at 4×: the only stutter is the month end,
and the first rain falls without a stall.

### Gap AC — Ambient occlusion **shipped**

Gap AB found SSAO affordable as an opt-in. Tuning it on the test cities
turned up three problems with Babylon's defaults. Flat lawns and streets
shaded themselves. The scene, now drawn off-screen, lost the canvas's
antialiasing. And the shade muddied the data maps' colours.

| Slice | What shipped |
|---|---|
| AC1 Setting | Settings → Ambient occlusion: off by default and stored in the browser. It draws only on Quality: high, and only where WebGL2 is available; otherwise the button is greyed out and its tooltip says why. `AmbientOcclusion` builds the pipeline when it turns on, and when it turns off it drops the pipeline and switches the prepass off. |
| AC2 Look | Half-resolution SSAO2: radius half a tile, strength 2, 16 samples, bilateral blur, fading out by 120 units. `epsilon` 0.15, against Babylon's default of 0.02, stops flat ground shading itself. In a Metro street view, Babylon's `epsilon` (with radius 0.6, strength 1.2) darkened 278 of 400 sample points (mostly lawn and road). The tuned settings darken 194, mostly around the houses, and at the overview's distance it only deepens the blocks. |
| AC3 Maps | A data map pauses it: the shade darkened the map colours around every building, turning the Traffic map's red streets brown. It comes back when the map closes. |
| AC4 Edges | FXAA replaces the lost antialiasing. Multisampling the prepass's targets instead cost 63–82% of the frame in SwiftShader; FXAA cost too little to measure. |

| Full city, SwiftShader (ranks costs only) | Off | On |
|---|---|---|
| Overview | 1,179 ms | 1,242 ms (+5%) |
| Street level | 1,133 ms | 1,293 ms (+14%) |
| Draw calls | 73 | 80 |

JavaScript per frame does not change. It stays off by default until someone
times it on a real integrated GPU.

**Exit:** Settings → Ambient occlusion on, at Quality: high: buildings and
trees sit darker where they meet the ground, and open lawns stay light; open
the Traffic map and the shade goes, and it returns when the map closes.

### Gap AD — Services and utilities **shipped**

An audit of police, fire, parks, plants, towers, and the street grids over
the five test cities. Power, police, and parks already worked through the
sim: dark buildings leave, patrols cut crime, parks raise land value and
walkability. The other two had little or nothing behind their numbers.
Fire coverage fed nothing but its own advisory. Water was silent: Sprawl's
one tower ran at 598/600 with 99 of its 210 buildings dry, and the water
advisory waited for fewer than a quarter of lots to be watered. Neither
counted in the score.

| Slice | What shipped |
|---|---|
| AD1 Fire safety | A lot a fire engine reaches is worth up to 8 more land value, the closer the more (`FIRE_SAFETY_LV_MULTIPLIER`), so a station helps its district densify. |
| AD2 Score | From 40 residents, the score loses up to 10 for the share of buildings no fire engine reaches and up to 5 for the share left dry. |
| AD3 Advisories | "Water towers are at capacity (600/600) — 29 buildings are dry" once 5 or more are, and the fire advisory counts the buildings out of reach. Both come before traffic: each is fixed by placing one building. |
| AD4 Inspect | A house, shop, or factory says `dry` and `no fire cover` when it is. A station gives the buildings its crews reach (`buildingsInReach`), and every service gives its upkeep (police and fire at their funding). |
| AD5 Metro | Two more fire stations: one covered 16% of its buildings, which put the new fire advisory on top of a city meant to show every service. With three, 41% are covered, and it ends with 17 office blocks instead of 8. |
| AD6 Cleanup | The circular-radius helper no service used any more is gone; tool feedback takes its prices from the service catalog. |

| City | Score before → after | Top advisory now |
|---|---|---|
| Hamlet (no tower, no fire station) | 58 → 43 | Smog spike |
| Riverside (one full tower, no fire station) | 64 → 53 | Water towers at capacity, 29 buildings dry |
| Metro (three fire stations) | 60 → 54 | One house emptying to crime |
| Troubled | 0 → 0 | 150 lots need a road |
| Sprawl (one full tower, no fire station) | 53 → 41 | Power grid full |

Unpowered stations and towers already turned dark red like other unpowered
buildings. Happiness is display-only (section 1); it is left for its own pass.

**Exit:** Inspect a Riverside house on the south bank: it says `dry` and
`no fire cover`, and the advisory asks for a second water tower. Place a fire
station and Inspect it: it gives the buildings it covers and its $60/mo.

### Gap AE — GLB building kits **shipped**

C4 asked for glTF models with the procedural kits as the fallback. Outside
art was not reachable from the build machine (kenney.nl is blocked), and a
kit's licence has to be checked file by file, so the pipeline ships with
a model for each of the fifteen buildings, generated in the repo. Any GLB
that follows the same conventions can replace one.

| Slice | What shipped |
|---|---|
| AE1 Data | `visualRef` on a building def (`models/small_house.glb`): the file under `public/`. Render-only; the sim never reads it. |
| AE2 Loader | `BuildingModels` loads each model once with `@babylonjs/loaders`, prebundled with core so both share one copy. A model that fails (a 404, bad data) logs one warning, and that building keeps its procedural kit. |
| AE3 Baking | `bakeMeshes` flattens a model into one vertex-coloured mesh in lot space, so it instances and draws like a procedural kit: one source per building and variant, the same material, snow on flat roofs, and ambient occlusion. Colour is the material's base colour times its texture at each vertex (a palette-texture kit comes through exactly; a probe with a 2×2 palette read back red and yellow where it should). Each triangle is wound by its own normal: the first cut trusted the loader's mirror and drew every model inside out. `fitToLot` stands a model on the ground, re-centres one authored off its origin, and shrinks one too big for its lot. |
| AE4 Renderer | High quality uses the models; Low keeps the procedural kits. Buildings already standing swap when their model arrives. Unpowered ones recolour to reds of their own brightness (`warningColors`), and plinths on slopes take the model's footprint. |
| AE5 Models | `scripts/build-models.mjs` (`npm run models`) writes the house (gable, chimney, porch step), rowhouse (three houses, stoops, chimneys), shop (awning, sign, shopfront), office block (podium, window bands, roof plant), factory (sawtooth north lights, chimney), fire station (bays, hose tower), and water tower (legs, braces, tank, cone). They leave out faces nobody sees: bottoms, and all but the front of doors, windows, and signs. That cut them from 92–322 triangles to 44–186. |
| AE6 Licence | `public/models/ASSET_LICENSE.md` lists each file's source and licence (GPL-3.0, generated here), the conventions, and what a contributed model must carry (CC0, CC-BY with attribution, or the contributor's own work; nothing from SimCity). |
| AE7 The rest | Shop rows (awning, three shopfronts), workshops (gable, roll-up door, office annex), works (hall, tank, pipe, stacks), the power plant (turbine hall, banded stacks, roof units), the police station (tower, antenna, badge, flagpole), and the three mixed-use blocks (awnings, window rows, a corner store glazed on two sides), at 56–192 triangles. Smoke now turns with the plant: its stacks were placed unrotated, so a plant facing east or west smoked beside them. |

| Full city, High | Procedural | Models |
|---|---|---|
| Building triangles (main pass) | 180k | 250k |
| Main pass | 451k | 522k |
| Draw calls | 73 | 73 |

A test checks each model's file against the conventions (glTF 2.0, normals,
on the ground, inside the lot, under 400 triangles), and that the generator
builds exactly the models the defs name.

**Exit:** Open `?city=metro` on High: every building is a model (houses with
gables and chimneys, shops with awnings, offices with window bands,
factories with sawtooth roofs, plants smoking from their own stacks); switch
to Low and the procedural kits return.

### Gap AF — Happiness that counts **shipped**

Gap AD's audit found happiness composed every month (jammed roads and crime
cost it; walkable streets and transit win some back) and read by nothing.
Adding it to the monthly demand step would have let a happy city with no
jobs keep drawing residents, and a city without jams sits at 100, so a bonus
would only have sped every city up. Happiness now limits how many of the
people housing demand calls for actually come.

| Slice | What shipped |
|---|---|
| AF1 Draw | `housingDemand` = residential demand × `happinessDraw`: all of it at 80 or more, none at 30, a straight line between (half at 55). `demandForZone` uses it for houses and the housing half of mixed use, so growth, the monthly pace, densifying, and the hints all agree. |
| AF2 Leaving | At 30 or less the draw is zero, so homes count as short of demand and a miserable city loses residents a few buildings a month (the existing exodus cap). The emptying advisory says so ("people are too unhappy to stay") when jobs still call for residents; with no demand at all it still blames the jobs. |
| AF3 HUD | Happy turns amber below 80. Its tooltip gives what made it ("jammed roads −23, crime −8; walkable streets +0 and transit +0 win some back") and how much of the demand moves in. The Res bar shows the demand people act on, and its tooltip gives both numbers. An empty lot turned away by it says "people are staying away — happiness is 25". |

The test cities come out the same: their happiness stays between 65 and 100.
Hamlet (down to 65, its jammed crossroads) loses up to 30% of its housing
demand in 21 of its 24 months, Troubled (down to 73) up to 14% in 28 of 36,
and Sprawl (72 at the end) in 6 of 42, but their zoned lots, jobs, and grid
limit them first.

**Exit:** In `?city=hamlet`, hover Happy: it is amber at 69 and says 78% of
the housing demand moves in; the Res bar reads 12%, not 15%.

---

### Gap AG — Road, trolley, and tile interactions **shipped**

The audit drove every tool (street, highway, trolley, bulldoze, the four zone
brushes, dezone, the five services) against every kind of tile (grass, woods,
water, zoned lot, house, station, park, street, highway, trolley avenue, level
crossing, bridge span, plant). Every outcome was consistent, and every
refusal had a message naming its reason. It then scripted drags across
neighbours: trolley lines over highways and bridges, a highway through a
street grid, bulldozing a middle span or a level crossing, freehand strokes
across water, and bulldozing the road in front of houses. Two of those were
wrong.

| Slice | What shipped |
|---|---|
| AG1 Stranded spans | A new bridge span needs a road beside it, either laid or earlier in the same line (`strandedSpan`, block `'bridge-stranded'`). A Shift stroke staggering diagonally across Riverside's river used to buy a span at every step: nine disconnected tiles for $490. Now only the span joined to the shore is built ($90), and the status says bridges run straight. A line drawn out in the water is skipped ("bridges start from a road"), and so is a single click there. A line anchored on the water and dragged to the shore is laid from the shore end (`roadLineOrder`), so it builds as a pier. |
| AG2 Bulldoze rectangle | The bulldozer drags a rectangle, as zoning does (`planBulldozeArea`, `BulldozeAreaMode`). Buildings, roads and bridge spans that would come down are tinted orange, and zoned lots white. The status lists them ("14 buildings, 7 road tiles · $21") and names civic buildings ("a power plant"). Release clears, Esc keeps everything, and Shift paints freehand as before. Before, a drag cleared each tile as the pointer crossed it and then said only "Bulldoze spent $7." The result line is now "Bulldozed 14 buildings and 7 road tiles for $21." |
| AG3 Crossings and tips | A trolley line's preview says when it will cross a highway at grade. The Bulldoze tooltip describes the rectangle, and the Street tooltip says bridges start from a road and run straight. |

These were checked and left alone:

- A street clicked on a highway says to bulldoze the highway first, but a dragged street crosses it. A line passes through the highway; a single tile has nothing to pass through.
- A bulldozed middle span leaves both halves standing, and the gap can be laid again.
- Houses behind a bulldozed street stand stressed and leave after four months, as any lot without a road does.

**Exit:** In `?city=riverside`:

- Shift-drag a street diagonally across the river north-east of the bridges. One span stands at the shore; nothing floats.
- Drag a street line out in the water. It is skipped, and the status says bridges start from a road.
- Drag the bulldozer over the houses north of the highway. They tint orange, and the status lists and prices them; Esc keeps them.

---

### Gap AH — Systems and mechanics **shipped**

The audit ran every test city ten years past its script, and it compared each city with a saved-and-loaded copy of itself rolling the same dice. It turned up four faults:

- Shop demand only rose. It gained 3 a month whenever anyone lived in town, and fell only with commercial tax above about 10%. Every healthy test city sat at 100% for all ten years, so the Com bar said nothing.
- The emptying advice was wrong in Troubled. It said "more homes than jobs" while jobs outnumbered homes, because the city's 16/14/14% taxes were the cause.
- Troubled emptied and regrew every four to five years (0 → 116 → 0 people). An empty city got the starter demand whatever its taxes.
- A loaded city did not play on as the saved one would have. After one month, a loaded Troubled had 14 more jobs than the unsaved original.

| Slice | What shipped |
|---|---|
| AH1 Shop demand | Commercial demand heads for a target, as industry's does (`nextCommercialDemand`). The target is the room residents leave for shops: 100 with no shops, 0 once shop and office jobs reach 1.5 per resident (`SHOP_JOBS_PER_RESIDENT`). Walkability and transit each add up to 10, and commercial tax moves it 4 a point. Demand steps 5 a month toward the target. The census counts `shopJobs`. Over ten years the test cities' Com bars now sit between 60 and 89. Metro grows 21 office blocks (was 17) at the same population, and Sprawl 6 (was 14). |
| AH2 The cause, named | When houses empty for want of demand while jobs outnumber homes, the advice names the residential tax. With the tax at 9% or below, it says demand is climbing back. Shops and factories get their own lines, naming their tax when it is over 9%. People leaving for any reason but power now outrank lots waiting for a road, which have no one to lose. Troubled now opens with "Factories are emptying — industrial tax at 14% drives them off." Empty shop and factory lots give the same reasons. |
| AH3 High taxes, empty town | An empty city's housing demand is the starter 40 plus 6 per point of residential tax under 9%, or minus 6 per point over (`starterDemand`). Nobody moves in at 16% or more. Troubled now empties and stays empty, and the advice reads "Nobody will move in at 16% residential tax — cut it toward 9%." |
| AH4 Save and load | Two counters were not saved: how long each building has outgrown its lot (the shrink countdown) and how many buildings waited for power (the grid-full advisory). Both are saved now. The refresh also computed land value before fire coverage, although land value counts fire cover. A new fire station's bonus therefore waited for the next edit, and a loaded Metro started a point low on about 380 tiles. Coverage now comes first, and a duplicate water pass is gone. All five test cities now load identical to the saved city on every tile and stat, and play the next 36 months identically. |
| AH5 Explained | The Com bar's tooltip gives residents, the shop and office jobs they keep busy, how many are open, and the tax. The Ind bar's gives residents without work. Each tax slider says what it does: the old shared line said every tax moved demand by 2 a month, which was wrong for shops and factories. |

These were checked and left alone:

- Built-out cities pile up money. Riverside goes from $55k to $166k in ten years, and nothing asks for it once the city is built.
- Houses churn at balance: where people equal jobs, housing demand dips to 0 and a few houses leave and regrow. The advice now says whether demand is on its way back.
- Smog keeps many of Sprawl's and Metro's lots empty, and their hints say so.

**Exit:**

- In `?city=troubled`, the advisory names the 14% industrial tax.
- In `?city=metro`, hover Com. It reads 68%, with 619 of 1,458 shop and office jobs open.
- Save, then Load, any city. The HUD is unchanged.

---

### Gap AI — Strategy harness (plan slice G1) **shipped**

The scripted player from the strategy and gameflow audit ([STRATEGY_AND_GAMEFLOW.md](./STRATEGY_AND_GAMEFLOW.md)) now lives in the repo, so later balance work is measured the same way.

| Slice | What shipped |
|---|---|
| AI1 Player | `src/scenarios/strategyPlayer.ts` plays a new city on the default map with the real tools and prices: blocks on the north-west bank, a factory district across a link road, and services when the city needs them and the budget carries them. It has careful, advice-following, and naive policies. `STRATEGIES` holds the audit's twelve strategies; `taxStrategy` makes the tax sweep, which rolls the balanced town's dice. |
| AI2 Report | `npm run strategies` prints the strategy table, the tax sweep, and the balanced town's gameflow, as in sections 3 and 4 of the plan. It loads the TypeScript through Vite, so it needs nothing new. `npm run strategies -- balanced taxes` runs only those. |
| AI3 Balance test | `test/strategyBalance.ts` plays six years of five strategies. It checks that the careful town thrives and never goes into debt, that suburb and industry-late stay viable within 0.6–1.6× of it, that the naive layout stalls below 0.6×, and that services matter. Later slices add their bands there. |

The plan's tables now come from this report. The findings stand, with some figures moved by the new dice: mixed use has 1.9× the people and 3.9× the money of the balanced town, and the 12% town ends with 140 people and in debt. Jest runs the simulation about 10× slower than Node does, so the test plays six years rather than twenty.

**Exit:** `npm run strategies -- balanced` prints the balanced town at 576 people in year 5 and 700 in year 10.

---

### Gap AJ — Honest taxes (plan slice G2) **shipped**

The strategy audit found taxes almost free up to 11% and a cliff at 12%. The residential tax took 2 a month from housing demand while jobs added 5, so at 12% and above demand drained away even when jobs outnumbered homes. The shop and factory taxes had cliffs of their own at about 15%: they cut their demand targets, which reached zero there.

| Slice | What shipped |
|---|---|
| AJ1 One rule for all three taxes | `sim/taxes.ts`. Above 9%, each point turns away 7% of newcomers (`taxDraw` scales the demand a zone acts on, so it grows more slowly and builds less densely) and leaves 4% of places empty (`taxOccupancy`: the census counts fewer residents and jobs, and the budget taxes only filled places). Below 9%, each point draws 5% more newcomers. The draw stays between 0.3× and 1.3×, and occupancy never drops below 40%. Housing, shop, and factory demand no longer carry tax terms, so no rate empties a town on its own. |
| AJ2 Advice | The deficit advisory says what a point on every tax would bring in (in the balanced town at year 10, "A point on every tax brings in about $274 a month (and empties about 4% of places)"), counting the places it empties. The high-tax advisory names the share of empty places. The emptying advice no longer blames taxes, which cannot empty a town now. The empty-town tax line from Gap AH is gone, because an empty town at a high tax still draws people, only fewer. |
| AJ3 HUD | The Com and Ind bars show the demand that acts after the tax, as Res already did. Each bar's tooltip gives the raw demand, what the tax does ("At 14% tax, 20% of shop jobs stand empty and 35% fewer shops open"), and the acting share. The tax sliders' tooltips give the real rule. |

In the harness sweep, the balanced town at year 10:
- **Population** falls smoothly as the tax rises: 700 at 9%, 596 at 11%, 584 at 13%, 519 at 15%, 365 at 20%.
- **Money** levels off: $97,000 at 9%, about $140,000–$152,000 from 12% to 17%, $122,000 at 20%.
- **Debt:** no rate from 7% to 20% puts the careful town in debt; 5% cannot cover upkeep.

Strategies at 9% are unchanged. The industry-late town, which sets a 5% factory tax, now banks $32,507 by year 10 instead of $72,856, because a low tax no longer boosts demand for free. `test/strategyBalance.ts` holds the band: 11% and 13% are debt-free, cost people by at most 12% a point, and earn more than 9%.

**Exit:** In `?city=troubled` (16/14/14% taxes), hover Res. It says the 16% tax turns 49% of newcomers away and leaves 28% of homes empty. The town keeps its people rather than emptying.

---

### Gap AK — Mixed use with a trade-off (plan slices G3, G3b) **shipped**

The strategy audit found mixed use dominant. At year 10 a houses-then-mixed town had 1.9× the balanced town's people and 3.9× its money, with no downside. A town zoned only mixed use never grew at all. The cause was land value. Every walkable building (mixed use, shop rows, offices) added up to +20 to each lot in reach, and the bonuses summed, so a mixed block lifted its own land to the top tier while the balanced town's houses never reached rowhouse land.

| Slice | What shipped |
|---|---|
| AK1 Street life stops stacking | Each lot takes the strongest street-life bonus in reach, not the sum. |
| AK2 Main-street premium | Mixed use judges its land 15 points lower when it steps up a size (`MAIN_STREET_PREMIUM`), and when it counts as outgrown. The smaller mixed buildings are trimmed: corner store flats 5+3 → 4+1, shopfront apartments 6+2 → 5+2, main street block 10+5 → 8+4. The 1.3× growth boost beside other zones is gone. |
| AK3 Flats first | In a town of fewer than 50 residents, mixed use grows at half the housing pace even before shops have customers, so a mixed-use town can start. After that it grows on the weaker of its two demands, as before. |

At year 10 the houses-then-mixed town has 961 people (1.37× balanced), $190,730 (2.0×; it fills its land faster), walkability 46 against 1, and happiness 88 against 76. A mixed-use-first town reaches 100 people by month 3 and 998 by year 10. With trolleys and parks, mixed use reaches 1,370 people (1.96×). That is the strongest combination left, and it costs the most up front.

Metro's downtown is now shop rows and shopfront flats, with a couple of office and main-street blocks where land is dearest; it used to have 17–21 office blocks on stacked bonuses. `test/strategyBalance.ts` holds the band: mixed use ahead of balanced but under 1.5×, ahead on walkability and happiness, and a mixed-first town at 100 people within a year.

**Exit:** Start a new city and zone only mixed use beside a street, with a plant. Flats grow in the first months.

---

### Gap AL — Steadier, located advice (plan slice G6) **shipped**

The strategy audit found the naive town's top advisory changing 37 times in 67 months, cycling between crime, smog, "restore power, demand, or road access", and smog spike. It never said where any of it was. At 44 people and no jobs, the first advice after the coach was the fire nag, although `JOBS_GAP_POPULATION` says the jobs lesson comes first.

| Slice | What shipped |
|---|---|
| AL1 Hold | At a month's end, the advisory on show stays for up to three months while it still applies (`ADVISORY_HOLD_MONTHS`). Only these replace it sooner: something urgent (bankruptcy, a deficit, no plant, dark houses or stations, next month's heatwave or freeze) or a trouble the player's own edit brings up. The emptying lines are one advisory per cause, one family: while buildings are still emptying, the held line stays even if this month's most common cause is another. The hold is saved, so a load shows the same advice. |
| AL2 Where | Each advisory with a place carries one (`stats.advisoryAt`), for example the first lot needing a road, a dark building, a struggling building of that cause, an unprotected or dry building, the most jammed road, or the smoggiest or most crime-ridden tile. The HUD line becomes a link (↗); clicking it moves the camera there and highlights the tile, as the minimap does. |
| AL3 Order | "Zone shops" (jobs far below the population) now comes before the water, smog, crime, and fire advice. |

With no player edits, the naive town's advisory changes 13 times in 36 months, about once per three months, which is the hold's limit. With the scripted player's edits it is 29 times in 67 months (was 37), since an edit that raises a new trouble shows it at once. `EvaluationSystem.advisories` keeps the whole list for a later "other problems" view.

**Exit:** In `?city=troubled`, click the advisory. The camera moves to a zoned lot with no road next door.

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

The first list (A1–A6, B1–B3, C1–C2, D2) has all shipped, and so has
everything after it (D4 faster tests, the Gap AB frame check, the Gap AC SSAO
opt-in, the Gap AE GLB kits, Gap AF's happiness, Gap AG's tile interactions,
Gap AH's systems pass). What is left:

1. **Time SSAO on a real GPU.** Only SwiftShader measured it (Gap AC). On an integrated GPU at 1080p, time a full city with it off and on; if it holds 60 fps, consider turning it on by default for High.
2. **An artist's kit (optional).** The fifteen models are generated; hand-made ones can replace them file by file under `public/models/ASSET_LICENSE.md`.
3. **Something to spend on late.** Once a test city is built out, its money only grows: Riverside from $55k to $166k in ten years. Upgrades that cost money to run, such as larger plants, stadiums, or road repaving, would give a finished city decisions to make.
4. **Strategy and gameflow (G1–G11).** Start with the plan in [STRATEGY_AND_GAMEFLOW.md](./STRATEGY_AND_GAMEFLOW.md). G1–G3 and G6 have shipped (Gaps AI–AL). Next, in order: the plant's smog in view, a rating that means success, milestones, small-town services, a bankruptcy ending, late civic buildings (which answer item 3), and new-game options with scenarios.

---

## 6. Verification for later slices

- Root `npm test` (or `cd openpublica && npm test`) stays green.
- No `@babylonjs` imports under `src/sim/`, `src/tools/`, `src/save/`, `src/scenarios/`, `src/ui/`, `src/data/`.
- Network tab still has no `tiles.png` / `sprites/`.
- Play: grow a city, toggle Smog, Frame, Save/Load, mute, Dawn/Dusk.
- First minutes: Road is selected; HUD coach steps street → lots → plant; fire/water nags wait until population 40.
- Services: hover a park to see its coverage disc, a plant or tower to see the network it feeds, or a police/fire tool over a lot to see the streets it reaches; Budget lists civic and road upkeep; water raises land value on covered lots.
- Roads: drag a street straight across a river (status names the bridge tiles), drag one across a highway (the highway stays), and watch Traffic drop on a jammed street after a parallel street is joined up. Drag a highway over a street (the preview charges $15 a tile for the upgrade).
- Transit: in `?city=metro`, trolleys cross the highway at (44, 18) on rails set into it; Inspect there says level crossing and shows transit 100. Zone a big area in the open and its streets close into loops.
- Commutes: in `?city=riverside` open Traffic and find the street bridge carrying the south bank's commuters; lay a long street between a row of houses and a block of shops and it reads busy along its whole length.
- Tiles: in `?city=riverside`, Shift-drag a street diagonally across the river (one span at the shore, none floating), and drag the bulldozer over a row of houses (an orange preview lists them and their cost; Esc keeps them).
- Strategies: `npm run strategies` (in `openpublica/`) prints the strategy tables; `test/strategyBalance.ts` holds the balance bands.
- Mixed use: zone only mixed use in a new city; flats grow in the first months.
- Advice: the top advisory holds for up to three months; click it (↗) to go to the trouble.
- Taxes: raise a tax in Budget and hover its bar: the tooltip names the empty places and the newcomers turned away, and the town keeps its people.
- Systems: in `?city=troubled` the advisory names the industrial tax, and a few years on it says nobody will move in at 16%; in `?city=metro` Com's tooltip counts shop and office jobs; Save then Load leaves the HUD unchanged.
- Growth and power: in `?city=sprawl` Inspect an empty lot at the end and it is waiting for power, with no house dark.
- Streets: zone a 15-wide area in the open and its lines meet at a cross street halfway along as well as at both ends.
- Shrinking: Inspect an office block whose block lost its land value (bulldoze the shops around it, or put a plant next door) and it counts down to stepping down.
- Industry and budget: in `?city=riverside` the highway's industrial strip is works and factories. In Budget, Borrow $10k adds $10,000 and a $500/mo repayment row; Safety at 70% shrinks a police station's placement preview; Roads at 80% cut road upkeep and raise Traffic.
- Water: from an angled camera, hover the edge of a bridge deck (the cursor sits on the deck); beach lots show dry ground to the water's edge; Value shows the waterfront premium.
- Terrain: drag a street across a hillside (the ground levels under it, no grass through the deck); hills shade with the sun at Dawn/Dusk; tilt the camera low at the map edge to see the skirt.
- Placement: with Road, drag an L across a lake so it turns on the water (blue bridge tiles, the turn tile red, status gives cost and bridges), press Esc before releasing (nothing is built), then release a line on land; Shift-drag paints freehand; hover water with a zone brush (red cursor); shops along a street face it; cars curve through corners.
- Zoning: with Z, drag a 12×9 area beside a street (grey street rows, blue lots, status gives lots/streets/cost), press S (streets drop, lots turn amber), press S again and release (one quick build); run at 4× and watch houses fill along the new streets a few a month.
- Frame cost: load a large city and check the scene holds a few hundred meshes, not tens of thousands; paint and bulldoze a road and reload the save (road pieces appear, vanish, and match after load).
- Utilities: place a plant beside a street at the edge of town (the whole joined network previews yellow), watch Power in the HUD, hover the plant to see what it feeds, place one in an empty field (the status asks for a street), and add a water tower beside a powered street.
- Ground: zone a rectangle over woods (the status says how many wooded tiles it clears; the trees go on release), inspect a grove tile, check the Value map for the woods premium, and look along a waterfront for zone colour in the water (there should be none).
- UI: at 1280×720 every tool shows in the rail with its key; the HUD stops short of Budget; on a phone the tool strip is one row under the camera bar and minimap.
- Economy: open `?city=metro`, drag a tax slider and watch its take and the net change; zone an empty map deep into the red and read the months left in Budget.
- Time: hide the tab for a minute and come back (the date moves on by about a quarter second, not two months); the HUD date counts days.
- Weather: open `?city=metro&weather=snow`, `rain`, `storm`, `fog`, and `heat` (snow on roofs, plowed roads, amber HUD, Road upkeep (snow) in Budget; rain and storm grey the sky; heat raises Power and water load), then play a year at 4× and watch the seasons turn.
- Shops: open `?city=metro`, look at the shopping districts (glass-banded office blocks among shop rows), and check Traffic there.
- Frame time: load a full city on High and run it at 4× (the only stutter is the month end), and let Metro reach its first rain (no stall when it starts); a bridge still shades the water under it.
- Services: in `?city=riverside` the advisory names the dry buildings behind its full tower; Inspect a house (`dry`, `no fire cover`) and a police station (buildings covered, upkeep); a new fire station raises land value around it and the score once people live nearby.
- Happiness: in `?city=hamlet` hover Happy (amber at 69: what cost it, and 78% of the housing demand moving in) and the Res bar (12% of a 15% demand).
- Models: on High every building is a GLB model, and a plant's smoke rises from its own stacks whichever way it faces; on Low they are procedural kits; rename a file under `public/models/` and that building keeps its procedural kit with one console warning.
- Ambient occlusion: Settings → Ambient occlusion on (Quality: high): buildings and trees sit darker where they meet the ground, and open lawns stay light; open a map and the shade pauses; switch to Quality: low and the button greys out.
- Test cities: open `?city=hamlet`, `riverside`, `metro`, `troubled`, and `sprawl` (or New → Or open a test city); each status line says what the city shows, the HUD and advisory match its row in Gap N, and New goes back to a fresh map.
