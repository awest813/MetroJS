# Regression Checklist — MetroJS

> **Purpose:** Safety net for modernization work. Run this checklist (manual steps) and the
> automated test suite (automated steps) after every PR before merging.
>
> **Rule:** If any item in this checklist fails, do NOT merge the PR. Open a bug instead.

---

## Automated checks (run first)

```bash
npm test
```

Expected result: all test suites pass, test counts match or exceed the baseline.

**Baseline (2026-04-25):**

| Suite | Tests |
|-------|-------|
| `test/blockMap.ts` | 13 |
| `test/bounds.ts` | 15 (2 pre-existing failures — known issue with commented-out assert calls in `src/bounds.ts`) |
| `test/debugAssert.ts` | 1 |
| `test/direction.ts` | 25 |
| `test/position.ts` | 8 |
| `test/random.ts` | 7 |
| `test/tile.ts` | 93 |
| `test/tileFlags.ts` | 7 _(added by this task)_ |
| `test/tileValues.ts` | 19 _(added by this task)_ |
| `test/messages.ts` | 3 _(added by this task)_ |

> **Total passing baseline:** 197 tests across 10 suites (2 pre-existing failures in `bounds.ts`).

> **Note:** The 2 failures in `test/bounds.ts` are pre-existing. They are caused by the
> assertion calls inside `src/bounds.ts` being commented out. Do not introduce new failures.

---

## Build check

```bash
npm run build
```

Expected result: exits 0, output written to `dist/` without webpack errors or warnings about
unknown configuration keys.

---

## Golden-path manual test

Perform this test in a browser after every non-trivial PR. It covers the full happy-path of the
game without requiring automation.

### Setup

1. Open a terminal in the repo root and run:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:8080` in Chrome or Firefox.
3. Open DevTools → Console tab. Keep it visible throughout the test.

### Step 1 — Start a new city

- [ ] The splash screen loads; a minimap is visible.
- [ ] Click **"Generate another"** one or two times; the minimap changes each time.
- [ ] Click **"Play this map"**.
- [ ] The game canvas loads; the HUD (city name, date, funds, population, score) is visible.
- [ ] No console errors appear.

### Step 2 — Place a residential zone

- [ ] Select the **Residential** tool from the toolbar.
- [ ] Click an empty land tile to place a 3×3 residential zone.
- [ ] The tile changes to show the empty residential zone graphic (grey square).
- [ ] Funds decrease by the tool cost.

### Step 3 — Place a commercial zone

- [ ] Select the **Commercial** tool.
- [ ] Place a 3×3 commercial zone adjacent to the residential zone.
- [ ] Tile changes to the empty commercial zone graphic.

### Step 4 — Place a road

- [ ] Select the **Road** tool.
- [ ] Draw a road segment connecting the residential zone to the commercial zone.
- [ ] Road tiles appear; auto-connect junctions form at intersections.
- [ ] Funds decrease per road segment placed.

### Step 5 — Place a power plant and wire up zones

- [ ] Select the **Coal Power Plant** tool and place it on open land.
- [ ] Select the **Wire** tool and draw power lines connecting the power plant to both zones.
- [ ] After a short wait (a few game ticks), the zone tiles should show the powered graphic
      (brighter / non-flashing).

### Step 6 — Verify blackout flag is cleared

- [ ] If a "Blackouts reported" or "Need more power" notification appears, confirm it disappears
      once the power connection is complete.

### Step 7 — Let the simulation run for several months

- [ ] Set speed to **Fast** (if applicable via the settings window).
- [ ] Wait for the in-game date to advance at least 6 months.
- [ ] Confirm the date counter in the HUD increments.
- [ ] If the residential + commercial zones are powered and connected by road, at least one of
      the following should happen:
      - Small houses begin to appear in the residential zone.
      - The commercial zone begins to show activity tiles.
      - Population count in the HUD becomes non-zero.

### Step 8 — Open the budget window

- [ ] Click the **Budget** toolbar button (or press the keyboard shortcut).
- [ ] The budget window opens.
- [ ] Tax rate and service funding sliders are visible and functional.
- [ ] Closing the window returns to the normal game view without errors.

### Step 9 — Open the evaluation window

- [ ] Click the **Evaluation** toolbar button.
- [ ] The evaluation window shows a city score and classification (e.g. "Village").
- [ ] Closing the window returns to the normal game view.

### Step 10 — Save the game

- [ ] Click the **Save** toolbar button.
- [ ] A confirmation dialog appears.
- [ ] Confirm the save.
- [ ] A success indication appears or the dialog closes without error.

### Step 11 — Load the game

- [ ] Reload the page (`Ctrl+R`).
- [ ] The splash screen appears. A **"Load game"** button is present and enabled.
- [ ] Click **"Load game"**.
- [ ] The city state is restored: same map layout, same date, same funds.
- [ ] No console errors appear.

### Step 12 — Trigger a disaster (optional smoke test)

- [ ] Click the **Disaster** toolbar button.
- [ ] Select **"Start a fire"** (or any available disaster).
- [ ] Confirm fire tiles appear on the map.
- [ ] The fire eventually spreads or is extinguished.
- [ ] No uncaught JavaScript exceptions in the console.

---

## Per-behavior checklist

Use this table when a PR touches a specific subsystem. Tick the relevant rows.

| # | Behavior | How to verify | Touched by PR? |
|---|----------|--------------|----------------|
| 1 | Start a new city from splash screen | Golden path Step 1 | |
| 2 | Generate a new map | Golden path Step 1 (Generate another) | |
| 3 | Place a residential zone | Golden path Step 2 | |
| 4 | Place a commercial zone | Golden path Step 3 | |
| 5 | Place an industrial zone | Place via Industrial tool; check tile graphic | |
| 6 | Place a road | Golden path Step 4 | |
| 7 | Road auto-connect (junctions) | Draw an intersection; verify correct tile | |
| 8 | Place a power wire | Golden path Step 5 | |
| 9 | Power propagation activates zones | Golden path Steps 5–6 | |
| 10 | City grows over time (population) | Golden path Step 7 | |
| 11 | Tax collection | Budget window; advance time; confirm funds change | |
| 12 | Budget window | Golden path Step 8 | |
| 13 | Evaluation / city score | Golden path Step 9 | |
| 14 | Save game | Golden path Step 10 | |
| 15 | Load game | Golden path Step 11 | |
| 16 | Disaster triggers | Golden path Step 12 | |
| 17 | Season change (snow tiles) | Advance date to October; verify snow tile set | |
| 18 | Sprite animation (trains/planes) | Watch canvas; animated sprites should appear | |
| 19 | Bulldoze a tile | Select Bulldozer; click a road; verify removed | |
| 20 | Query tool (tile info) | Select Query; click any tile; verify info window | |

---

## What to look for in the console

The following console output is **expected** and harmless:

_(none currently known)_

The following output is **always a regression signal**:

- Any uncaught `TypeError`, `ReferenceError`, or `Error` in the console.
- `"Assertion failed:"` messages from `src/debugAssert.ts`.
- `"Copying from incompatible blockMap!"` appearing at unexpected times.
- Blank/white canvas after the game starts.
- HUD showing `NaN` for funds, population, or score.

---

## Why the `.js` simulation files are not directly tested

The simulation engine (`simulation.js`, `mapScanner.js`, `traffic.js`, `powerManager.js`, etc.)
uses CommonJS `require()` at the module level and depends on browser APIs (jQuery DOM
manipulation, `localStorage`, `HTMLCanvasElement`) that are not available in Node.js without
significant mocking. Wiring up these mocks would require architectural changes that this task
deliberately avoids.

The automated tests in `test/` instead target the TypeScript data-layer modules (tile values,
tile flags, block maps, positions, directions, random numbers, event message names) — the
foundational constants and pure-logic utilities that the simulation engine depends on. Any
accidental renumbering, bit collision, or duplicate event name in those files would be caught
before the simulation is even instantiated.

End-to-end simulation correctness is verified by the golden-path manual test above.
