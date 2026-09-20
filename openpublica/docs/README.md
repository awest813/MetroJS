# OpenPublica

A GPLv3 browser-native city-builder. The live renderer is a Babylon.js
**perspective 3D** city (orbit / iso / top). Remaining work is city-health sim
and presentation depth — see [NEXT_GAPS_PLAN.md](./NEXT_GAPS_PLAN.md).
The original camera/height/kit slices are in [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md).

## Licence

Copyright (C) 2026 OpenPublica contributors  
Licenced under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

This software is free software: you can redistribute it and/or modify it under the terms of
the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Hill noise and tree jitter use the MIT-licensed [`simplex-noise`](https://github.com/jwagner/simplex-noise.js)
and [`alea`](https://github.com/coverslide/node-alea) packages. See [THIRD_PARTY.md](./THIRD_PARTY.md).

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
│   ├── audio/    Procedural Web Audio (no sample files, no Babylon)
│   ├── data/     Shared constants, enums, and types
│   ├── math/     Seeded simplex / PRNG wrappers (MIT simplex-noise + alea)
│   └── save/     Save/load (SaveSystem / SaveCodec)
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
| Audio | `src/audio/` | ❌ (Web Audio only; original oscillators, never Micropolis clips) |
| UI | `src/ui/` | ❌ not allowed |
| Coordinator | `src/app/App.ts` | ✅ wires both sides |

## Current features (as of 2026-09)

- [x] Vite + TypeScript (strict) project
- [x] Babylon.js scene with perspective camera (iso / top / orbit presets)
- [x] 64×64 `CityMap` with monthly sim (growth, power, economy, land value, traffic, walkability, transit, pollution)
- [x] Procedural kit buildings (instanced) and vertex-coloured heightfield (no Micropolis tile sheets)
- [x] Mouse tile picking via terrain/water ray hits
- [x] Tools: Inspect, Road, R/C/I/Mixed zone brushes, Bulldoze, Power plant, Park, Police, Fire, Trolley avenue
- [x] Overlays: power, land value, traffic, walkability, transit, pollution, crowd, crime, fire (one height-aware mesh)
- [x] Save/load via `SaveSystem`
- [x] Perspective camera, sun/shadows, orbit vs paint input (Phase A)
- [x] Heightfield, water basins, height-aware picking (Phase B)
- [x] Map terrain generation (lakes, river, dirt beaches)
- [x] Extruded road / trolley meshes (Phase C)
- [x] Building kits + instancing (Phase D)
- [x] Parks, street trees, and plant smoke (Phase E)
- [x] Moving cars and trolleys on a render-only road graph (Phase F)
- [x] Gameplay: starter housing demand, sim speed/pause, placement and growth feedback
- [x] Unified 3D overlay mesh including pollution (Phase G)
- [x] Procedural sound (paint, growth, mute); unlocked on first gesture, M to mute
- [x] Camera polish: HTML minimap, Home/Frame, sun slider, High/Low quality
- [x] City menu + Settings: save/load confirms, mute/quality/sun, key list (Look is minimap + Frame)
- [x] MIT `simplex-noise` + `alea` for seeded hills and tree jitter (lakes still use `terrainHash`)

Follow [NEXT_GAPS_PLAN.md](./NEXT_GAPS_PLAN.md) for evaluation, advisory/degradation, and optional PBR/sky/GLB. Density, police, crime, and fire coverage are in the sim.

## 3D port

Do not treat this README as unfinished “Phase 1 isometric board.”
Phases A–H of [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md) are in the
tree. Simulation code in `src/sim/` must stay Babylon-free.
