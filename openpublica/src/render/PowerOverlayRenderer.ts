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

/** Elevation above terrain to avoid z-fighting. */
const OVERLAY_Y = 0.02;

/** RGBA for a powered tile (green, semi-transparent). */
const POWERED_COLOR   = { r: 0.15, g: 0.90, b: 0.15, a: 0.35 } as const;

/** RGBA for an unpowered tile that has a building (red, semi-transparent). */
const UNPOWERED_COLOR = { r: 0.90, g: 0.15, b: 0.15, a: 0.40 } as const;

/** Fully transparent — used for unpowered tiles with no building. */
const CLEAR_COLOR     = { r: 0.00, g: 0.00, b: 0.00, a: 0.00 } as const;

type RgbaColor = { r: number; g: number; b: number; a: number };

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders a semi-transparent overlay that visualises power coverage.
 *
 * Colour key:
 * - **Green**:  tile is within a power plant's radius (powered).
 * - **Red**:    tile has a building but is outside all power radii.
 * - **Clear**:  tile is unpowered and has no building (no visual noise).
 *
 * Call `build(map)` once after creating the terrain, then `setVisible(true)` to
 * enable overlay mode and `refresh(map)` whenever power coverage changes.
 */
export class PowerOverlayRenderer {
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

      const c = _colorFor(tile.powered, tile.buildingId !== null);
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

    const mesh = new Mesh('power-overlay', this._scene);
    const vd   = new VertexData();
    vd.positions = positions;
    vd.normals   = normals;
    vd.colors    = colors;
    vd.indices   = indices;
    vd.applyToMesh(mesh, true); // updatable

    const mat            = new StandardMaterial('power-overlay-mat', this._scene);
    mat.specularColor    = Color3.Black();
    mat.backFaceCulling  = false;
    // Alpha comes from per-vertex colours; material alpha stays at 1.
    mesh.hasVertexAlpha  = true;
    mesh.material        = mat;
    mesh.isPickable      = false;
    mesh.isVisible       = this._visible;

    this._mesh = mesh;
  }

  /**
   * Rewrite every tile's overlay colour from the latest CityMap state.
   * Call this whenever power coverage changes (monthly tick or after placement).
   */
  refresh(map: CityMap): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    let ci = 0;
    map.forEach((tile) => {
      const c = _colorFor(tile.powered, tile.buildingId !== null);
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

  /** Show or hide the power overlay mesh. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (this._mesh) this._mesh.isVisible = visible;
  }

  /** Whether the power overlay is currently visible. */
  get isVisible(): boolean {
    return this._visible;
  }
}

// ── Module-level helpers (no closure state) ───────────────────────────────────

function _colorFor(powered: boolean, hasBuilding: boolean): RgbaColor {
  if (powered)     return POWERED_COLOR;
  if (hasBuilding) return UNPOWERED_COLOR;
  return CLEAR_COLOR;
}
