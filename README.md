micropolisJS
============

https://www.graememcc.co.uk/micropolisJS

A port of Micropolis to JS/HTML5. The code is licensed under the GPLv3, with some additional terms - please be mindful of these. Likewise, be aware that the code is additionally governed by the Micropolis Public Name License as detailed in the next paragraph; this too must be complied with.

## [Micropolis Public Name License](MicropolisPublicNameLicense.md) ##
The name/term "MICROPOLIS" is a registered trademark of [Micropolis](https://www.micropolis.com) GmbH (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis" city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.

---

## Development

### Prerequisites

- **Node.js** ≥ 18 (LTS recommended — see `.nvmrc` if present)
- **npm** ≥ 9 (ships with Node 18+)
- A modern browser (Chrome / Firefox) for manual testing

### Quick start

```bash
# 1. Clone the repository
git clone https://github.com/awest813/MetroJS.git
cd MetroJS

# 2. Install dependencies
npm install

# 3. Start the development server (hot-reloads on file changes)
npm run dev
# → Game available at http://localhost:8080
```

### Build for production

```bash
npm run build
# Output written to dist/
```

Serve the `dist/` directory from any static file server to play the production build.

### Watch mode (rebuild on save, no dev server)

```bash
npm run watch
```

### Run automated tests

```bash
npm test
# Runs Jest with ts-jest; coverage report written to coverage/
```

Watch mode for tests:

```bash
npm run test:watch
```

### Lint TypeScript files

```bash
npm run lint
```

> **Note:** The `lint` script currently calls `tslint`, which is not listed as an installed
> dependency. TSLint is deprecated; migration to ESLint is planned (see
> [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md) Step 1.3). Until that migration is
> complete the lint script will fail unless `tslint` is installed manually. The `test` and
> `build` scripts are unaffected.

### Toolchain overview

| Tool | Purpose |
|------|---------|
| Webpack 5 | Bundles `src/micropolis.js` (entry) and all imports into `dist/src/micropolis.js` |
| webpack-dev-server | Hot-reloading dev server; serves `dist/` on port 8080 |
| ts-loader | Transpiles `.ts` files for Webpack |
| ts-jest | Transpiles `.ts` test files for Jest |
| TypeScript 5 | Type-checks `.ts` source files; config in `tsconfig.json` |
| Jest 30 | Runs unit tests in `test/` |

For a detailed description of every known issue and the planned improvement roadmap see
**[docs/TOOLING_NOTES.md](docs/TOOLING_NOTES.md)**.

### Project structure (brief)

```
src/           JavaScript + TypeScript source (entry: src/micropolis.js)
test/          Jest unit tests (TypeScript modules only)
docs/          Developer documentation
css/           Global stylesheet + web font
images/        Tile sheets and sprite sheet
sprites/       Individual sprite frame images
dist/          Production build output (git-ignored)
```

See [docs/TECHNICAL_AUDIT.md](docs/TECHNICAL_AUDIT.md) for a full project structure map.
