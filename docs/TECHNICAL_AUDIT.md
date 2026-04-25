# Technical Audit — MetroJS (micropolisJS fork)

> **Audit date:** 2026-04-25  
> **Repository:** awest813/MetroJS  
> **Upstream:** graememcc/micropolisJS  
> **Purpose:** Pre-modernisation baseline for a GPL browser city-builder project

---

## Table of Contents

1. [Project Structure Map](#1-project-structure-map)
2. [Build Instructions](#2-build-instructions)
3. [App Entry Points](#3-app-entry-points)
4. [Simulation Overview](#4-simulation-overview)
5. [Rendering Overview](#5-rendering-overview)
6. [UI Overview](#6-ui-overview)
7. [Asset Overview](#7-asset-overview)
8. [Save / Load Overview](#8-save--load-overview)
9. [Licensing & Trademark Terms](#9-licensing--trademark-terms)
10. [Known Risks](#10-known-risks)
11. [Recommended Modernisation Steps](#11-recommended-modernisation-steps)

---

## 1. Project Structure Map

```
MetroJS/
├── css/
│   ├── chunk.woff          # Custom web font
│   ├── FONT_LICENSE.markdown
│   └── style.css           # Single global stylesheet
├── images/
│   ├── dirtbg.png          # Background texture
│   ├── sprites.png         # Sprite sheet (all animated sprites)
│   ├── tiles.png           # Primary tile sheet (summer)
│   └── tilessnow.png       # Alternate tile sheet (winter)
├── sprites/                # Individual sprite frames (obj{N}-{frame}.png)
├── src/                    # All JavaScript / TypeScript source
│   ├── micropolis.js       # ← ENTRY POINT: bootstraps tile loading then SplashScreen
│   ├── splashScreen.js     # Start-screen: map generation, new/load game flow
│   ├── game.js             # Top-level game controller (rendering loop, window routing)
│   ├── simulation.js       # Simulation engine root
│   ├── gameCanvas.js       # HTML5 Canvas renderer
│   ├── gameMap.js          # Tile data store (120×100 default)
│   ├── mapGenerator.js     # Procedural terrain generator
│   ├── storage.js          # localStorage save/load wrapper
│   ├── tileSet.js          # Tile image splitter / cache
│   ├── tileSetURI.ts       # Base64-encoded primary tile sheet (fallback)
│   ├── tileSetSnowURI.ts   # Base64-encoded snow tile sheet (fallback)
│   ├── animationManager.js # Tile animation sequencing
│   ├── eventEmitter.js     # Custom pub/sub mixin
│   ├── messages.ts         # All event-name constants
│   ├── config.js           # Debug flags
│   ├── text.js             # UI string table
│   │
│   │ — Simulation modules —
│   ├── budget.js           # City finances
│   ├── census.js           # Population statistics
│   ├── commercial.js       # Commercial zone simulation
│   ├── industrial.js       # Industrial zone simulation
│   ├── residential.js      # Residential zone simulation
│   ├── valves.js           # RCI demand valves
│   ├── powerManager.js     # Power grid propagation
│   ├── traffic.js          # Traffic routing/density
│   ├── transport.js        # Transit infrastructure helpers
│   ├── road.js             # Road tile evaluation
│   ├── mapScanner.js       # Full-map zone processing pass
│   ├── evaluation.js       # City evaluation / score
│   ├── disasterManager.js  # Disaster logic (fire, flood, meltdown, crash)
│   ├── emergencyServices.js# Fire/police effect mapping
│   ├── repairManager.js    # Auto-repair of powered zones
│   ├── stadia.js           # Stadium zone logic
│   ├── zoneUtils.js        # Zone helper utilities
│   ├── miscTiles.js        # Miscellaneous tile transformations
│   ├── blockMap.ts         # 2D block-resolution score map
│   ├── blockMapUtils.js    # Block map helpers
│   │
│   │ — Sprite modules —
│   ├── spriteManager.js    # Sprite lifecycle manager
│   ├── baseSprite.js       # Abstract sprite base
│   ├── airplaneSprite.js
│   ├── boatSprite.js
│   ├── copterSprite.js
│   ├── explosionSprite.js
│   ├── monsterSprite.js
│   ├── tornadoSprite.js
│   ├── trainSprite.js
│   ├── spriteConstants.ts  # Sprite type ID constants
│   ├── spriteUtils.js
│   │
│   │ — Tool modules —
│   ├── baseTool.js         # Abstract tool (auto-bulldoze, cost deduction)
│   ├── buildingTool.js     # Place single-tile buildings
│   ├── bulldozerTool.js
│   ├── connectingTool.js   # Road/rail/wire placement with auto-connect
│   ├── connector.js        # Low-level tile connection logic
│   ├── gameTools.js        # Tool registry / dispatch
│   ├── parkTool.js
│   ├── queryTool.js
│   ├── railTool.js
│   ├── roadTool.js
│   ├── wireTool.js
│   │
│   │ — UI / Window modules —
│   ├── infoBar.js          # HUD: city name, date, funds, population, score
│   ├── rci.js              # R/C/I demand indicator bar
│   ├── notification.js     # In-game news ticker
│   ├── modalWindow.js      # Modal window base mixin
│   ├── budgetWindow.js
│   ├── congratsWindow.js
│   ├── debugWindow.js
│   ├── disasterWindow.js
│   ├── evaluationWindow.js
│   ├── mouseBox.js         # Cursor highlight overlay
│   ├── monsterTV.js        # Monster-cam sprite viewer
│   ├── nagWindow.js
│   ├── queryWindow.js
│   ├── saveWindow.js
│   ├── screenshotWindow.js
│   ├── screenshotLinkWindow.js
│   ├── settingsWindow.js
│   ├── splashCanvas.js     # Mini-map on splash screen
│   ├── touchWarnWindow.js
│   │
│   │ — Data / Utility modules —
│   ├── tile.ts             # Tile value + flag wrapper
│   ├── tileFlags.ts        # Bit-flag constants (ZONEBIT, POWERBIT, …)
│   ├── tileValues.ts       # Tile index constants (DIRT, RIVER, …)
│   ├── tileUtils.js        # Tile helper functions
│   ├── tileHistory.js      # Per-tile animation history
│   ├── bounds.ts           # Rectangle bounds helpers
│   ├── direction.ts        # Cardinal direction enum + iterators
│   ├── position.ts         # (x, y) map position helper
│   ├── random.ts           # Seeded PRNG
│   ├── miscUtils.js        # General DOM / math utilities
│   ├── worldEffects.js     # Applies simulation results back to map tiles
│   └── inputStatus.js      # Keyboard / mouse / toolbar input handler
├── test/                   # Jest unit tests (TypeScript modules only)
│   ├── blockMap.ts
│   ├── bounds.ts
│   ├── debugAssert.ts
│   ├── direction.ts
│   ├── position.ts
│   ├── random.ts
│   └── tile.ts
├── index.html              # Single-page app shell
├── about.html              # About page (git hash injected at build time)
├── name_license.html       # Micropolis Public Name License page
├── webpack.config.js       # Build configuration
├── package.json
├── tsconfig.json
├── jest.config.js
├── tslint.json
├── COPYING                 # GNU GPL v3 full text
├── LICENSE                 # Project-specific additional terms
├── MicropolisPublicNameLicense.md
└── README.md
```

---

## 2. Build Instructions

### Prerequisites

- Node.js (any LTS ≥ 16 should work; exact version not pinned)
- npm

### Install dependencies

```bash
npm install
```

### Development server (hot-reload)

```bash
npm run dev
# Webpack dev server on http://localhost:8080 (default)
```

### Production build

```bash
npm run build
# Output written to dist/
```

### Watch mode (no dev server)

```bash
npm run watch
```

### Run tests

```bash
npm test
# Jest with ts-jest; coverage report written to coverage/
```

### Lint TypeScript files

```bash
npm run lint
# TSLint on src/*.ts and test/*.ts
```

> **Note:** `tsconfig.json` targets `es5` / `commonjs`, which is used by ts-jest for testing.
> Webpack uses `ts-loader` and resolves both `.ts` and `.js` files from the same `src/` directory.
> There is currently a commented-out assertion-stripping transformer (`ts-transformer-unassert`) in
> `webpack.config.js` that is not active.

---

## 3. App Entry Points

| File | Role |
|------|------|
| `index.html` | Declares the `<canvas>` container, loads image assets (`tiles.png`, `tilessnow.png`, `sprites.png`) as hidden `<img>` tags, and links the bundled script |
| `src/micropolis.js` | Webpack entry point. Detects `?debug=1` URL param; creates a `TileSet` from the tile image; falls back to a base64-embedded URI (`tileSetURI.ts`) if canvas taint blocks the primary path; then hands control to `SplashScreen` |
| `src/splashScreen.js` | First interactive screen. Generates a random map (`MapGenerator`), renders a minimap, offers "Play this map", "Generate another", and "Load game" buttons, then launches `Game` |
| `src/game.js` | Main game controller. Owns the animation loop (`requestAnimationFrame`), wires all modal windows, routes tool clicks and keyboard shortcuts via `InputStatus`, drives `Simulation.simTick()`, and manages save/load |

**Startup sequence:**

```
index.html
  → src/micropolis.js
      → TileSet (tiles.png → individual tile images via canvas)
      → TileSet (tilessnow.png)
      → SplashScreen
          → MapGenerator  (procedural terrain)
          → SplashCanvas  (minimap)
          ↓ user presses Play / Load
      → Game
          → Simulation    (engine tick)
          → GameCanvas    (render loop)
          → InputStatus   (user input)
          → Modal windows (budget, eval, settings, …)
```

---

## 4. Simulation Overview

Root: **`src/simulation.js`** — `Simulation` constructor decorated with `EventEmitter`.

### Tick model

`Simulation.simTick()` is called on every game frame (from `game.js`). Internally it runs
`_simFrame()` which processes one _phase_ of the city per call. A _phase cycle_ has 16 phases
(0–15) that rotate each tick. Speed is controlled by a random-threshold check:

| Speed constant | Threshold |
|----------------|-----------|
| `SPEED_PAUSED` | skips entirely |
| `SPEED_SLOW`   | 100 |
| `SPEED_MED`    | 50 |
| `SPEED_FAST`   | 10 |

### Sub-systems instantiated by `Simulation`

| Module | Responsibility |
|--------|----------------|
| `Budget` | Tax collection, service budgets (road / fire / police percentages), auto-budget |
| `Census` | Population counts, history arrays (120-year, 10-year windows) |
| `Valves` | R/C/I demand calculation (drives zone growth) |
| `PowerManager` | Flood-fill power propagation across the tile grid |
| `SpriteManager` | Spawns and updates animated sprites (trains, planes, boats, monsters, tornadoes) |
| `MapScanner` | Single full-map pass; evaluates each zone tile, triggers zone growth/decline |
| `RepairManager` | Periodically restores powered large structures |
| `Traffic` | Pathfinding for cars; produces `trafficDensityMap` |
| `DisasterManager` | Triggers random disasters; exposes `makeFire`, `makeFlood`, `makeMeltdown`, `makeCrash` |
| `Commercial` / `Industrial` / `Residential` | Zone evaluation and population update |
| `EmergencyServices` | Distributes fire station and police station effect maps |
| `Stadia` | Stadium zone effect on land value |
| `Evaluation` | Computes city score and classification (Village → Megalopolis) |

### Block maps (score grids)

`Simulation` maintains a set of `BlockMap` instances — coarse-resolution overlays (block size
varies per map):

- `cityCentreDistScoreMap` — distance from city centre
- `crimeRateMap` — crime level
- `fireStationMap` / `fireStationEffectMap`
- `policeStationMap` / `policeStationEffectMap`
- `landValueMap`
- `pollutionDensityMap`
- `populationDensityMap`
- `rateOfGrowthMap`
- `terrainDensityMap`
- `trafficDensityMap`
- `tempMap1`, `tempMap2`, `tempMap3` (scratch)

### Map data

`GameMap` (120 × 100 tiles by default) stores a flat `Tile[]` array. Each `Tile` holds a 16-bit
value: the lower bits are the tile index into `tileValues.ts`, and the upper bits are flags
defined in `tileFlags.ts` (e.g. `ZONEBIT`, `POWERBIT`, `ANIMBIT`, `BULLBIT`).

---

## 5. Rendering Overview

### GameCanvas (`src/gameCanvas.js`)

- Creates and owns an HTML5 `<canvas>` element inside `#canvasContainer`.
- Tiles are 16 × 16 px; the canvas fills the container viewport.
- On each `animate()` frame the engine:
  1. Calls `AnimationManager` to advance animated tile frames.
  2. Paints all visible tiles by copying pre-sliced `Image` objects from `TileSet` onto the canvas context (`drawImage`).
  3. Uses `putImageData` to restore tile pixels before painting sprites and the mouse-cursor box on top.
- Supports two tile sets (`tileSet` / `snowTileSet`) and switches between them seasonally (October → snow, January → summer) in `Game.onDateChange`.

### TileSet (`src/tileSet.js`)

- Accepts the full tile sheet image (must be square, `√TILE_COUNT × 16` px per side).
- Splits it into individual `Image` objects via an off-screen canvas and `toDataURL()`.
- The split images are stored as indexed properties (`tileSet[0]` … `tileSet[N]`).
- A base64-embedded fallback URI in `tileSetURI.ts` / `tileSetSnowURI.ts` is used when
  the canvas is cross-origin tainted (e.g. Chrome running from a local `file://` URL).

### AnimationManager (`src/animationManager.js`)

- Holds a mapping array (`_data`) from tile index → next animated frame index.
- Tracks per-coordinate last-painted frame so scrolling doesn't reset animation state.
- Driven by wall-clock time (`animationPeriod` ≈ 50 ms, `blinkPeriod` ≈ 500 ms).

### SpriteManager / Sprite classes

- `SpriteManager` holds active sprites and calls their `move()` method each tick.
- Individual sprites (`trainSprite`, `airplaneSprite`, `boatSprite`, `copterSprite`,
  `monsterSprite`, `tornadoSprite`, `explosionSprite`) extend `baseSprite`.
- Sprite frames come from the pre-loaded `sprites.png` sheet passed as a separate `spriteSheet`
  image to `GameCanvas`.

### SplashCanvas (`src/splashCanvas.js`)

- Renders a scaled-down minimap on the splash screen using the same tile data.

---

## 6. UI Overview

All UI is implemented as vanilla HTML elements styled with `css/style.css`, manipulated via
**jQuery 3.7.1**. No frontend framework is used.

### HUD (always visible during gameplay)

| Component | File | DOM anchor |
|-----------|------|------------|
| City name, date, funds, population, score | `infoBar.js` | `#infobar` |
| R/C/I demand bar | `rci.js` | `#RCIContainer` |
| News ticker | `notification.js` | `#notifications` |
| Tool buttons | `index.html` (static) | `#toolbox` |

### Modal windows

All modals use `ModalWindow` (`src/modalWindow.js`) as a base mixin and emit closed events via
`EventEmitter` so `Game` can respond.

| Window | File | Trigger |
|--------|------|---------|
| Budget | `budgetWindow.js` | Toolbar button / `BUDGET_REQUESTED` |
| Evaluation | `evaluationWindow.js` | Toolbar button / `EVAL_REQUESTED` |
| Settings | `settingsWindow.js` | Toolbar button / `SETTINGS_WINDOW_REQUESTED` |
| Disaster | `disasterWindow.js` | Toolbar button / `DISASTER_REQUESTED` |
| Query (tile info) | `queryWindow.js` | Query tool click |
| Save confirmation | `saveWindow.js` | Save button / `SAVE_REQUESTED` |
| Screenshot | `screenshotWindow.js` | Toolbar button |
| Screenshot link | `screenshotLinkWindow.js` | After screenshot taken |
| Congrats | `congratsWindow.js` | Population milestones |
| Nag | `nagWindow.js` | 30-min timer if user never clicked |
| Debug | `debugWindow.js` | Debug mode only |
| Touch warning | `touchWarnWindow.js` | First `touchstart` event |

### Event system

`EventEmitter` (`src/eventEmitter.js`) decorates both constructor prototypes and plain objects
with `addEventListener` / `removeEventListener` / `_emitEvent`. All event-name string constants
live in `src/messages.ts`. `InputStatus` translates DOM events into message emissions that
`Game` subscribes to.

---

## 7. Asset Overview

### Images

| File | Location | Usage |
|------|----------|-------|
| `tiles.png` | `images/` | Primary 16-px tile sheet (summer); loaded as `<img id="tiles">` in HTML |
| `tilessnow.png` | `images/` | Winter tile sheet; loaded as `<img id="snowtiles">` in HTML |
| `sprites.png` | `images/` | Composed sprite sheet; loaded as `<img id="sprites">` in HTML |
| `dirtbg.png` | `images/` | CSS background texture |
| `obj{N}-{frame}.png` | `sprites/` | Individual sprite frames (not currently used at runtime — the `sprites.png` sheet is used instead) |

### Embedded assets

- `src/tileSetURI.ts` — base64-encodes the entire `tiles.png` data URI as a TypeScript constant.
- `src/tileSetSnowURI.ts` — same for `tilessnow.png`.
- These are ~90 KB TypeScript source files and serve as a fallback for environments where the
  canvas becomes cross-origin tainted.

### Fonts / CSS

- `css/chunk.woff` — custom web font (`chunk.woff`); licensed separately (see `css/FONT_LICENSE.markdown`).
- `css/style.css` — single flat stylesheet; no preprocessor.

### Webpack asset handling

`webpack.config.js` copies `css/`, `images/`, `sprites/`, `LICENSE`, and `COPYING` into
`dist/` as static files. The HTML templates (`index.html`, `about.html`, `name_license.html`)
are processed by `HtmlWebpackPlugin`, which injects the bundle script tag and a `gitHash`
template variable.

---

## 8. Save / Load Overview

### Storage layer (`src/storage.js`)

A thin wrapper around `window.localStorage`.

| Property | Value |
|----------|-------|
| Storage key | `"micropolisJSGame"` |
| Current save version | `3` |
| Availability flag | `Storage.canStore` (`localStorage !== undefined`) |

Only one save slot is supported.

### What is serialised

`Game.save()` (called when the user confirms via `SaveWindow`) serialises:

- `name` — city name
- `everClicked` — nag-window suppression flag
- `BaseTool` state (auto-bulldoze preference)
- `Simulation` state:
  - `_cityTime`, `_speed`, `_gameLevel`
  - `GameMap` tile data (all 12,000 tile values)
  - `Evaluation` state
  - `Valves` (R/C/I demand accumulators)
  - `Budget` (funds, tax rate, service percentages)
  - `Census` (population history)

The serialised object is JSON-stringified and stored in `localStorage`.

### Version migration (`transitionOldSave`)

| Old version | Migration applied |
|-------------|-------------------|
| 1 → 2 | Adds `everClicked: false` |
| 2 → 3 | Adds `pollutionMaxX/Y`, `cityCentreX/Y` (defaulting to map centre) |

### Load flow

1. `SplashScreen` checks `Storage.getSavedGame()` on startup; enables the "Load game" button if
   a save exists.
2. On "Load game": `Storage.getSavedGame()` deserialises and migrates the JSON; the result is
   passed to `Game` as `savedGame` in place of a `GameMap`.
3. `Game` detects `savedGame.isSavedGame === true` and calls `this.load(savedGame)` which
   delegates to each sub-system's own `load()` method.

---

## 9. Licensing & Trademark Terms

### Code licence

All source files are released under the **GNU General Public License v3.0** (GPLv3). The full
licence text is in `COPYING`. Additional project-specific terms are in `LICENSE`.

### Micropolis Public Name License

`MicropolisPublicNameLicense.md` is a separate trademark licence (Version 1, October 2024)
granted by **Micropolis GmbH** (Netherlands). Key obligations for any fork/derivative:

1. **Attribution required** — include the string _"Micropolis is a registered trademark of
   Micropolis Corporation (Micropolis GmbH) and is licensed here as a courtesy of the owner
   under the Micropolis Public Name License."_ on the main welcome page or credits.
2. **Non-commercial use of the name only** — the GPL source code may be used commercially, but
   the brand identifier "MICROPOLIS" (and variations like "MicropolisX") may not.
3. **No consumer confusion** — do not use the name more prominently than your own brand; no
   marketing materials, domain names, or account names using the mark without written permission.
4. **No domain/subdomain use** — `micropolis.*` or subdomains are not permitted.
5. **Trademark dilution bailout clause** — the licensor may require cessation of use if the
   project contributes to trademark dilution in public proceedings.
6. **Jurisdiction** — Netherlands courts; EU dispute resolution preferred.
7. **Grace period** — 90 days from October 1, 2024 for prior users to achieve compliance.

> **Risk:** This project is currently named "MetroJS" in the repository but retains the
> "micropolisJS" name in `package.json`, all source file headers, `index.html`, and the live
> UI. Any public deployment must comply with the name licence. A deliberate rebrand will require
> touching `package.json`, HTML templates, all JS/TS source headers, and any external
> references.

---

## 10. Known Risks

### Deprecated / legacy dependencies and APIs

| Item | File | Issue |
|------|------|-------|
| `devServer.contentBase` | `webpack.config.js` line 77 | Removed in webpack-dev-server v4+; current devDependency is v5.2.2, so this option is silently ignored. Replace with `devServer.static`. |
| `requestAnimationFrame` fallbacks | `src/game.js` lines 267–270 | `mozRequestAnimationFrame` / `webkitRequestAnimationFrame` are long-dead vendor prefixes. Only `window.requestAnimationFrame` is needed. |
| `window.setTimeout` for event-loop spinning | `src/tileSet.js`, `src/micropolis.js` | Pattern predates `Promise`/`async`; no bug today, but fragile under high load. |
| `canvas.toDataURL()` per tile | `src/tileSet.js` | Generates one data URI per tile (960+ tiles). Slow on startup; a single `ImageBitmap` or `OffscreenCanvas` approach would be faster. |
| TSLint | `tslint.json`, `package.json` | TSLint is officially deprecated (superseded by ESLint + `@typescript-eslint`). No active maintenance. |
| `tsconfig.json` targets ES5 | `tsconfig.json` | All modern browsers support ES2015+. Targeting ES5 produces larger bundles. |
| Mixed JS/TS source | `src/` | ~80 % of source files are plain `.js` with no type-checking. Only data-layer modules have been migrated to TypeScript. |
| jQuery dependency | `package.json`, many `src/*.js` files | jQuery is used pervasively for DOM manipulation and event wiring. It is a production dependency (~31 KB gzipped). |
| Single localStorage save slot | `src/storage.js` | Only one game can be saved at a time. |
| No audio | whole codebase | Sound event constants exist in `messages.ts` (`SOUND_*`) but no audio playback is implemented. |
| `// TODO` comments | `src/simulation.js`, `src/infoBar.js`, `src/tileValues.ts`, others | Several open TODOs: graphs not implemented, L20N not implemented, some tile values undocumented. |
| `// XXX` comments | `src/micropolis.js`, `src/game.js` | `onFallbackError` uses `alert()` (marked for replacement); date-change listener (`DATE_UPDATED`) is commented out. |
| Hardcoded map size | `src/gameMap.js` | Default is 120 × 100; changing it requires updating numerous hard-coded references. |
| `package.json` repository URL | `package.json` | Points to the upstream `graememcc/micropolisJS` repository, not the current fork. |

### Security

- **No server-side component** — the game is entirely client-side; attack surface is limited to
  the build toolchain and the localStorage save format.
- The save format is plain JSON; no integrity checking. A crafted `localStorage` value could
  potentially cause JS errors in the load path (low severity since it is same-origin).

---

## 11. Recommended Modernisation Steps

These are listed in suggested priority order. None should change gameplay behaviour.

### High priority (build / toolchain)

1. **Fix `devServer.contentBase`** → rename to `devServer.static` in `webpack.config.js` to
   resolve the ignored configuration warning.
2. **Replace TSLint** with ESLint + `@typescript-eslint` (TSLint is unmaintained).
3. **Bump `tsconfig.json` target** from `es5` to `es2017` or later to reduce bundle size and
   allow `async/await` in new code.
4. **Update `package.json` repository URL** to point to the current fork.

### Medium priority (code quality)

5. **Remove dead vendor-prefixed rAF fallbacks** (`mozRequestAnimationFrame`,
   `webkitRequestAnimationFrame`) in `src/game.js`.
6. **Replace `devServer.contentBase`** (already noted above).
7. **Migrate remaining `.js` source files to TypeScript** incrementally, starting with the
   most-tested data-layer modules.
8. **Replace `canvas.toDataURL()` tile-splitting** in `tileSet.js` with `createImageBitmap` or
   a single spritesheet draw call to improve startup performance.
9. **Implement `devServer.static`** array in webpack config so the dev server correctly serves
   `dist/` subfolders.

### Low priority / future features

10. **Multi-slot save system** — replace the single `localStorage` entry with an indexed or
    named save system (IndexedDB would also remove the ~5 MB localStorage size cap).
11. **Audio implementation** — the event constants for sound (`SOUND_EXPLOSIONHIGH`, etc.) are
    defined but never played; a Web Audio API layer can be added without touching simulation logic.
12. **Graph view** — `simulation.simTick()` has a `// TODO Graphs` comment; Census already
    accumulates 120-year history arrays suitable for charting.
13. **Remove jQuery** — the library is only used for simple DOM queries and `.click()` / `.on()`
    calls that are trivially replaceable with native APIs; removal reduces the production bundle
    by ~31 KB gzipped.
14. **Implement L20N / i18n** — `infoBar.js` has a `// TODO L20N` comment; the string table in
    `text.js` is the natural starting point.
15. **Trademark / branding** — decide on a permanent name for the MetroJS fork and perform a
    coordinated rename across all source headers, HTML, and `package.json` to comply with (or
    step outside) the Micropolis Public Name License obligations.
