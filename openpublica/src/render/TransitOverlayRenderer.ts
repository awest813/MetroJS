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

// ── Overlay visual configuration ──────────────────────────────────────────────

/** Elevation above terrain to avoid z-fighting (above walkability at 0.05). */
const OVERLAY_Y = 0.06;

/** Maximum alpha for the overlay at full transit access. */
const OVERLAY_ALPHA = 0.50;

type RgbaColor = { r: number; g: number; b: number; a: number };

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders a semi-transparent overlay that visualises transit access scores.
 *
 * The overlay covers every tile.  Tiles with no transit access are fully
 * transparent; tiles near trolley corridors ramp from deep violet to bright
 * purple, giving the player a clear spatial picture of transit coverage.
 *
 * Colour key:
 * - **Transparent**: transitAccess = 0.
 * - **Deep violet**:  medium transit access (50).
 * - **Bright purple**: high transit access (100).
 *
 * Call `build(map)` once after creating the terrain, then `setVisible(true)` to
 * enable overlay mode and `refresh(map)` whenever transit access changes.
 */
export class TransitOverlayRenderer {
  private readonly _scene: Scene;
  private _mesh:    Mesh | null = null;
  private _visible  = false;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Build the overlay mesh from the current CityMap state.
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

      const c = _colorForTransit(tile.transitAccess);
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

    const mesh = new Mesh('transit-overlay', this._scene);
    const vd   = new VertexData();
    vd.positions = positions;
    vd.normals   = normals;
    vd.colors    = colors;
    vd.indices   = indices;
    vd.applyToMesh(mesh, true); // updatable

    const mat           = new StandardMaterial('transit-overlay-mat', this._scene);
    mat.specularColor   = Color3.Black();
    mat.backFaceCulling = false;
    mesh.hasVertexAlpha = true;
    mesh.material       = mat;
    mesh.isPickable     = false;
    mesh.isVisible      = this._visible;

    this._mesh = mesh;
  }

  /**
   * Rewrite every tile's overlay colour from the latest CityMap state.
   * Call this whenever transit access changes (monthly tick).
   */
  refresh(map: CityMap): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    let ci = 0;
    map.forEach((tile) => {
      const c = _colorForTransit(tile.transitAccess);
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

  /** Show or hide the transit overlay mesh. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (this._mesh) this._mesh.isVisible = visible;
  }

  /** Whether the transit overlay is currently visible. */
  get isVisible(): boolean {
    return this._visible;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Maps a transit access score [0, 100] to an RGBA colour.
 *
 * Colour gradient (violet/purple family — distinct from all other overlays):
 * - 0   → fully transparent
 * - 50  → deep violet   (r=0.45, g=0.10, b=0.80)
 * - 100 → bright purple (r=0.65, g=0.20, b=1.00)
 *
 * Alpha ramps with the score so zero-access tiles are invisible.
 */
function _colorForTransit(transitAccess: number): RgbaColor {
  const t = Math.max(0, Math.min(100, transitAccess)) / 100; // [0, 1]

  const r = 0.45 + 0.20 * t;   // 0.45 → 0.65
  const g = 0.10 + 0.10 * t;   // 0.10 → 0.20
  const b = 0.80 + 0.20 * t;   // 0.80 → 1.00
  const a = OVERLAY_ALPHA * t;  // fully transparent at access=0

  return { r, g, b, a };
}
