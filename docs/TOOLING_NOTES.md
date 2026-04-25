# Tooling Notes — MetroJS

> **Purpose:** Record every toolchain change, why it was made, and how to revert it.
> Per the modernization rules, every dependency change must be explained here.
> This document is append-only — add a new section for each future change.

---

## Changes made 2026-04-25

### 1. Renamed `jest.config.js` → `jest.config.cjs`

**Problem:** `package.json` contains `"type": "module"`, which tells Node.js to treat all `.js`
files as ES modules. `jest.config.js` used CommonJS syntax (`module.exports = {...}`). Running
`npm test` failed with:

```
ReferenceError: module is not defined in ES module scope
```

**Fix:** Renamed `jest.config.js` to `jest.config.cjs`. Node.js always treats `.cjs` files as
CommonJS regardless of the `"type"` field. The file contents are unchanged.

**Revert:** Rename `jest.config.cjs` back to `jest.config.js`.

**Dependency changes:** None.

---

### 2. Fixed deprecated `devServer.contentBase` in `webpack.config.js`

**Problem:** `addDevelopmentConfigTo()` set `devServer.contentBase`, which was removed in
webpack-dev-server v4. The project's devDependency is `webpack-dev-server@5.2.2`. Starting the
dev server with `npm run dev` produced the warning:

```
[webpack-dev-server] 'contentBase' option is not allowed
```

and the server may not have served static assets correctly.

**Fix:** Replaced `contentBase: './dist'` with `static: './dist'` — the correct key for
webpack-dev-server ≥ 4.

**Revert:** Change `static` back to `contentBase` (note: this will break on WDS v4+).

**Dependency changes:** None.

---

### 3. Fixed invalid `devtool` value in `webpack.config.js`

**Problem:** `addDevelopmentConfigTo()` set `devtool: 'source-maps'` (with a trailing `s`).
`'source-maps'` is not a valid webpack 5 devtool value. The correct value is `'source-map'`.
An invalid value causes webpack to fall back to no source maps, making debugging significantly
harder.

**Fix:** Changed `'source-maps'` → `'source-map'`.

**Revert:** Change `'source-map'` back to `'source-maps'` (note: source maps will not work).

**Dependency changes:** None.

---

### 4. Updated `package.json` repository URL

**Problem:** The `"repository"` field pointed to the upstream `graememcc/micropolisJS` repo
rather than this fork (`awest813/MetroJS`). This affected `npm repo`, GitHub integration, and
the display on the npm registry if the package were ever published.

**Fix:** Changed the URL to `https://github.com/awest813/MetroJS.git`.

**Revert:** Change the URL back to `https://github.com/graememcc/micropolisJS.git`.

**Dependency changes:** None.

---

### 5. Added `.editorconfig`

**Problem:** No editor configuration existed, so different editors (VS Code, Vim, Emacs, etc.)
could produce files with mixed indentation, line endings, or missing final newlines — all of
which generate noisy diffs.

**Fix:** Added a standard `.editorconfig` file specifying:
- UTF-8 encoding
- LF line endings
- 2-space indentation for all files
- Final newline required
- Trailing whitespace trimmed (except in Markdown where trailing spaces are significant)

**Revert:** Delete `.editorconfig`.

**Dependency changes:** None. `.editorconfig` is read by editors natively or via a free plugin.

---

### 6. Extended `.gitignore`

**Problem:** The original `.gitignore` only covered the most obvious entries (`node_modules/`,
`dist/`, `coverage/`, `.swp`/`.swo` swap files, and `TODO`). It was missing entries for:
- macOS metadata files (`.DS_Store`)
- Windows thumbnail cache files (`Thumbs.db`, etc.)
- JetBrains IDE directories (`.idea/`)
- Sublime Text project files
- npm and yarn debug logs
- TypeScript incremental build cache (`*.tsbuildinfo`)

**Fix:** Added these patterns to `.gitignore`.

**Revert:** Remove the added lines.

**Dependency changes:** None.

---

### 7. Updated `README.md` with a Development section

**Problem:** The README contained only the project name, upstream URL, and the license notice.
There were no instructions for new developers on how to clone, install, run, build, or test the
project.

**Fix:** Added a Development section covering:
- Prerequisites (Node.js ≥ 18, npm ≥ 9)
- Quick-start steps (clone → install → `npm run dev`)
- Build, watch, test, and lint commands
- Toolchain overview table
- Brief project structure map
- Links to detailed documentation in `docs/`

**Revert:** Revert `README.md` to the previous one-paragraph version.

**Dependency changes:** None.

---

## Known tooling issues (not fixed in this task)

### `npm run lint` is currently broken

The `"lint"` script in `package.json` calls `tslint`, which is **not listed as a
devDependency** and is therefore not installed by `npm install`. Additionally, TSLint itself has
been deprecated in favour of ESLint since 2019.

The planned fix is to remove `tslint`, add ESLint + `@typescript-eslint`, and migrate the rules
in `tslint.json` to an ESLint config. This is tracked as **Step 1.3** in
[docs/MODERNIZATION_PLAN.md](./MODERNIZATION_PLAN.md).

Until that migration is complete:
- `npm run lint` will fail with `tslint: command not found`.
- `npm test` and `npm run build` are **not affected** by this issue.

### `jest.config.cjs` `collectCoverage: true` slows down `npm test`

The Jest config unconditionally collects coverage on every `npm test` run. This is slightly
slower than running without coverage. To skip coverage collection during development use:

```bash
npx jest --no-coverage
```

The `npm test` script will continue to collect coverage so that CI always has an up-to-date
report. This is intentional.

### `tsconfig.json` targets ES5 / CommonJS

The TypeScript compiler is configured to emit ES5 CommonJS output. This is fine for the current
codebase but will prevent the use of native async/await, optional chaining, and other modern
syntax in TypeScript files without polyfills. Bumping the target is tracked as **Step 1.4** in
[docs/MODERNIZATION_PLAN.md](./MODERNIZATION_PLAN.md).

---

## Dependency inventory (2026-04-25)

All dependencies are unchanged from the initial state. This section documents the current
versions for future reference.

### Runtime dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `jquery` | `3.7.1` | DOM manipulation and event handling throughout all UI modules |

### Dev dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/jest` | `30.0.0` | TypeScript type definitions for Jest |
| `clean-webpack-plugin` | `4.0.0` | Deletes `dist/` before each production build |
| `copy-webpack-plugin` | `13.0.0` | Copies static assets (`css/`, `images/`, `sprites/`, `LICENSE`, `COPYING`) to `dist/` |
| `git-revision-webpack-plugin` | `5.0.0` | Injects the current git commit hash into the HTML `about` page |
| `html-webpack-plugin` | `5.6.3` | Processes `index.html`, `about.html`, `name_license.html` and injects the bundle script tag |
| `jest` | `30.0.4` | Test runner |
| `ts-jest` | `29.4.0` | Jest transformer for TypeScript test files |
| `ts-loader` | `9.5.2` | Webpack loader for TypeScript source files |
| `typescript` | `5.8.3` | TypeScript compiler and language service |
| `webpack` | `5.100.1` | Module bundler |
| `webpack-cli` | `6.0.1` | Command-line interface for Webpack |
| `webpack-dev-server` | `5.2.2` | Development server with hot-module replacement |
