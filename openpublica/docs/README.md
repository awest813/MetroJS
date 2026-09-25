# OpenPublica

A GPLv3 browser-native city-builder. The live renderer is a Babylon.js
**perspective 3D** city (orbit / iso / top). Remaining work is city-health sim
and presentation depth — see [NEXT_GAPS_PLAN.md](./NEXT_GAPS_PLAN.md).
The original camera/height/kit slices are in [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md).
How strategies compare and how a game plays out over time are audited, with a plan, in [STRATEGY_AND_GAMEFLOW.md](./STRATEGY_AND_GAMEFLOW.md).

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
│   ├── tools/    Player tools (Inspect, roads, zone brushes, Bulldoze, services)
│   ├── scenarios/ Scripted test cities built with the player tools (?city=<id>)
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
| Test cities | `src/scenarios/` | ❌ not allowed |
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
- [x] Tools: Inspect, Road, Highway, R/C/I/Mixed/Dezone brushes, Bulldoze, Power plant, Park, Police, Fire, Water, Trolley avenue (all three road tools bridge water)
- [x] Overlays: power, land value, traffic, walkability, transit, pollution, crowd, crime, fire, water (one height-aware mesh)
- [x] Save/load via `SaveSystem`: a loaded city matches the saved one tile for tile and plays on exactly as it would have
- [x] Perspective camera, sun/shadows, orbit vs paint input (Phase A)
- [x] Heightfield, water basins, height-aware picking (Phase B)
- [x] Map terrain generation (lakes, river, dirt beaches)
- [x] Extruded road / trolley meshes (Phase C)
- [x] Building kits + instancing (Phase D)
- [x] Parks, street trees, and plant smoke (Phase E)
- [x] Moving cars and trolleys on a render-only road graph (Phase F)
- [x] Gameplay: starter housing demand, sim speed/pause, placement and growth feedback, opening coach (street → lots → plant); the top advisory holds still for up to three months and is a link to the trouble it names; the Plant tool and factory areas show the homes their smog would reach before you build; the city rating (size, happiness, services, budget, less smog, high taxes, and debt) shows its parts on hover; milestones (Village, Town, City, Capital) show progress in the HUD, pay a grant, and announce themselves with a banner; villages start with a water pump, police post, and volunteer fire hall, and upgrade them in place when the budget can carry a tower or station
- [x] Unified 3D overlay mesh including pollution (Phase G)
- [x] Procedural sound (paint, growth, mute); unlocked on first gesture, M to mute
- [x] Camera polish: HTML minimap, Home/Frame, sun slider, High/Low quality
- [x] City menu + Settings: save/load confirms, mute/quality/sun, Ctrl+S, budget net (Look is minimap + Frame)
- [x] MIT `simplex-noise` + `alea` for seeded hills and tree jitter (lakes still use `terrainHash`)
- [x] Network traffic: trips leave by a lot's street and split across connected roads; highways carry double
- [x] Commutes: half of each home's trips drive the network to the nearest jobs with room, loading district exits, bridges, and any highway that shortens the trip; cars appear where the traffic is, and commuters drive those routes to work and back
- [x] Police and fire drive the streets (road-step reach, faster on highways); trolley lines of 4+ tiles give transit, take a share of nearby trips, and cross highways at grade
- [x] Bridges: drag a road straight across water (5× build, 3× upkeep) with piers, railings, and level decks
- [x] Shorelines follow tile edges: every dry tile renders above the water, thin spits/notches are smoothed at generation, and waterfront lots get a land-value premium
- [x] Smooth terrain: four-triangle tiles that match the height sampler, shared sun-lit normals, graded ground under roads, embankments, building foundations, and an earth skirt around the map
- [x] Placement: road tools drag straight or L-shaped lines with a live cost/bridge preview (Esc cancels, Shift paints freehand), and upgrading a street pays only the difference; bridges start from a road, so a stroke across water leaves no floating spans; the bulldozer drags a rectangle and previews what comes down; the cursor turns red where the tool would refuse; buildings face their street; cars curve through turns in their lane
- [x] Zoning: zone brushes drag rectangles with a live preview; deep areas lay their own streets, long blocks closed into loops and crossed halfway (S toggles), lots with no street show amber; each month's new buildings follow demand and fill outward from existing ones
- [x] Utilities run along the streets: a plant beside a street powers every street joined to it (400 load each, nearest lots first), and powered water towers feed mains the same way; hover a plant or tower to see its network, and the HUD shows power load against capacity
- [x] Ground: empty zoned lots are tinted plots with lot lines, grown lots sit on lawn, pavement, or work yards, and zone colours stop at the water's edge; seeded woods cover open grass, raise land value beside them, and clear when zoned or paved
- [x] Rail and menus: tools two to a row with their shortcut keys, every tool reachable at 1280×720, HUD clear of Budget, one-row tool strip on phones
- [x] Economy: taxes cover upkeep about 1.3–2×; Budget shows this month's taxes, civic and road upkeep, net, last bill, each tax's take, and how long the money lasts in the red
- [x] Time: the HUD date counts days; a hidden tab no longer ages the city
- [x] Weather: seeded seasonal weather each month (heatwaves load power and water, snow costs plowing and heating, rain washes smog) with sky, fog, rain, snow cover, lightning, and rain sound; `?weather=<kind>` pins it
- [x] Shops grow up: small shops, shop rows, and office blocks on dear land (traffic by jobs)
- [x] Industry grows: workshops become factories while residents lack jobs, and works where a highway is close for freight
- [x] Budget levers: police-and-fire and road funding sliders (upkeep and service scale together) and bonds with interest
- [x] Growth within the grid: new buildings wait for power instead of darkening the far end of a full grid; Inspect and the advisory say so
- [x] Buildings shrink: the biggest sizes step down, a few a month, when their land value falls well under the bar that grew them or industry declines
- [x] Frame time checked in a full city on High (Gap AB): flat road pieces cast no shadows and draw only the faces that show, buildings stop recomputing their matrices, a month end routes traffic once, and weather shaders compile at load
- [x] Happiness decides how many people move in: below 80 housing grows at a falling share of its demand, at 30 residents leave; the HUD shows what made it
- [x] Demand that means something: shops open while residents have room for them (up to 1.5 shop and office jobs each) and factories while residents lack work; taxes trade people for money on a slope, not a cliff (each point over 9% leaves 4% of places empty and turns away 7% of newcomers); the demand bars show what acts and explain themselves, and the emptying advice names the real cause; mixed use (flats over shops) can start a town, and pays a main-street premium to build larger
- [x] GLB building kits: a model for every building (`npm run models`) replaces its procedural kit on High quality, baked to one instanced mesh each; any glTF following `public/models/ASSET_LICENSE.md` can replace one, and a missing model falls back to its kit
- [x] Services count: fire cover raises land value, fire and water gaps cost rating, the advisory names dry buildings behind full towers, and Inspect gives each service's reach, buildings covered, and upkeep
- [x] Ambient occlusion (Settings, off by default, High only): soft shade where buildings and trees meet the ground, paused under data maps, with FXAA for the edges
- [x] Test cities: `?city=hamlet|riverside|metro|troubled|sprawl` (or New → Or open a test city) builds a scripted city with the player tools and seeded growth; `test/testCity.<id>.ts` checks each

Follow [NEXT_GAPS_PLAN.md](./NEXT_GAPS_PLAN.md) for what is left: a real-GPU check of ambient occlusion, and optionally an artist's model kit. Untextured PBR, sky dome, `CityView` rebuild-on-load, city-health, mayor Score/advisory, highways, water, zoning plats/downtown, building degradation, opening coach, and per-service upkeep/coverage preview are in the HUD.

## 3D port

Do not treat this README as unfinished “Phase 1 isometric board.”
Phases A–H of [FULL_3D_WEB_PORT_PLAN.md](./FULL_3D_WEB_PORT_PLAN.md) are in the
tree. Simulation code in `src/sim/` must stay Babylon-free.
