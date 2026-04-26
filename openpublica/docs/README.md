# OpenPublica

A GPLv3 browser-native 2.5D city-builder.

## Licence

Copyright (C) 2026 OpenPublica contributors  
Licenced under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

This software is free software: you can redistribute it and/or modify it under the terms of
the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

## Quick Start

```bash
cd openpublica
npm install
npm run dev        # dev server at http://localhost:3000
npm run build      # production build → dist/
npm run preview    # preview production build
```

## Project Structure

```
openpublica/
├── src/
│   ├── app/      App entry point and coordinator (App.ts, main.ts)
│   ├── sim/      Simulation logic — ZERO Babylon.js imports allowed here
│   ├── render/   Babylon.js rendering layer (scene, terrain, picking, highlight)
│   ├── tools/    Player tools (Inspect, Road, Residential, Bulldoze)
│   ├── ui/       HTML/CSS user interface (Toolbar, styles)
│   ├── data/     Shared constants, enums, and types
│   └── save/     Save/load system (Phase 2 placeholder)
├── docs/         Documentation
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Architecture

The project enforces a strict boundary between simulation and rendering:

| Layer | Location | Babylon.js |
|---|---|---|
| Simulation | `src/sim/` | ❌ not allowed |
| Tools | `src/tools/` | ❌ not allowed |
| Renderer | `src/render/` | ✅ only here |
| UI | `src/ui/` | ❌ not allowed |
| Coordinator | `src/app/App.ts` | ✅ wires both sides |

## Phase 1 Features

- [x] Vite + TypeScript (strict) project
- [x] Babylon.js scene with orthographic angled camera
- [x] 64×64 tile map rendered in a single draw call (vertex-coloured mesh)
- [x] Mouse tile picking via `scene.pick()`
- [x] Yellow highlight on selected tile
- [x] Toolbar: Inspect · Road · Residential · Bulldoze

## Phase 2 Roadmap (not yet implemented)

- [ ] Simulation tick loop (population, traffic, demand)
- [ ] Save/load via `SaveSystem`
- [ ] Map terrain generation
- [ ] Overlay maps (traffic density, crime, etc.)
- [ ] Sound effects
