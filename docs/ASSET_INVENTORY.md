# Asset Inventory — MicropolisJS / MetroJS

A complete catalogue of every non-code asset shipped with the project, its
physical location, its runtime role, and its documented licensing status.

> **Scope:** Files tracked in the repository only. Build outputs in `dist/`
> are derived from these sources and are not separately listed.

---

## Table of Contents

1. [Tile Graphics](#1-tile-graphics-images)
2. [Sprite Sheet & Individual Frames](#2-sprite-sheet--individual-frames)
3. [Background Texture](#3-background-texture)
4. [Embedded Base64 Image Assets](#4-embedded-base64-image-assets-in-source)
5. [Web Fonts](#5-web-fonts)
6. [Stylesheet](#6-stylesheet)
7. [HTML Pages](#7-html-pages)
8. [Audio / Music / Sound Effects](#8-audio--music--sound-effects)
9. [npm Runtime Dependencies](#9-npm-runtime-dependencies)
10. [License Documents in the Repository](#10-license-documents-in-the-repository)
11. [Summary Table](#11-summary-table)

---

## 1. Tile Graphics (`images/`)

### `images/tiles.png`

| Property | Value |
|---|---|
| Size on disk | ~83 KB |
| Dimensions | 496 × 496 px (square; 31 × 31 grid of 16 × 16 px tiles) |
| Runtime role | Primary tile sheet for the summer season. Loaded as `<img id="tiles">` in `index.html`. Consumed by `src/tileSet.js`, which splits it into 961 individual in-memory images via an offscreen canvas. |
| Season | Summer / default |
| Documented license | **GPL v3 + EA additional terms** (inherited from Micropolis project; no separate image-specific license file) |
| Provenance | Adapted from the Micropolis open-source release, which is itself the 1989 SimCity graphics released under GPL by Electronic Arts. |

### `images/tilessnow.png`

| Property | Value |
|---|---|
| Size on disk | ~70 KB |
| Dimensions | 496 × 496 px |
| Runtime role | Winter / snow-season tile sheet. Loaded as `<img id="snowtiles">`. Swapped in by `Game.onDateChange()` in October; reverted in January. |
| Season | Winter |
| Documented license | **GPL v3 + EA additional terms** (same provenance as `tiles.png`) |

---

## 2. Sprite Sheet & Individual Frames

### `images/sprites.png`

| Property | Value |
|---|---|
| Size on disk | ~17 KB |
| Runtime role | Composite sprite sheet used at runtime. Loaded as `<img id="sprites">` and passed as `spriteSheet` to `GameCanvas`. Individual sprite objects reference into this sheet by pixel coordinate. |
| Documented license | **GPL v3 + EA additional terms** (same provenance as tile graphics) |
| Provenance | Assembled from (or identical in content to) the individual frames in `sprites/`. |

### `sprites/obj{N}-{frame}.png` (65 files)

The `sprites/` directory holds individual sprite frame images used to compose
`images/sprites.png`. They are **not loaded at runtime** (the pre-composed
`sprites.png` is used instead), but they are distributed in the repository and
copied into `dist/` by Webpack.

Sprite type mapping (from `src/spriteConstants.ts`):

| Object N | Sprite type | Frames | File pattern |
|---|---|---|---|
| 1 | Train | 5 | `obj1-0.png` … `obj1-4.png` |
| 2 | Helicopter | 8 | `obj2-0.png` … `obj2-7.png` |
| 3 | Airplane | 11 | `obj3-0.png` … `obj3-10.png` |
| 4 | Ship / Boat | 8 | `obj4-0.png` … `obj4-7.png` |
| 5 | Monster | 16 | `obj5-0.png` … `obj5-15.png` |
| 6 | Tornado | 3 | `obj6-0.png` … `obj6-2.png` |
| 7 | Explosion | 6 | `obj7-0.png` … `obj7-5.png` |
| 8 | (unlabelled in spriteConstants) | 4 | `obj8-0.png` … `obj8-3.png` |

> **Note on obj8:** There are only 7 sprite type constants in
> `src/spriteConstants.ts` (IDs 1–7). The `obj8-*` frames have no matching
> constant; their intended use is undocumented.

| Property | Value |
|---|---|
| Documented license | **GPL v3 + EA additional terms** |
| Provenance | Same Micropolis/SimCity source as other graphics |

---

## 3. Background Texture

### `images/dirtbg.png`

| Property | Value |
|---|---|
| Size on disk | 110 bytes (very small, likely a tiling 1–4 px swatch) |
| Runtime role | CSS background image for `<body>` (`background-image: url('../images/dirtbg.png')` in `style.css`). Provides the dirt/earth texture behind all UI panels. |
| Documented license | **Unknown / assumed GPL v3 + EA additional terms.** No standalone attribution or license note for this file exists. |
| Provenance | Origin not documented. Could be a single extracted tile from `tiles.png`, or a hand-made texture. Cannot be confirmed without inspection. |

---

## 4. Embedded Base64 Image Assets (in source)

### `src/tileSetURI.ts`

| Property | Value |
|---|---|
| Content | The full `images/tiles.png` file encoded as a base64 data URI, stored as a TypeScript string constant (`TileSetURI`). |
| Size | ~90 KB TypeScript source |
| Runtime role | Fallback tile sheet used when `canvas.toDataURL()` is blocked by cross-origin taint (e.g., Chrome running from `file://`). The primary tile loading path in `src/micropolis.js` falls back to this if the canvas is tainted. |
| Documented license | Same as `images/tiles.png` — **GPL v3 + EA additional terms** |

### `src/tileSetSnowURI.ts`

| Property | Value |
|---|---|
| Content | The full `images/tilessnow.png` encoded as a base64 data URI. |
| Runtime role | Fallback snow tile sheet, same mechanism as above. |
| Documented license | Same as `images/tilessnow.png` — **GPL v3 + EA additional terms** |

---

## 5. Web Fonts

### `css/chunk.woff` — "Chunk" font

| Property | Value |
|---|---|
| Font name | Chunk (Reserved Font Name) |
| Author | Meredith Mandel `<meredith@meredithmandel.com>` |
| Year | 2009 |
| Format | WOFF |
| Size on disk | ~50 KB |
| License | **SIL Open Font License (OFL) 1.1** |
| License file | `css/FONT_LICENSE.markdown` (full OFL 1.1 text included) |
| Runtime role | UI heading font; loaded via `@font-face { font-family: 'Chunk' }` in `style.css`. Used for `.chunk`-classed elements (titles, headers, RCI labels, notification bar). |
| Commercial use | Permitted when bundled with software, provided the copyright notice and OFL license are distributed with it. **May NOT be sold standalone.** The "Chunk" reserved font name may not be used in modified versions. |

### Open Sans — Google Fonts (remote, not embedded)

| Property | Value |
|---|---|
| Font name | Open Sans |
| Weights in use | 300, 300 italic, 400, 400 italic, 600 |
| Source | Loaded at runtime from `https://fonts.googleapis.com/css?family=Open+Sans:400,300,600,300italic,400italic` |
| License | **Apache License 2.0** (as distributed by Google Fonts) |
| License file | None in repo — font is fetched at runtime from Google's CDN |
| Runtime role | Default UI body / form text; declared in `style.css` as the fallback sans-serif stack. |
| Embedded locally? | **No.** The request is a live CDN call. In an offline or packaged distribution this font would silently fall back to the system sans-serif unless bundled. |

---

## 6. Stylesheet

### `css/style.css`

| Property | Value |
|---|---|
| License | **GPL v3 + EA additional terms** (the file carries the standard project copyright header) |
| Content | Single flat CSS file — no preprocessor. Imports Open Sans from Google Fonts CDN; declares `@font-face` for Chunk; styles all game UI panels, dialogs, buttons, and HUD elements. |

---

## 7. HTML Pages

| File | Role | License |
|---|---|---|
| `index.html` | Single-page app shell | **GPL v3 + EA additional terms** (carries project header) |
| `about.html` | Game description / about page | **GPL v3 + EA additional terms** |
| `name_license.html` | Renders the Micropolis Public Name License for players | **GPL v3 + EA additional terms** |

---

## 8. Audio / Music / Sound Effects

**There are no audio files in the repository.**

The codebase does define sound event constants in `src/messages.ts`:

```
SOUND_EXPLOSION_LOW, SOUND_EXPLOSION_HIGH, SOUND_POLICE_SIR, SOUND_FIRE_SIREN,
SOUND_HEAVY_TRAFFIC, SOUND_SCRATCH, SOUND_FUNK, SOUND_MONSTER, SOUND_QUACK,
SOUND_SKID, SOUND_ZONES, SOUND_HEAVY
```

However, no audio playback code exists and no audio files (`.mp3`, `.ogg`,
`.wav`, `.flac`, etc.) are present anywhere in the repository. These constants
are dead stubs. Any future audio added would require a fresh licensing review.

---

## 9. npm Runtime Dependencies

Only **one production runtime dependency** ships to end users (everything else
is a `devDependency` used only during build and test):

| Package | Version | License | Use |
|---|---|---|---|
| `jquery` | 3.7.1 | **MIT** | DOM manipulation, event wiring throughout all JS UI code |

All `devDependencies` (webpack, jest, ts-jest, typescript, etc.) are build/test
tooling; they do not ship to end users and are not included in a Steam
distribution.

---

## 10. License Documents in the Repository

| File | What it covers |
|---|---|
| `COPYING` | Full text of the **GNU General Public License v3.0** |
| `LICENSE` | Project-level copyright statement (© Graeme McCutcheon 2013); declares GPL v3 + EA additional terms. Explicitly states no rights to "SimCity" or any other EA trademark. Includes EA-specific warranty disclaimer. |
| `MicropolisPublicNameLicense.md` | Trademark license for the name "MICROPOLIS" granted by Micropolis GmbH. Version 1, October 2024. Non-commercial use of the name only. |
| `css/FONT_LICENSE.markdown` | Full text of the SIL Open Font License 1.1 covering `css/chunk.woff`. |

---

## 11. Summary Table

| Asset | Location | Type | License | License File |
|---|---|---|---|---|
| tiles.png | `images/` | Tile graphics (summer) | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| tilessnow.png | `images/` | Tile graphics (winter) | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| sprites.png | `images/` | Sprite sheet | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| dirtbg.png | `images/` | Background texture | **Unknown / unverified** | None |
| obj1–obj7 frames | `sprites/` | Individual sprite frames | GPL v3 + EA terms (assumed) | `LICENSE` / `COPYING` |
| obj8 frames | `sprites/` | Unlabelled sprite frames | **Unknown / unverified** | None |
| tileSetURI.ts | `src/` | Embedded tiles.png (base64) | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| tileSetSnowURI.ts | `src/` | Embedded tilessnow.png (base64) | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| chunk.woff | `css/` | Web font ("Chunk") | SIL OFL 1.1 | `css/FONT_LICENSE.markdown` |
| Open Sans | Remote CDN | Web font | Apache 2.0 | None (external) |
| style.css | `css/` | Stylesheet | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| index.html | `/` | App shell | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| about.html | `/` | About page | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| name_license.html | `/` | Name license page | GPL v3 + EA terms | `LICENSE` / `COPYING` |
| (no audio files) | — | Sound / music | N/A | N/A |
| jquery 3.7.1 | npm | Runtime library | MIT | `node_modules/jquery` |
| "MICROPOLIS" name | (trademark) | Trademark | Non-commercial only | `MicropolisPublicNameLicense.md` |
| "SimCity" name | (trademark) | EA trademark | No rights granted | `LICENSE` |
