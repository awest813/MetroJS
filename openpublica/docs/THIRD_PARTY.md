# Third-party MIT libraries (OpenPublica)

OpenPublica itself is GPLv3. These MIT-licensed packages are used only for
presentation helpers (hills and vegetation jitter). They do **not** replace
simulation formulas, Micropolis assets, or Babylon.js.

| Package | Use | Upstream |
|---|---|---|
| `simplex-noise` | Continuous 2D simplex FBM for `HeightField` hills | [jwagner/simplex-noise.js](https://github.com/jwagner/simplex-noise.js) |
| `alea` | Seeded PRNG so simplex and tree jitter stay deterministic | [coverslide/node-alea](https://github.com/coverslide/node-alea) (Alea by Johannes Baagøe) |

Lake/river/dirt paint still uses `terrainHash` so map topology does not change.

Not added (wrong licence, second engine, or out of scope): Micropolis samples,
Howler (we keep original Web Audio), Cannon/Ammo (no physics), Three.js (Babylon only).
