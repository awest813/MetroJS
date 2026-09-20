# OpenPublica

A GPLv3 browser-native city-builder. The live renderer is a Babylon.js **2.5D**
orthographic prototype. The plan to turn it into a true perspective 3D web city
is in [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md).

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
| UI | `src/ui/` | ❌ not allowed |
| Coordinator | `src/app/App.ts` | ✅ wires both sides |

## Current features (as of 2026-09)

- [x] Vite + TypeScript (strict) project
- [x] Babylon.js scene with perspective camera (iso / top / orbit presets)
- [x] 64×64 `CityMap` with monthly sim (growth, power, economy, land value, traffic, walkability, transit, pollution)
- [x] Procedural kit buildings (instanced) and vertex-coloured heightfield (no Micropolis tile sheets)
- [x] Mouse tile picking via terrain/water ray hits
- [x] Tools: Inspect, Road, R/C/I/Mixed zone brushes, Bulldoze, Power plant, Park, Trolley avenue
- [x] Overlays: power, land value, traffic, walkability, transit
- [x] Save/load via `SaveSystem`
- [x] Perspective camera, sun/shadows, orbit vs paint input (Phase A)
- [x] Heightfield, water basins, height-aware picking (Phase B)
- [x] Map terrain generation (lakes, river, dirt beaches)
- [x] Extruded road / trolley meshes (Phase C)
- [x] Building kits + instancing (Phase D)
- [x] Parks, street trees, and plant smoke (Phase E)
- [x] Moving cars and trolleys on a render-only road graph (Phase F)
- [x] Gameplay: starter housing demand, sim speed/pause, placement and growth feedback
- [ ] Sound effects

## 3D port

Do not treat this README’s original “Phase 1 isometric board” as the end state.
Follow [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md) for camera, lighting,
terrain volume, instanced building kits, and input (tool paint vs orbit).
Simulation code in `src/sim/` must stay Babylon-free.
