# Format Pass — Safe Formatting Round 1

## Overview

This documents the first safe formatting pass applied to MicropolisJS.
The goal is improved readability with **zero behavior changes**.

## Formatter

- Tool: [Prettier](https://prettier.io/) v3.8.3 (via `npx prettier`)
- Config: `.prettierrc` added at the project root

## Prettier Configuration (`.prettierrc`)

```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

Settings align with the existing `.editorconfig` (2-space indent, LF line endings)
and the single-quote style already used throughout the codebase.

## Files Changed

| File | What changed |
|------|-------------|
| `src/config.js` | Trailing comma added to object literal |
| `src/miscUtils.js` | Multi-property object reformatted to one-property-per-line; trailing commas added; blank lines normalised |
| `src/eventEmitter.js` | Extra blank lines between inner functions removed; `if`-body single statements collapsed to one line; array of strings reformatted to one-per-line |
| `src/debugAssert.ts` | 4-space indentation standardised to 2-space |

## Files Excluded (Simulation-Heavy — Not Touched)

The following files were intentionally skipped because they contain simulation
logic, timing constants, or numeric thresholds where accidental edits could
affect gameplay:

`simulation.js`, `mapScanner.js`, `traffic.js`, `commercial.js`,
`industrial.js`, `residential.js`, `powerManager.js`, `road.js`,
`connector.js`, `valves.js`, `census.js`, `budget.js`, `evaluation.js`,
`disasterManager.js`, `emergencyServices.js`, `repairManager.js`,
`spriteManager.js`, `worldEffects.js`, `zoneUtils.js`, `tileUtils.js`,
`blockMapUtils.js`, and all sprite files.

## Rules Applied

- Formatting only — no logic changes, no variable renames, no function moves.
- No conditionals, loops, numbers, constants, or timing values were altered.
- No simulation-heavy files were touched.

## Verification

Test suite run after formatting:

```
Tests: 2 failed (pre-existing), 197 passed, 199 total
```

The 2 failing tests were pre-existing failures in `test/bounds.ts` unrelated to
this formatting pass.

## Next Steps

Before expanding the formatting pass to additional files:

1. Ensure the regression checklist in `docs/REGRESSION_CHECKLIST.md` is completed.
2. Run a manual smoke-test of the game in a browser (`npm run dev`).
3. Only then apply `npx prettier --write` to the next batch of low-risk files
   (e.g. UI/window helpers such as `budgetWindow.js`, `evaluationWindow.js`, etc.).
