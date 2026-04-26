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

/** Elevation above terrain to avoid z-fighting (above traffic overlay at 0.04). */
const OVERLAY_Y = 0.05;

/** Semi-transparency at full walkability. */
const OVERLAY_ALPHA = 0.50;

type RgbaColor = { r: number; g: number; b: number; a: number };

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders a semi-transparent overlay that visualises walkability.
 *
 * Colour key (gradient from low to high walkability):
 * - **Transparent**: walkability = 0 (invisible — not walkable).
 * - **Teal**:        medium walkability (50).
 * - **Bright cyan**: high walkability (100).
 *
 * Covers all tiles (not just roads), so the player can see which
 * neighbourhoods are pedestrian-friendly at a glance.
 *
 * Call `build(map)` once after creating the terrain, then `setVisible(true)` to
 * enable overlay mode and `refresh(map)` whenever walkability changes.
 */
export class WalkabilityOverlayRenderer {
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

      const c = _colorForWalkability(tile.walkability);
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

    const mesh = new Mesh('walkability-overlay', this._scene);
    const vd   = new VertexData();
    vd.positions = positions;
    vd.normals   = normals;
    vd.colors    = colors;
    vd.indices   = indices;
    vd.applyToMesh(mesh, true); // updatable

    const mat           = new StandardMaterial('walkability-overlay-mat', this._scene);
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
   * Call this whenever walkability changes (monthly tick).
   */
  refresh(map: CityMap): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    let ci = 0;
    map.forEach((tile) => {
      const c = _colorForWalkability(tile.walkability);
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

  /** Show or hide the walkability overlay mesh. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (this._mesh) this._mesh.isVisible = visible;
  }

  /** Whether the walkability overlay is currently visible. */
  get isVisible(): boolean {
    return this._visible;
  }
}

// ── Module-level helpers (no closure state) ───────────────────────────────────

/**
 * Maps a walkability score in [0, 100] to an RGBA colour.
 *
 * Colour gradient (teal family — distinct from red/yellow/green of other overlays):
 * - 0   → fully transparent (not walkable, no colour shown)
 * - 50  → medium teal  (r=0.10, g=0.60, b=0.55)
 * - 100 → bright cyan  (r=0.00, g=0.85, b=0.80)
 *
 * Alpha also ramps from 0 → OVERLAY_ALPHA so low-walkability tiles are
 * invisible and high-walkability tiles are clearly tinted.
 */
function _colorForWalkability(walkability: number): RgbaColor {
  const t = Math.max(0, Math.min(100, walkability)) / 100; // [0, 1]

  // Transparent → teal → bright cyan
  const r = 0.10 * (1 - t);               // 0.10 at walk=0, 0.00 at walk=100
  const g = 0.60 * t + 0.25 * t * t;      // ramps smoothly to 0.85 at walk=100
  const b = 0.55 * t + 0.25 * t * t;      // ramps smoothly to 0.80 at walk=100
  const a = OVERLAY_ALPHA * t;            // fully transparent at walk=0

  return { r, g, b, a };
}
