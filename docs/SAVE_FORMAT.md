# Save Format — MicropolisJS

A reference document for the save/load data structure used by MicropolisJS.
Its purpose is to protect save compatibility during any future porting or
refactoring work.

---

## Quick Facts

| Property | Value |
|---|---|
| Storage API | `window.localStorage` |
| Key | `"micropolisJSGame"` |
| Serialization | `JSON.stringify` / `JSON.parse` (no compression) |
| Current version | `3` (constant `Storage.CURRENT_VERSION`) |
| Versions with migration support | `1`, `2` |
| Number of saves | One slot — the same key is overwritten on every save |

---

## Where to Find the Code

| File | Role |
|---|---|
| `src/storage.js` | Read/write to `localStorage`; version check; migration switch |
| `src/game.js` | `Game.prototype.save` / `.load` — top-level orchestration |
| `src/simulation.js` | `Simulation.prototype.save` / `.load` — sim-clock + speed + level |
| `src/gameMap.js` | `GameMap.prototype.save` / `.load` — map dimensions + tile array |
| `src/budget.js` | `Budget.prototype.save` / `.load` — financial state |
| `src/census.js` | `Census.prototype.save` / `.load` — population history arrays |
| `src/evaluation.js` | `Evaluation.prototype.save` / `.load` — city class + score |
| `src/valves.js` | `Valves.prototype.save` / `.load` — demand valve state |
| `src/baseTool.js` | `BaseTool.save` / `.load` — global `autoBulldoze` toggle |

---

## Save Trigger

Saves are **always user-initiated**. The player presses the save button,
`InputStatus` emits `Messages.SAVE_REQUESTED`, `Game.handleSave()` calls
`Game.prototype.save()`, which gathers a single flat `saveData` object and
hands it to `Storage.saveGame()`.

There is no auto-save.

---

## Complete Save Data Schema

All subsystems write their properties into **one shared flat object**
(`saveData`). There is no nesting by subsystem — every key lives at the top
level of the JSON object.

### Top-level metadata (written by `Storage.saveGame` and read back by `Storage.getSavedGame`)

| Key | Type | Description |
|---|---|---|
| `version` | `number` | Schema version number. Currently `3`. Added by `Storage.saveGame()` just before writing to `localStorage`. |
| `isSavedGame` | `boolean` | Set to `true` by `Storage.getSavedGame()` after reading; used by `Game` constructor to branch between new game and loaded game. **Not persisted to storage** — added in memory on load. |

### Game state (`Game.prototype.save`)

| Key | Type | Description |
|---|---|---|
| `name` | `string` | City name chosen by the player on the splash screen. |
| `everClicked` | `boolean` | Whether the player has ever clicked a nag-window dismiss. Controls whether the 30-minute nag timer fires on load. |

### Simulation clock (`simulation.js saveProps`)

| Key | Type | Description |
|---|---|---|
| `_cityTime` | `number` | Integer tick counter. Drives census, tax, and evaluation scheduling. |
| `_speed` | `number` | Active speed setting (one of `SPEED_PAUSED=0`, `SPEED_SLOW=1`, `SPEED_MED=2`, `SPEED_FAST=3`). |
| `_gameLevel` | `number` | Difficulty level (one of `LEVEL_EASY=0`, `LEVEL_MED=1`, `LEVEL_HARD=2`). |

### Map (`gameMap.js saveProps` + tile array)

| Key | Type | Description |
|---|---|---|
| `width` | `number` | Map width in tiles. Currently always `120`. |
| `height` | `number` | Map height in tiles. Currently always `100`. |
| `cityCentreX` | `number` | X-coordinate of the computed city centre (used for commercial zone scoring). |
| `cityCentreY` | `number` | Y-coordinate of the computed city centre. |
| `pollutionMaxX` | `number` | X-coordinate of the most-polluted tile (where monsters spawn). |
| `pollutionMaxY` | `number` | Y-coordinate of the most-polluted tile. |
| `map` | `Array<{value: number}>` | Flat row-major array of `width × height` tile objects. Each object has a single `value` field that is the **raw combined tile value**: tile-type bits AND flag bits OR'd together as a single integer (see Tile Encoding below). Array length must equal `width × height`. |

### Budget (`budget.js saveProps`)

| Key | Type | Description |
|---|---|---|
| `autoBudget` | `boolean` | Whether the budget is managed automatically. |
| `totalFunds` | `number` | Current city funds in simulated dollars. |
| `cityTax` | `number` | Tax rate (0–20). |
| `roadPercent` | `number` | Funding fraction for roads (0.0–1.0). |
| `firePercent` | `number` | Funding fraction for fire stations (0.0–1.0). |
| `policePercent` | `number` | Funding fraction for police stations (0.0–1.0). |
| `roadSpend` | `number` | Actual dollar amount allocated to roads last period. |
| `fireSpend` | `number` | Actual dollar amount allocated to fire stations last period. |
| `policeSpend` | `number` | Actual dollar amount allocated to police stations last period. |
| `roadMaintenanceBudget` | `number` | Full-funding cost for all road tiles. |
| `fireMaintenanceBudget` | `number` | Full-funding cost for all fire stations. |
| `policeMaintenanceBudget` | `number` | Full-funding cost for all police stations. |
| `roadEffect` | `number` | Current road quality multiplier (0–32). Affects road deterioration. |
| `policeEffect` | `number` | Current police effectiveness (0–1000). |
| `fireEffect` | `number` | Current fire effectiveness (0–1000). |

### Census / statistics (`census.js saveProps`)

| Key | Type | Description |
|---|---|---|
| `resPop` | `number` | Current residential population sum. |
| `comPop` | `number` | Current commercial population sum. |
| `indPop` | `number` | Current industrial population sum. |
| `crimeRamp` | `number` | Smoothed crime level (lag filter for graph). |
| `pollutionRamp` | `number` | Smoothed pollution level (lag filter for graph). |
| `landValueAverage` | `number` | Average land value across developed tiles. |
| `pollutionAverage` | `number` | Average pollution across polluted tiles. |
| `crimeAverage` | `number` | Average crime rate across developed tiles. |
| `totalPop` | `number` | Computed total population (res + com + ind scaled). |
| `resHist10` | `number[120]` | 10-cycle residential population history (array of 120). |
| `resHist120` | `number[120]` | 120-cycle residential population history. |
| `comHist10` | `number[120]` | 10-cycle commercial population history. |
| `comHist120` | `number[120]` | 120-cycle commercial population history. |
| `indHist10` | `number[120]` | 10-cycle industrial population history. |
| `indHist120` | `number[120]` | 120-cycle industrial population history. |
| `crimeHist10` | `number[120]` | 10-cycle crime history. |
| `crimeHist120` | `number[120]` | 120-cycle crime history. |
| `moneyHist10` | `number[120]` | 10-cycle cash-flow history. |
| `moneyHist120` | `number[120]` | 120-cycle cash-flow history. |
| `pollutionHist10` | `number[120]` | 10-cycle pollution history. |
| `pollutionHist120` | `number[120]` | 120-cycle pollution history. |

### Evaluation (`evaluation.js saveProps`)

| Key | Type | Description |
|---|---|---|
| `cityClass` | `string` | Current city classification: one of `"VILLAGE"`, `"TOWN"`, `"CITY"`, `"CAPITAL"`, `"METROPOLIS"`, `"MEGALOPOLIS"`. |
| `cityScore` | `number` | City health score (0–1000, smoothed average). |

### Demand Valves (`valves.js`)

| Key | Type | Description |
|---|---|---|
| `resValve` | `number` | Residential demand pressure (−2000 … +2000). |
| `comValve` | `number` | Commercial demand pressure (−1500 … +1500). |
| `indValve` | `number` | Industrial demand pressure (−1500 … +1500). |

### Tool settings (`baseTool.js`)

| Key | Type | Description |
|---|---|---|
| `autoBulldoze` | `boolean` | Whether the bulldozer auto-clears obstacles when placing tiles. |

---

## Tile Encoding

Each entry in the `map` array is `{value: N}` where `N` is a 16-bit integer
that **packs both the tile type and all tile flags into a single number**:

```
Bits 15-10  (mask 0xFC00)  — Status flags
  bit 15  POWERBIT  0x8000  tile has power
  bit 14  CONDBIT   0x4000  tile can conduct electricity
  bit 13  BURNBIT   0x2000  tile can be lit / burned
  bit 12  BULLBIT   0x1000  tile is bulldozable
  bit 11  ANIMBIT   0x0800  tile is animated
  bit 10  ZONEBIT   0x0400  tile is the centre of a zone

Bits 9-0   (mask 0x03FF)  — Tile type index (0–1023)
```

The tile type index maps to a graphical tile in the sprite sheet and determines
the tile's simulated properties (road, zone, power plant, etc.).

On save: `Tile.getRawValue()` returns this packed integer directly.  
On load: `GameMap.setTileValue(x, y, value)` accepts the raw packed integer and
reconstructs the full `Tile` (value + flags) without any unpacking needed.

---

## Version History

Versions are managed in `src/storage.js`. The `transitionOldSave(savedGame)`
function runs when the stored `version` field does not match
`Storage.CURRENT_VERSION` (currently `3`).

### Version 1 → 2 migration (applied when `version === 1`)

Added:

| Key | Default on migration |
|---|---|
| `everClicked` | `false` |

### Version 2 → 3 migration (applied when `version <= 2`, via fall-through)

Added:

| Key | Default on migration |
|---|---|
| `pollutionMaxX` | `Math.floor(width / 2)` |
| `pollutionMaxY` | `Math.floor(height / 2)` |
| `cityCentreX` | `Math.floor(width / 2)` |
| `cityCentreY` | `Math.floor(height / 2)` |

### Version 3 (current)

No migration required; loaded directly.

---

## Load Flow

```
Storage.getSavedGame()
  ├─ localStorage.getItem("micropolisJSGame")
  ├─ JSON.parse(...)
  ├─ if version !== CURRENT_VERSION → transitionOldSave()
  └─ set isSavedGame = true
        ↓
SplashScreen.handleLoad()
  └─ new Game(savedGame, ...)
        ↓
Game constructor
  ├─ detects gameMap.isSavedGame → creates blank GameMap(120, 100)
  ├─ new Simulation(blankMap, difficulty, speed, savedGame)
  │     └─ Simulation constructor calls Simulation.load(savedGame)  ← only if savedGame provided
  └─ Game.load(savedGame)
        ├─ game.name = saveData.name
        ├─ game.everClicked = saveData.everClicked
        ├─ BaseTool.load(saveData)
        └─ simulation.load(saveData)
              ├─ reads _cityTime, _speed, _gameLevel
              ├─ GameMap.load(saveData)      ← map dimensions + tile array
              ├─ Evaluation.load(saveData)   ← cityClass, cityScore
              ├─ Valves.load(saveData)       ← resValve, comValve, indValve
              ├─ Budget.load(saveData)       ← financial state
              └─ Census.load(saveData)       ← population history
```

---

## Save Flow

```
Game.handleSave()
  └─ Game.prototype.save()
        ├─ saveData = { name, everClicked }
        ├─ BaseTool.save(saveData)         ← adds autoBulldoze
        ├─ simulation.save(saveData)
        │     ├─ adds _cityTime, _speed, _gameLevel
        │     ├─ GameMap.save(saveData)    ← adds map dimensions + tile array
        │     ├─ Evaluation.save(saveData) ← adds cityClass, cityScore
        │     ├─ Valves.save(saveData)     ← adds resValve, comValve, indValve
        │     ├─ Budget.save(saveData)     ← adds 15 budget fields
        │     └─ Census.save(saveData)     ← adds 20 census / history fields
        └─ Storage.saveGame(saveData)
              ├─ saveData.version = CURRENT_VERSION (3)
              └─ localStorage.setItem("micropolisJSGame", JSON.stringify(saveData))
```

---

## What Is NOT Saved

The following runtime state is **not** included in the save file and is
recomputed or reset on load:

| State | Where it lives | Reason not saved |
|---|---|---|
| Sprite positions (trains, monsters, etc.) | `SpriteManager` | Ephemeral; simulation restarts cleanly |
| Block maps (pollution density, crime rate, traffic density, etc.) | `blockMapUtils` | Recomputed after first scan cycle |
| Power grid state | `PowerManager._powerStack` | Rebuilt by first power scan |
| Disaster cooldown counter | `DisasterManager._floodCount` | Ephemeral |
| Canvas scroll position | `GameCanvas` | Not persisted |
| Current tool selection | `InputStatus` | Not persisted |
| `disastersEnabled` flag | `DisasterManager` | Resets to `false` on each load |
| `_simCycle` / `_phaseCycle` | `Simulation` | Reset to 0; simulation resumes from phase 0 |

---

## ⚠️ Compatibility Warning

The following changes would **silently corrupt or reject** existing saves.
Before making any of these changes, a version bump and a new migration branch
in `transitionOldSave()` are required.

### Renaming or removing existing keys

Every key listed in any `saveProps` array (or explicitly set/read in any
`save`/`load` function) is part of the public contract. Renaming or removing a
key without a migration will cause `undefined` to be read back on load.

**High-risk fields** (silent wrong behaviour on missing value):
- `_cityTime` — time counter resets to 0; taxes fire early
- `totalFunds` — city starts with 0 funds
- `cityTax` — resets to constructor default of 7
- `autoBudget` — resets to `true`
- `resValve` / `comValve` / `indValve` — all demand pressure lost; zones
  will neither grow nor shrink until valves rebuild (many game ticks)
- `map` — entire map array missing; game will crash loading tiles

### Changing the `localStorage` key

`Storage.KEY` is the constant `"micropolisJSGame"`. Changing this string would
make every existing player's saved city invisible (though the data remains
in storage under the old key).

### Changing the tile encoding format

The `map` array stores raw `Tile.getRawValue()` integers. Any change to how
flag bits are packed into the integer (e.g. moving `POWERBIT` to a different
bit position) would corrupt all tile flags in every saved game.

### Changing `width` or `height` defaults

`GameMap` always loads `width × height` tiles from `saveData.map`. If the
default map size changes from `120 × 100`, any save created at the old size
will be loaded into a mismatched map.

### Removing version migration support

`transitionOldSave()` currently supports versions `1` and `2`. The
`default: throw` branch will crash on any unknown version. Do not remove the
case `1` or `case 2` migration paths while users may still have saves at those
versions in the wild.

### Changing `Storage.CURRENT_VERSION` without adding a migration

Bumping `CURRENT_VERSION` without adding a corresponding case in
`transitionOldSave()` for the previous version will cause all current saves to
hit the `default: throw` branch and fail to load.

### Adding required new keys without defaults in `transitionOldSave()`

If a future version adds a field that must be present for the game to run
correctly (not just a nice-to-have), existing saves will load without that
field and may misbehave silently. Always provide a sensible default in the
migration path.

### Changing the census history array length

All 12 history arrays (`resHist10`, `resHist120`, etc.) are serialized as
full 120-element arrays. If the history length is changed, the arrays saved by
old versions will be the wrong size. The `rotate10Arrays` / `rotate120Arrays`
functions pop from the end and unshift at the front, so an off-by-one in length
will cause slow corruption of graph data.

---

## Annotated Example Save (minimal, trimmed for readability)

```json
{
  "version": 3,
  "name": "MyTown",
  "everClicked": false,
  "autoBulldoze": true,

  "_cityTime": 204,
  "_speed": 2,
  "_gameLevel": 0,

  "width": 120,
  "height": 100,
  "cityCentreX": 64,
  "cityCentreY": 52,
  "pollutionMaxX": 60,
  "pollutionMaxY": 50,
  "map": [
    {"value": 1},
    {"value": 1},
    {"value": 18952},
    "… (120×100 = 12,000 entries total) …"
  ],

  "totalFunds": 20000,
  "cityTax": 7,
  "autoBudget": true,
  "roadPercent": 1,
  "firePercent": 1,
  "policePercent": 1,
  "roadSpend": 0,
  "fireSpend": 0,
  "policeSpend": 0,
  "roadMaintenanceBudget": 0,
  "fireMaintenanceBudget": 0,
  "policeMaintenanceBudget": 0,
  "roadEffect": 32,
  "policeEffect": 1000,
  "fireEffect": 1000,

  "cityClass": "VILLAGE",
  "cityScore": 500,

  "resValve": 120,
  "comValve": 0,
  "indValve": 0,

  "resPop": 0,
  "comPop": 0,
  "indPop": 0,
  "crimeRamp": 0,
  "pollutionRamp": 0,
  "landValueAverage": 0,
  "pollutionAverage": 0,
  "crimeAverage": 0,
  "totalPop": 0,
  "resHist10":  [0, 0, 0, "… (120 entries)"],
  "resHist120": [0, 0, 0, "… (120 entries)"],
  "comHist10":  [0, 0, 0, "… (120 entries)"],
  "comHist120": [0, 0, 0, "… (120 entries)"],
  "indHist10":  [0, 0, 0, "… (120 entries)"],
  "indHist120": [0, 0, 0, "… (120 entries)"],
  "crimeHist10":      [0, 0, "… (120 entries)"],
  "crimeHist120":     [0, 0, "… (120 entries)"],
  "moneyHist10":      [128, 128, "… (120 entries)"],
  "moneyHist120":     [128, 128, "… (120 entries)"],
  "pollutionHist10":  [0, 0, "… (120 entries)"],
  "pollutionHist120": [0, 0, "… (120 entries)"]
}
```

The total payload size for a 120×100 map (12,000 tiles × ~14 bytes per
`{"value":N}` entry) is approximately **185–200 KB** of JSON text, well within
`localStorage`'s typical 5 MB per-origin limit.
