# Modernization Plan — MetroJS

> **Created:** 2026-04-25  
> **Based on:** [docs/TECHNICAL_AUDIT.md](./TECHNICAL_AUDIT.md)  
> **Strategy:** Small, reversible, PR-sized steps. Simulation behaviour is frozen throughout.

---

## Guiding Principles

- **No big-bang rewrites.** Every step must be independently mergeable and revertable.
- **Simulation behaviour is frozen.** The files listed in the [Protected Files](#protected-files) section must not change logic during modernization.
- **Additive features are safest.** New capabilities (audio, graphs, multi-save) can be added alongside existing code with no risk to gameplay.
- **Toolchain first.** Fixing the build and linting infrastructure before touching source code reduces noise in later PRs.

---

## Risk Legend

| Label | Meaning |
|-------|---------|
| 🟢 **safe** | No runtime behaviour change possible; purely mechanical or additive. |
| 🟡 **medium risk** | May change build output, startup performance, or UI behaviour; requires careful smoke-testing. |
| 🔴 **high risk** | Could subtly alter simulation state, rendering accuracy, or save-file compatibility; needs regression tests before merging. |

---

## Protected Files

The following files contain the simulation engine. They **must not** be substantially rewritten during any modernization step. Type-annotation-only changes (renaming `.js` → `.ts`, adding JSDoc/type imports at the top) are the only permitted edits.

| File | Why protected |
|------|---------------|
| `src/simulation.js` | Root engine controller; tick model, phase sequencing |
| `src/mapScanner.js` | Full-map zone evaluation pass — heart of zone growth |
| `src/traffic.js` | Traffic pathfinding; density values feed valves |
| `src/powerManager.js` | Flood-fill power propagation; incorrect changes break zone activation |
| `src/valves.js` | R/C/I demand calculation; drives all zone growth/decline |
| `src/budget.js` | Tax and service funding; wrong numbers show up immediately in gameplay |
| `src/census.js` | Population statistics and history; feeds evaluation and graphs |
| `src/commercial.js` | Commercial zone evaluation |
| `src/industrial.js` | Industrial zone evaluation |
| `src/residential.js` | Residential zone evaluation |
| `src/disasterManager.js` | Disaster trigger and propagation logic |
| `src/evaluation.js` | City score and classification |
| `src/worldEffects.js` | Applies simulation results back to tile grid |
| `src/connector.js` | Low-level tile connection logic for roads/rails/wires |
| `src/gameMap.js` | Tile data store; tile index math is load-bearing |
| `src/storage.js` | Save/load wire-up; version migration must stay intact |

---

## Changes That Could Alter Gameplay Behaviour

Any PR touching the following areas requires extra caution:

1. **`src/random.ts` (PRNG)** — The seeded random number generator is called extensively by simulation code. Any change to its output sequence will alter deterministic replay.
2. **`src/tileFlags.ts` / `src/tileValues.ts`** — Bit-flag or tile-index renumbering will corrupt saved games and break zone logic.
3. **`src/worldEffects.js`** — Writes simulation output back to the tile grid; a mistimed write changes visible game state.
4. **`src/animationManager.js`** — Frame timing is tied to wall-clock time; changes could desync blink animations from their simulation triggers.
5. **`src/connector.js`** — Auto-connect logic for road/rail/wire placement affects which tiles get placed and therefore affects traffic and power routing.
6. **`src/storage.js` `transitionOldSave`** — Any version bump to the save format without a corresponding migration path permanently breaks existing saves.

---

## Phase 1 — Toolchain Fixes

These changes touch only configuration files. No runtime code changes.

---

### Step 1.1 — Fix `devServer.contentBase` → `devServer.static`

**Risk:** 🟢 safe  
**File:** `webpack.config.js`  
**What:** Rename the deprecated `devServer.contentBase` option to `devServer.static` (required by webpack-dev-server v4+; current devDependency is v5.2.2). Also ensure the static array lists `dist/` so sub-folder assets are served correctly.  
**Why it doesn't affect gameplay:** Dev-server configuration only; production bundle is unchanged.

**Test point after merge:**
- Run `npm run dev` and confirm the dev server starts without warnings about unknown options.
- Load the game in a browser and verify tiles, sprites, and the CSS background texture all load.

---

### Step 1.2 — Update `package.json` repository URL

**Risk:** 🟢 safe  
**File:** `package.json`  
**What:** Change the `"repository"` field from the upstream `graememcc/micropolisJS` URL to `awest813/MetroJS`.  
**Why it doesn't affect gameplay:** Metadata only; no runtime effect.

**Test point after merge:**
- `npm install` completes without errors.
- `npm test` passes (no tests depend on this field).

---

### Step 1.3 — Replace TSLint with ESLint + `@typescript-eslint`

**Risk:** 🟡 medium risk  
**Files:** `tslint.json` (delete), `package.json`, new `.eslintrc.js` / `.eslintignore`  
**What:** Remove the `tslint` devDependency and add `eslint`, `@typescript-eslint/parser`, and `@typescript-eslint/eslint-plugin`. Migrate existing TSLint rules to their ESLint equivalents. Update the `"lint"` npm script.  
**Why medium risk:** Rule mappings may expose pre-existing lint warnings that were previously silent; none affect runtime.

**Test point after merge:**
- `npm run lint` exits 0 on the unmodified codebase (or with only known pre-existing warnings).
- `npm test` still passes.

---

### Step 1.4 — Bump `tsconfig.json` target from ES5 to ES2017

**Risk:** 🟡 medium risk  
**File:** `tsconfig.json`  
**What:** Change `"target": "es5"` to `"target": "es2017"` (or `"es2020"`). Also update `"lib"` to match. This allows `async/await` syntax in new TypeScript files without transpilation overhead.  
**Why medium risk:** ts-jest uses the same tsconfig for tests; verify tests still run. Bundle output changes (no Promises polyfill needed), which could expose edge cases in very old browsers — acceptable since the project targets modern browsers.

**Test point after merge:**
- `npm test` passes.
- `npm run build` completes; bundle size is the same or smaller.
- Manual smoke test: game loads and plays normally in Chrome and Firefox.

---

## Phase 2 — Dead Code Removal

Small, focused removals of clearly dead code. Each step is its own PR.

---

### Step 2.1 — Remove vendor-prefixed `requestAnimationFrame` fallbacks

**Risk:** 🟢 safe  
**File:** `src/game.js` (lines ~267–270)  
**What:** Delete the references to `mozRequestAnimationFrame` and `webkitRequestAnimationFrame`. Both prefixes have been removed from all browsers for years; only the unprefixed `window.requestAnimationFrame` is needed.  
**Why it doesn't affect gameplay:** The unprefixed version is always available on any browser that can run the game.

**Test point after merge:**
- Manual smoke test: animation loop runs normally; simulation ticks; no console errors on load.

---

### Step 2.2 — Replace `alert()` in `onFallbackError` with a DOM notification

**Risk:** 🟢 safe  
**File:** `src/micropolis.js`  
**What:** The `// XXX` comment already flags this. Replace the `alert()` call that fires when the tile-sheet fallback fails with a visible DOM error banner (e.g. an absolutely-positioned `<div>`). No simulation code is touched.  
**Why it doesn't affect gameplay:** This code path only fires when both the primary tile-sheet load and the base64 fallback fail — an extreme error state that ends the startup sequence before the simulation begins.

**Test point after merge:**
- Simulate the error path in a test environment (e.g. by temporarily returning a bad URI) and verify the banner appears.
- Normal startup is unaffected.

---

## Phase 3 — TypeScript Migration (Incremental, Non-Simulation Files)

Migrate one file at a time. Each file is its own PR. **Never migrate simulation engine files** (see [Protected Files](#protected-files)) — those are excluded from this phase.

Recommended migration order (safest first, lowest coupling):

---

### Step 3.1 — Migrate `src/config.js` to TypeScript

**Risk:** 🟢 safe  
**File:** `src/config.js` → `src/config.ts`  
**What:** Rename the file, add explicit types for the exported debug flags, update the webpack resolve config if needed.  
**Why safe:** `config.js` only exports boolean flags; zero logic.

**Test point after merge:**
- `npm run build` succeeds.
- `npm test` passes.
- Debug mode (`?debug=1`) still activates the debug window.

---

### Step 3.2 — Migrate `src/text.js` to TypeScript

**Risk:** 🟢 safe  
**File:** `src/text.js` → `src/text.ts`  
**What:** Rename and add type annotations. Expose the string table as a typed record.  
**Why safe:** Pure data; no logic.

**Test point after merge:**
- `npm run build` succeeds.
- `npm run lint` passes.
- All UI strings render correctly in-game.

---

### Step 3.3 — Migrate `src/eventEmitter.js` to TypeScript

**Risk:** 🟡 medium risk  
**File:** `src/eventEmitter.js` → `src/eventEmitter.ts`  
**What:** Rename and add types. The mixin pattern (decorating arbitrary constructor prototypes) requires careful use of TypeScript generics or declaration merging.  
**Why medium risk:** The event emitter is used across nearly every module; a type error here generates many downstream errors. Strictly a type-level change — runtime output must be identical.

**Test point after merge:**
- `npm run build` succeeds with no new errors.
- `npm test` passes.
- Emit/subscribe flow works: open the budget window, trigger a disaster — verify events fire.

---

### Step 3.4 — Migrate `src/miscUtils.js` to TypeScript

**Risk:** 🟢 safe  
**File:** `src/miscUtils.js` → `src/miscUtils.ts`  
**What:** Rename and add types to DOM/math utility helpers.

**Test point after merge:**
- `npm run build` succeeds.
- Mouse position, number formatting, and DOM helpers work in-game.

---

### Step 3.5 — Migrate `src/animationManager.js` to TypeScript

**Risk:** 🟡 medium risk  
**File:** `src/animationManager.js` → `src/animationManager.ts`  
**What:** Add types; do not change the timing constants or the `_data` mapping.  
**Why medium risk:** Animation timing is visually coupled to simulation tick output. Logic must be preserved exactly; only add types.

**Test point after merge:**
- `npm run build` succeeds.
- Animated tiles (water, fire, blinking buildings) animate at the expected rate in-game.

---

### Step 3.6 — Migrate `src/tileUtils.js` to TypeScript

**Risk:** 🟡 medium risk  
**File:** `src/tileUtils.js` → `src/tileUtils.ts`  
**What:** Add types to tile helper functions.  
**Why medium risk:** Tile helpers are called from both simulation and rendering paths. Incorrect types could mask bugs, but runtime output must be unchanged.

**Test point after merge:**
- `npm run build` succeeds.
- Zone placement, bulldozing, and tile queries work correctly in-game.

---

*Continue the same pattern for each remaining non-simulation `.js` file: one file per PR, types only, no logic changes.*

---

## Phase 4 — Rendering Performance (Non-Gameplay)

---

### Step 4.1 — Replace `canvas.toDataURL()` tile splitting with `createImageBitmap`

**Risk:** 🟡 medium risk  
**File:** `src/tileSet.js`  
**What:** The current startup sequence calls `canvas.toDataURL()` once per tile (~960+ calls), generating hundreds of data URIs. Replace with `createImageBitmap()` calls that crop sub-rectangles from the source image directly into `ImageBitmap` objects. Update `gameCanvas.js` to use `drawImage(imageBitmap, …)` instead of the existing data-URI approach.  
**Why medium risk:** Changes the startup code path and the rendering primitive used for every tile. Gameplay logic is unaffected, but visual output must be pixel-identical. The base64 fallback path in `micropolis.js` must also be updated.

**Gameplay risk:** None — tile *appearance* only.

**Test point after merge:**
- Startup time is measurably faster (profile in DevTools).
- Visual regression: all tile types render identically to the previous build (side-by-side screenshot comparison).
- The base64 fallback path (for `file://` loading) still works.

---

## Phase 5 — Additive Features (Safe to Add Without Breaking Simulation)

These steps introduce entirely new capabilities. The simulation engine is not modified.

---

### Step 5.1 — Implement Web Audio API sound layer

**Risk:** 🟢 safe  
**Files:** New `src/audioManager.js` (or `.ts`); `src/game.js` (subscribe to `SOUND_*` events)  
**What:** The `SOUND_EXPLOSIONHIGH`, `SOUND_BULLDOZE`, and other constants are already defined in `messages.ts` and emitted by simulation code. Add an `AudioManager` that subscribes to these events and plays corresponding audio clips. Include a mute toggle wired to the existing settings window.  
**Why safe:** Purely additive. If the audio manager is absent or silent, gameplay is unchanged.

**Test point after merge:**
- Sounds play on expected events (bulldoze, disaster, zone growth).
- Mute toggle silences all sounds.
- Disabling audio (e.g. no audio files present) does not break gameplay.

---

### Step 5.2 — Implement graph / history view

**Risk:** 🟢 safe  
**Files:** New `src/graphWindow.js` (or `.ts`); `src/game.js` (wire toolbar button); `src/census.js` (read-only access)  
**What:** `Census` already accumulates 120-year and 10-year history arrays for population, crime, and other metrics. Render these as line charts in a new modal window. The `// TODO Graphs` comment in `simulation.js` marks the intended hook point. Census data is read-only; no simulation writes are added.  
**Why safe:** Purely additive modal; simulation tick is unmodified.

**Test point after merge:**
- Graph window opens from toolbar.
- Data plotted matches Census arrays (verify with debugger).
- Closing the window does not affect simulation state.

---

### Step 5.3 — Multi-slot save system

**Risk:** 🔴 high risk  
**Files:** `src/storage.js`, `src/saveWindow.js`, `src/splashScreen.js`, `src/game.js`  
**What:** Replace the single `"micropolisJSGame"` localStorage key with a named/indexed slot system. Consider using IndexedDB (removes the ~5 MB localStorage cap). Introduce a save version bump (`4`) with a migration that reads the old single-slot key and imports it as slot 1.  
**Why high risk:** Changes the persistence layer. A migration bug can silently corrupt or lose existing saves. Must be designed with a rollback path (keep the old key intact until the user explicitly migrates).

**Gameplay risk:** None to running simulation; risk is entirely in save/load path.

**Test point after merge:**
- Existing single-slot saves are automatically imported as slot 1.
- Multiple saves can be created, overwritten, and loaded independently.
- A save from the old format (version 3) loads correctly via the migration.
- Corrupt or missing save data is handled gracefully with a user-visible error.

---

### Step 5.4 — Remove jQuery

**Risk:** 🟡 medium risk  
**Files:** All UI `src/*.js` files that call `$()`, `.click()`, `.on()`, `.show()`, `.hide()`, `.text()`, etc.  
**What:** Replace each jQuery call with its native DOM equivalent. Do this file-by-file, each file in its own PR, starting with the smallest UI files (e.g. `touchWarnWindow.js`, `nagWindow.js`). Do not attempt a full removal in a single PR.  
**Why medium risk:** jQuery's event delegation and `.on()` semantics differ subtly from `addEventListener`. Each file needs a focused smoke test. Simulation code is unaffected.

**Recommended file order (smallest → largest, by jQuery call count):**
1. `touchWarnWindow.js`
2. `nagWindow.js`
3. `screenshotLinkWindow.js`
4. `congratsWindow.js`
5. `rci.js`
6. `notification.js`
7. `infoBar.js`
8. `queryWindow.js`
9. `disasterWindow.js`
10. `saveWindow.js`
11. `settingsWindow.js`
12. `evaluationWindow.js`
13. `budgetWindow.js`
14. `game.js` (last — highest coupling)

**Test point after each file:**
- The window/component under test opens, renders, and closes correctly.
- No jQuery `$` references remain in the migrated file.
- Other windows are unaffected.

---

## Phase 6 — Branding / Compliance (Coordinate Separately)

---

### Step 6.1 — Trademark compliance rename

**Risk:** 🟡 medium risk  
**Files:** `package.json`, `index.html`, `about.html`, `name_license.html`, all `src/` file headers, `README.md`  
**What:** Decide on the permanent public name for this fork (currently "MetroJS" in the repository, but "micropolisJS" in source headers and the live UI). Perform a coordinated find-and-replace across all affected files in a single PR. Preserve the required attribution string per the Micropolis Public Name License.  
**Why medium risk:** Touching many files at once; merge conflicts are likely if other PRs are in flight. No simulation logic is changed.

**Gameplay risk:** None.

**Test point after merge:**
- `npm run build` succeeds.
- The live UI displays the new name correctly in the title bar, about page, and all windows.
- The required Micropolis Public Name License attribution string is present on the main welcome/splash screen.

---

## Summary Table

| Step | Description | Risk | Gameplay Impact |
|------|-------------|------|-----------------|
| 1.1 | Fix `devServer.static` in webpack | 🟢 safe | None |
| 1.2 | Update `package.json` repo URL | 🟢 safe | None |
| 1.3 | Replace TSLint with ESLint | 🟡 medium | None |
| 1.4 | Bump tsconfig target to ES2017 | 🟡 medium | None |
| 2.1 | Remove vendor-prefixed rAF | 🟢 safe | None |
| 2.2 | Replace `alert()` with DOM error banner | 🟢 safe | None |
| 3.1 | Migrate `config.js` to TS | 🟢 safe | None |
| 3.2 | Migrate `text.js` to TS | 🟢 safe | None |
| 3.3 | Migrate `eventEmitter.js` to TS | 🟡 medium | None |
| 3.4 | Migrate `miscUtils.js` to TS | 🟢 safe | None |
| 3.5 | Migrate `animationManager.js` to TS | 🟡 medium | Visual timing only |
| 3.6 | Migrate `tileUtils.js` to TS | 🟡 medium | None |
| 4.1 | Replace `toDataURL()` with `createImageBitmap` | 🟡 medium | Visual / startup only |
| 5.1 | Add Web Audio API sound layer | 🟢 safe | Additive only |
| 5.2 | Implement graph / history view | 🟢 safe | Additive only |
| 5.3 | Multi-slot save system | 🔴 high | Save/load path only |
| 5.4 | Remove jQuery (per-file) | 🟡 medium | UI only |
| 6.1 | Trademark compliance rename | 🟡 medium | None |
