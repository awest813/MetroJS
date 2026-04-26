import {
  Scene,
  Mesh,
  VertexData,
  VertexBuffer,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { TILE_SIZE, TILE_FILL } from '../data/constants';

// ── Overlay colour palette ────────────────────────────────────────────────────

/** Elevation above terrain to avoid z-fighting (slightly above power overlay). */
const OVERLAY_Y = 0.03;

/** Semi-transparency for all land value tiles. */
const OVERLAY_ALPHA = 0.45;

// Gradient stops: red (#E62600) → yellow (#E6C800) → green (#1AE600)
// Red channel:   0.9  at LV=0,  0.9  at LV=50, 0.1  at LV=100
// Green channel: 0.0  at LV=0,  0.78 at LV=50, 0.9  at LV=100
// Blue channel:  0.0  throughout (kept at 0 for a clean RYG gradient)
const COLOR_R_LOW  = 0.90; // red component at LV=0 (and LV=50)
const COLOR_G_MID  = 0.78; // green component at LV=50
const COLOR_G_HIGH = 0.90; // green component at LV=100
const COLOR_R_HIGH = 0.10; // red component at LV=100

type RgbaColor = { r: number; g: number; b: number; a: number };

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders a semi-transparent overlay that visualises land value.
 *
 * Colour key (gradient from low to high land value):
 * - **Red**:    low land value (0).
 * - **Yellow**: medium land value (50).
 * - **Green**:  high land value (100).
 *
 * Call `build(map)` once after creating the terrain, then `setVisible(true)` to
 * enable overlay mode and `refresh(map)` whenever land value changes.
 */
export class LandValueOverlayRenderer {
  private readonly _scene: Scene;
  private _mesh:    Mesh | null = null;
  private _visible  = false;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Build the overlay mesh from the current CityMap state.
   * Must be called once after the terrain mesh is ready.
   * Safe to call again to rebuild (disposes the previous mesh first).
   */
  build(map: CityMap): void {
    const W         = map.width;
    const H         = map.height;
    const tileCount = W * H;

    const positions = new Float32Array(tileCount * 4 * 3);
    const normals   = new Float32Array(tileCount * 4 * 3);
    const colors    = new Float32Array(tileCount * 4 * 4);
    const indices   = new Uint32Array(tileCount * 6);

    let vi = 0;
    let ci = 0;
    let ii = 0;

    map.forEach((tile) => {
      const x0 = tile.x * TILE_SIZE;
      const x1 = x0 + TILE_SIZE * TILE_FILL;
      const z0 = tile.y * TILE_SIZE;
      const z1 = z0 + TILE_SIZE * TILE_FILL;

      const p = vi * 3;
      positions[p]      = x0; positions[p + 1]  = OVERLAY_Y; positions[p + 2]  = z0;
      positions[p + 3]  = x1; positions[p + 4]  = OVERLAY_Y; positions[p + 5]  = z0;
      positions[p + 6]  = x0; positions[p + 7]  = OVERLAY_Y; positions[p + 8]  = z1;
      positions[p + 9]  = x1; positions[p + 10] = OVERLAY_Y; positions[p + 11] = z1;

      for (let v = 0; v < 4; v++) {
        normals[p + v * 3]     = 0;
        normals[p + v * 3 + 1] = 1;
        normals[p + v * 3 + 2] = 0;
      }

      const c = _colorForLV(tile.landValue);
      for (let v = 0; v < 4; v++) {
        colors[ci + v * 4]     = c.r;
        colors[ci + v * 4 + 1] = c.g;
        colors[ci + v * 4 + 2] = c.b;
        colors[ci + v * 4 + 3] = c.a;
      }
      ci += 16;

      indices[ii]     = vi;
      indices[ii + 1] = vi + 2;
      indices[ii + 2] = vi + 1;
      indices[ii + 3] = vi + 1;
      indices[ii + 4] = vi + 2;
      indices[ii + 5] = vi + 3;
      ii += 6;

      vi += 4;
    });

    if (this._mesh) this._mesh.dispose();

    const mesh = new Mesh('landvalue-overlay', this._scene);
    const vd   = new VertexData();
    vd.positions = positions;
    vd.normals   = normals;
    vd.colors    = colors;
    vd.indices   = indices;
    vd.applyToMesh(mesh, true); // updatable

    const mat            = new StandardMaterial('landvalue-overlay-mat', this._scene);
    mat.specularColor    = Color3.Black();
    mat.backFaceCulling  = false;
    mesh.hasVertexAlpha  = true;
    mesh.material        = mat;
    mesh.isPickable      = false;
    mesh.isVisible       = this._visible;

    this._mesh = mesh;
  }

  /**
   * Rewrite every tile's overlay colour from the latest CityMap state.
   * Call this whenever land value changes (monthly tick or after park placement).
   */
  refresh(map: CityMap): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    let ci = 0;
    map.forEach((tile) => {
      const c = _colorForLV(tile.landValue);
      for (let v = 0; v < 4; v++) {
        rawColors[ci + v * 4]     = c.r;
        rawColors[ci + v * 4 + 1] = c.g;
        rawColors[ci + v * 4 + 2] = c.b;
        rawColors[ci + v * 4 + 3] = c.a;
      }
      ci += 16;
    });

    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }

  /** Show or hide the land value overlay mesh. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (this._mesh) this._mesh.isVisible = visible;
  }

  /** Whether the land value overlay is currently visible. */
  get isVisible(): boolean {
    return this._visible;
  }
}

// ── Module-level helpers (no closure state) ───────────────────────────────────

/**
 * Maps a land value in [0, 100] to an RGBA colour.
 *
 * 0   → red    (#E62600)
 * 50  → yellow (#E6C800)
 * 100 → green  (#1AE600)
 */
function _colorForLV(landValue: number): RgbaColor {
  const t = Math.max(0, Math.min(100, landValue)) / 100; // normalise to [0, 1]

  if (t < 0.5) {
    // Red → Yellow: red stays at COLOR_R_LOW, green ramps from 0 to COLOR_G_MID
    const s = t * 2; // [0, 1]
    return { r: COLOR_R_LOW, g: s * COLOR_G_MID, b: 0, a: OVERLAY_ALPHA };
  } else {
    // Yellow → Green: red drops from COLOR_R_LOW to COLOR_R_HIGH,
    //                 green rises from COLOR_G_MID to COLOR_G_HIGH
    const s = (t - 0.5) * 2; // [0, 1]
    return {
      r: COLOR_R_LOW - s * (COLOR_R_LOW - COLOR_R_HIGH),
      g: COLOR_G_MID + s * (COLOR_G_HIGH - COLOR_G_MID),
      b: 0,
      a: OVERLAY_ALPHA,
    };
  }
}
