# Licensing Risks — MicropolisJS / MetroJS

A conservative analysis of licensing and trademark issues relevant to any
future redistribution, modernisation, or commercial release of this codebase.
Particular attention is paid to a hypothetical **Steam commercial distribution**.

> **Disclaimer:** This document is an engineering best-effort summary for
> developer awareness only. It is not legal advice. Consult a qualified IP
> attorney before making any commercial distribution decisions.

---

## Table of Contents

1. [Overall License Stack](#1-overall-license-stack)
2. [Risk: GPL Copyleft on All Code and Most Assets](#2-risk-gpl-copyleft-on-all-code-and-most-assets)
3. [Risk: "MICROPOLIS" Trademark — Commercial Use Restricted](#3-risk-micropolis-trademark--commercial-use-restricted)
4. [Risk: "SimCity" and Electronic Arts Trademarks](#4-risk-simcity-and-electronic-arts-trademarks)
5. [Risk: Graphic Asset Provenance — Derived from Commercial Game Graphics](#5-risk-graphic-asset-provenance--derived-from-commercial-game-graphics)
6. [Risk: dirtbg.png — Unknown Origin](#6-risk-dirtbgpng--unknown-origin)
7. [Risk: obj8-* Sprites — Undocumented Type](#7-risk-obj8--sprites--undocumented-type)
8. [Risk: Open Sans Font — Remote CDN Dependency](#8-risk-open-sans-font--remote-cdn-dependency)
9. [Risk: Chunk Font (chunk.woff) — OFL Bundling Requirements](#9-risk-chunk-font-chunkwoff--ofl-bundling-requirements)
10. [Risk: Future Audio Assets — No Existing License Baseline](#10-risk-future-audio-assets--no-existing-license-baseline)
11. [Assets Safe for Reuse (with conditions)](#11-assets-safe-for-reuse-with-conditions)
12. [Assets That Should NOT Be Reused Without Further Verification](#12-assets-that-should-not-be-reused-without-further-verification)
13. [Steam-Specific Compatibility Summary](#13-steam-specific-compatibility-summary)

---

## 1. Overall License Stack

The project operates under **three overlapping license instruments**:

| Instrument | File | Scope | Key constraint |
|---|---|---|---|
| GNU GPL v3 | `COPYING` | All code and (by project convention) all assets except where separately noted | Source code of any derivative must be distributed under GPL v3 |
| EA Additional Terms | `LICENSE` | Code and assets adapted from the original Micropolis/SimCity open-source release | No SimCity trademark rights; specific warranty disclaimer; EA indemnification clause |
| Micropolis Public Name License v1 (Oct 2024) | `MicropolisPublicNameLicense.md` | The trademarked name "MICROPOLIS" and variations | Non-commercial use of the name only; revocable; Netherlands jurisdiction |

These instruments stack: all three apply simultaneously to this fork. None of
them can be waived unilaterally by the fork maintainer.

---

## 2. Risk: GPL Copyleft on All Code and Most Assets

**Severity: HIGH for commercial distribution without source release**

GPL v3 is a **strong copyleft** license. Any work distributed to users that
incorporates GPL v3 material must itself be licensed under GPL v3 and must
make the **complete corresponding source code** available to those users.

### Implications for a Steam commercial release

- Selling the game on Steam is **not inherently prohibited by GPL**. You may
  charge money for GPL software.
- However, every copy distributed (including via Steam) must come with (or an
  offer for) the complete GPL v3 source code.
- Steam's DRM mechanisms (e.g., Steam licensing enforcement, anti-cheat) that
  prevent users from running the game outside Steam are **incompatible with GPL
  v3 section 6** ("No Further Restrictions"), which states that recipients must
  not be prevented from exercising the rights the GPL grants them.
- Any proprietary additions, game modes, or assets that the developer does not
  wish to open-source must be cleanly separated and not form a combined work
  with the GPL code. This is technically complex and legally uncertain.
- The EA Additional Terms in `LICENSE` add an extra indemnification clause:
  anyone who assumes contractual liability for the program on behalf of recipients
  must indemnify Electronic Arts for any liability those assumptions impose on EA.

### What must be done before a commercial Steam release

- Obtain independent legal advice on whether the intended distribution model
  is GPL-compatible.
- If distributing under GPL, prepare and make available the complete source
  code at the same time as the Steam release.
- Avoid any technical measures that would prevent users from exercising GPL rights.

---

## 3. Risk: "MICROPOLIS" Trademark — Commercial Use Restricted

**Severity: HIGH — name cannot be used commercially without written permission**

The **Micropolis Public Name License v1** (October 2024, Micropolis GmbH,
Netherlands) grants a **non-commercial-only** revocable license to use the
name "MICROPOLIS" and variations.

### Key restrictions

- The name may **not** be used in a commercial context, which includes:
  - Selling a product named "Micropolis" or "MicropolisJS" on Steam.
  - Using the name on marketing materials, store pages, posters, or brochures.
  - Registering domain names, subdomains, or social media accounts using the name.
  - Using the name more prominently than the developer's own brand.
- The license is **revocable** (clause 5: "trademark dilution bailout"). Even
  compliant uses may be required to cease in future.
- The license names **Netherlands courts** as the jurisdiction.

### Current state of this fork

The fork is named "MetroJS" in the repository, but the name "micropolisJS"
appears in:
- `package.json` (the `name` field and `description`)
- All source file copyright headers
- `index.html` title and `<h1>` text
- `about.html` text content
- Both HTML `<meta description>` tags

Any public-facing deployment or commercial distribution under the name
"micropolisJS" or "Micropolis" (or any variation) requires compliance with
the Micropolis Public Name License. For a commercial Steam release, **written
permission from Micropolis GmbH is required**.

### Recommended action

Decide on a permanent non-"Micropolis" brand for the MetroJS fork before any
commercial release, and perform a coordinated rename across all source headers,
HTML, and `package.json`. See `docs/TECHNICAL_AUDIT.md` §11 for the scope of
that rename.

---

## 4. Risk: "SimCity" and Electronic Arts Trademarks

**Severity: HIGH — no rights granted to SimCity trademark**

The `LICENSE` file states explicitly:

> "This license does NOT give you any right, title or interest in the trademark
> SimCity or any other Electronic Arts trademark."

The about page (`about.html`) describes the game as "a port of Micropolis to
Javascript. (Micropolis is the open-source release of a commercial game once
sold by Electronic Arts)."

### Implications

- The name "SimCity" must not appear in any product name, store listing,
  marketing materials, or description in a way that implies association with or
  endorsement by Electronic Arts.
- Mentioning it purely for historical attribution ("originally derived from…")
  may be permissible nominative fair use, but this is jurisdiction-dependent
  and should be reviewed by counsel.
- No EA visual trade dress (logo, distinctive UI elements, etc.) should be
  carried forward without review.

---

## 5. Risk: Graphic Asset Provenance — Derived from Commercial Game Graphics

**Severity: HIGH — requires verification before commercial use**

The tile sheets (`tiles.png`, `tilessnow.png`) and sprite sheet (`sprites.png`)
are visually derived from the original SimCity / Micropolis graphics. These were
open-sourced by Electronic Arts as part of the Micropolis source code release.

### What is documented

- The GPL v3 + EA additional terms in `LICENSE` and `COPYING` assert that the
  entire Micropolis release (including its graphics) is distributed under GPL v3.
- The EA additional terms apply the same disclaimer and indemnification clauses
  to the graphics as to the code.

### What is NOT documented

- There is **no separate, explicit license file** for any image file in `images/`
  or `sprites/`. The assertion that they are GPL is implicit, inherited from the
  project-level `LICENSE`.
- The original Micropolis open-source release from Electronic Arts/Don Hopkins
  may have released the source code under GPL but the legal status of the
  pixel-by-pixel artwork (created by artists employed by Maxis/EA in 1989) is
  less clear-cut than source code. Artwork copyright is held by the original
  artists or their employer (EA); the GPL grant is made by the copyright holder.
- If EA's GPL release is valid and covers the artwork, the GPL copyleft analysis
  in §2 above applies to the graphics as well. Commercial use requires GPL
  compliance (source release, no technical restrictions on users).
- If a commercial Steam release intends to use these graphics, **independent
  legal review of the Micropolis original GPL release and its scope with respect
  to artwork** is strongly recommended.

### Practical conservative stance

**Treat all graphics in `images/` and `sprites/` as GPL v3 + EA additional
terms until a legal review confirms otherwise.** Do not assume they are freely
reusable in a closed-source commercial product.

---

## 6. Risk: `dirtbg.png` — Unknown Origin

**Severity: MEDIUM — cannot be verified without further investigation**

`images/dirtbg.png` is a 110-byte PNG (a tiny tiling swatch used as the
CSS body background). There is:

- No comment in any source file identifying its origin.
- No attribution in `about.html` or `COPYING`.
- No license file or note specific to this file.

It could be:
1. A single tile extracted from `tiles.png` (in which case GPL + EA terms apply).
2. A hand-authored texture created by the micropolisJS author (in which case
   it is GPL under the project LICENSE).
3. A third-party texture with an unknown separate license.

**Do not assume it is GPL without tracing its actual origin.**

---

## 7. Risk: `obj8-*` Sprites — Undocumented Type

**Severity: LOW–MEDIUM — minor gap in documentation**

The `sprites/` directory contains `obj8-0.png` through `obj8-3.png` (4 frames).
`src/spriteConstants.ts` defines only 7 sprite types (IDs 1–7). There is no
constant for a type-8 sprite.

Possible explanations:
- An additional sprite type (perhaps a boat variant or a second explosion type)
  that was removed from the active code but whose frames were left behind.
- A sprite type used in the original Micropolis but not yet ported to JS.

These files are distributed in `dist/` by Webpack (the `sprites/` folder is
copied as static assets), so they are shipped to users even though they are
unused at runtime. If their origin and license status differ from the other
sprites, that represents a distribution risk. Current best assumption is that
they share the same Micropolis/GPL provenance, but this is unverified.

---

## 8. Risk: Open Sans Font — Remote CDN Dependency

**Severity: MEDIUM for packaged/offline distribution**

`css/style.css` imports Open Sans via:

```css
@import url(https://fonts.googleapis.com/css?family=Open+Sans:400,300,600,300italic,400italic);
```

### Issues

- **Open Sans is Apache License 2.0**, which permits commercial use and
  bundling with attribution. The license itself is not a blocker.
- However, **the font is not embedded locally**. In an online browser game
  this is a network request. In a packaged desktop distribution (e.g., Steam
  via Electron or similar) this would either:
  - Require an internet connection to load the font (problematic for offline
    play), or
  - Need to be downloaded and bundled locally before distribution.
- If bundled locally, the Apache License 2.0 requires that the license notice
  and copyright be included. This is easily satisfied but must not be omitted.
- **GDPR/privacy note:** In EU-law jurisdictions, loading fonts from Google's
  CDN at page load time may require user consent or be prohibited without it,
  since Google's servers receive the user's IP address. For a Steam game this
  is less of a concern than for a public website, but should be considered if
  the packaged app ever makes CDN requests.

---

## 9. Risk: Chunk Font (`chunk.woff`) — OFL Bundling Requirements

**Severity: LOW — conditions easily satisfied**

The "Chunk" font is licensed under **SIL Open Font License 1.1**, documented
in `css/FONT_LICENSE.markdown`. The OFL is permissive for bundling:

- ✅ May be bundled with software and sold with the software.
- ✅ May be used unmodified in a commercial game.
- ⚠️ **May NOT be sold standalone** (as a font product by itself).
- ⚠️ The license text (`css/FONT_LICENSE.markdown`) must be distributed with
  the font. Currently it is copied into `dist/` by Webpack, satisfying this.
- ⚠️ Any **modified version** of the font may not use the Reserved Font Name
  "Chunk". If the font is not modified, the name restriction does not apply.

In the current state (unchanged font, license file included in `dist/`), the
Chunk font poses **no significant commercial risk** as long as the license file
remains in the distribution.

---

## 10. Risk: Future Audio Assets — No Existing License Baseline

**Severity: LOW now, POTENTIALLY HIGH if audio is added**

There are currently no audio files in the repository. However, 12 sound event
constants are defined in `src/messages.ts` (e.g., `SOUND_EXPLOSION_HIGH`,
`SOUND_POLICE_SIR`, `SOUND_FIRE_SIREN`) with no playback implementation.

If audio assets are added in the future:
- Their license provenance must be documented before they are committed.
- The original Micropolis project may have had associated audio whose license
  status would require the same review as the graphics.
- Royalty-free or Creative Commons audio sourced externally must have its
  license terms explicitly compatible with the intended distribution model
  (GPL-compatible for open source; CC-BY or commercial for paid distribution).

**This inventory should be updated whenever audio files are added.**

---

## 11. Assets Safe for Reuse (with conditions)

The following assets can be used in a future distribution **with the stated
conditions met**:

| Asset | License | Conditions for reuse |
|---|---|---|
| `css/chunk.woff` | SIL OFL 1.1 | Include `css/FONT_LICENSE.markdown` in distribution; do not sell font standalone; do not rename modified versions "Chunk" |
| Open Sans (remote) | Apache 2.0 | Include attribution and license notice if bundled locally; avoid CDN call in offline distribution |
| `jquery` (npm) | MIT | Include MIT license notice; already in `node_modules/jquery/LICENSE.txt` |
| All `src/*.js` / `*.ts` source code | GPL v3 + EA terms | Distribute with full source; comply with GPL v3; do not use SimCity or EA trademarks; satisfy EA additional terms |

---

## 12. Assets That Should NOT Be Reused Without Further Verification

The following assets require additional legal review before inclusion in a
commercial release, particularly a Steam commercial distribution:

| Asset | Location | Risk | Required action before commercial use |
|---|---|---|---|
| `tiles.png` | `images/` | Derived from SimCity/Micropolis commercial-era artwork; legally asserted as GPL but provenance of EA's GPL grant over pixel art should be reviewed | Legal review of original Micropolis GPL release scope; obtain counsel opinion |
| `tilessnow.png` | `images/` | Same as `tiles.png` | Same as above |
| `sprites.png` | `images/` | Same as `tiles.png` | Same as above |
| Individual sprite frames `obj1`–`obj7` | `sprites/` | Same provenance as above; additional concern that they are distributed but unused at runtime | Legal review; consider removing unused files from distribution |
| `obj8-*` frames | `sprites/` | Same provenance as other sprites AND undocumented type with no matching code constant | Trace origin; identify sprite type; apply same legal review |
| `dirtbg.png` | `images/` | Origin not documented; could be third-party | Trace actual origin; obtain explicit license confirmation |
| `src/tileSetURI.ts` | `src/` | Base64 embedding of `tiles.png`; inherits all risks of `tiles.png` and adds the concern of embedding copyrighted pixel data in source code | Resolved if `tiles.png` is cleared; otherwise remove or replace |
| `src/tileSetSnowURI.ts` | `src/` | Same as `tileSetURI.ts` for `tilessnow.png` | Same as above |
| Name "micropolisJS" | (string, not a file) | Micropolis Public Name License restricts commercial use | Written permission from Micropolis GmbH, or complete rebrand |
| Name "SimCity" | (string, not a file) | EA trademark; no rights granted | Do not use in product names or marketing |

---

## 13. Steam-Specific Compatibility Summary

A Steam commercial release of MetroJS as-is would face the following blockers:

| Blocker | Blocking mechanism | Resolution path |
|---|---|---|
| GPL v3 copyleft | Must provide source code; no technical restrictions on users | Release full source code alongside Steam distribution; avoid DRM that restricts user freedom |
| "MICROPOLIS" name | Non-commercial-only trademark license | Written permission from Micropolis GmbH, or complete rebrand away from "Micropolis" |
| EA additional terms | Warranty disclaimer; EA indemnification clause | Review with counsel; these terms flow with the GPL source |
| Graphic asset provenance | Legal uncertainty around EA's GPL grant covering original game artwork | Independent legal review of original Micropolis OSS release |
| Open Sans font CDN call | Network dependency in packaged app | Bundle font locally with Apache 2.0 attribution |
| `dirtbg.png` origin | Undocumented | Trace and document, or replace with a clearly licensed texture |
| `obj8-*` sprites | Undocumented sprite type | Identify type and license; remove if unused |

> **Conservative recommendation:** Every item in the "should NOT be reused
> without further verification" list in §12 must be individually cleared by
> a qualified IP attorney before any commercial Steam distribution goes live.
> The most significant single risk is the GPL copyleft requirement, which
> constrains the entire distribution model.
