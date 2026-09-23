import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { TILE_SIZE, TILE_FILL } from '../data/constants';
import {
  FAN_TRIANGLES,
  FAN_VERTS,
  writeFanIndices,
  writeTileFan,
  type HeightField,
} from '../sim/HeightField';

/** Anything that can say how high the visible surface is at a tile centre. */
export interface SurfaceHeights {
  tileCenter(x: number, y: number): number;
}

/** One tinted tile for a preview mask. */
export interface TileTint {
  readonly x: number;
  readonly y: number;
  readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
  readonly alpha: number;
}

const CURSOR_OK = { diffuse: new Color3(1.0, 0.95, 0.1), emissive: new Color3(0.4, 0.35, 0.0) };
const CURSOR_BLOCKED = { diffuse: new Color3(1.0, 0.28, 0.22), emissive: new Color3(0.45, 0.07, 0.05) };

/** Reach tiles sit just above road decks, like the overlay. */
const REACH_LIFT = 0.15;

/**
 * Tile cursor, a translucent coverage disc for radius services, and a tile
 * mask for road-dispatched services (police, fire) whose reach follows streets.
 */
export class HighlightRenderer {
  private readonly _mesh: Mesh;
  private readonly _cursorMat: StandardMaterial;
  private readonly _cover: Mesh;
  private readonly _coverMat: StandardMaterial;
  private readonly _reach: Mesh;
  private readonly _reachMat: StandardMaterial;
  private readonly _plan: Mesh;

  constructor(scene: Scene) {
    this._mesh = MeshBuilder.CreateGround(
      'highlight',
      { width: TILE_SIZE * TILE_FILL, height: TILE_SIZE * TILE_FILL },
      scene,
    );
    this._mesh.position = new Vector3(0, 0.005, 0);
    this._mesh.isPickable = false;
    this._mesh.isVisible = false;

    const mat = new StandardMaterial('highlight-mat', scene);
    mat.diffuseColor = CURSOR_OK.diffuse;
    mat.emissiveColor = CURSOR_OK.emissive;
    mat.alpha = 0.55;
    mat.backFaceCulling = false;
    this._mesh.material = mat;
    this._cursorMat = mat;

    this._cover = MeshBuilder.CreateCylinder(
      'service-cover',
      { diameter: 1, height: 0.02, tessellation: 48 },
      scene,
    );
    this._cover.isPickable = false;
    this._cover.receiveShadows = false;
    this._cover.isVisible = false;
    this._coverMat = new StandardMaterial('service-cover-mat', scene);
    this._coverMat.alpha = 0.18;
    this._coverMat.backFaceCulling = false;
    this._coverMat.disableLighting = true;
    this._cover.material = this._coverMat;

    this._reach = new Mesh('service-reach', scene);
    this._reach.isPickable = false;
    this._reach.isVisible = false;
    this._reach.hasVertexAlpha = true;
    this._reach.useVertexColors = true;
    this._reachMat = new StandardMaterial('service-reach-mat', scene);
    this._reachMat.specularColor = Color3.Black();
    this._reachMat.backFaceCulling = false;
    this._reach.material = this._reachMat;

    this._plan = new Mesh('road-plan', scene);
    this._plan.isPickable = false;
    this._plan.isVisible = false;
    this._plan.hasVertexAlpha = true;
    this._plan.useVertexColors = true;
    const planMat = new StandardMaterial('road-plan-mat', scene);
    planMat.specularColor = Color3.Black();
    planMat.emissiveColor = new Color3(0.35, 0.35, 0.35);
    planMat.backFaceCulling = false;
    this._plan.material = planMat;
  }

  /**
   * Move the highlight to the given tile and make it visible. `blocked`
   * turns it red: the active tool would leave this tile alone.
   */
  show(coord: TileCoord, surface?: SurfaceHeights | null, blocked = false): void {
    this._mesh.position.x = coord.x * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.position.z = coord.y * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.position.y = (surface?.tileCenter(coord.x, coord.y) ?? 0) + 0.02;
    const look = blocked ? CURSOR_BLOCKED : CURSOR_OK;
    this._cursorMat.diffuseColor = look.diffuse;
    this._cursorMat.emissiveColor = look.emissive;
    this._mesh.isVisible = true;
  }

  showCoverage(
    coord: TileCoord,
    radiusTiles: number,
    rgb: { r: number; g: number; b: number },
    surface?: SurfaceHeights | null,
  ): void {
    this._reach.isVisible = false;
    if (radiusTiles <= 0) {
      this.hideCoverage();
      return;
    }
    const diameter = Math.max(1, radiusTiles * 2);
    this._cover.scaling.x = diameter;
    this._cover.scaling.z = diameter;
    this._cover.position.x = coord.x * TILE_SIZE + TILE_SIZE / 2;
    this._cover.position.z = coord.y * TILE_SIZE + TILE_SIZE / 2;
    this._cover.position.y = (surface?.tileCenter(coord.x, coord.y) ?? 0) + 0.015;
    this._coverMat.emissiveColor = new Color3(rgb.r, rgb.g, rgb.b);
    this._coverMat.diffuseColor = new Color3(rgb.r, rgb.g, rgb.b);
    this._cover.isVisible = true;
  }

  /**
   * Tint each tile a station reaches, stronger where coverage is higher.
   * `flatY` returns a height for tiles that should sit flat (bridge decks,
   * water); other tiles follow the terrain.
   */
  /** Tint tiles one colour each on the reach mesh, e.g. a utility network and its short lots. */
  showTints(
    tints: ReadonlyArray<TileTint>,
    heights: HeightField,
    flatY: (x: number, y: number) => number | null,
  ): void {
    this._cover.isVisible = false;
    this._fill(this._reach, tints, heights, flatY);
    this._reachMat.emissiveColor = new Color3(0.12, 0.12, 0.12);
  }

  showReach(
    tiles: ReadonlyArray<{ x: number; y: number; coverage: number }>,
    rgb: { r: number; g: number; b: number },
    heights: HeightField,
    flatY: (x: number, y: number) => number | null,
  ): void {
    this._cover.isVisible = false;
    const tints = tiles.map((tile) => ({
      x: tile.x,
      y: tile.y,
      rgb,
      alpha: 0.12 + 0.38 * Math.max(0, Math.min(1, tile.coverage / 100)),
    }));
    this._fill(this._reach, tints, heights, flatY);
    this._reachMat.emissiveColor = new Color3(rgb.r * 0.35, rgb.g * 0.35, rgb.b * 0.35);
  }

  /** Tint the tiles of a pending road line, one colour per tile. */
  showPlan(
    tiles: ReadonlyArray<TileTint>,
    heights: HeightField,
    flatY: (x: number, y: number) => number | null,
  ): void {
    this._fill(this._plan, tiles, heights, flatY);
  }

  hidePlan(): void {
    this._plan.isVisible = false;
  }

  private _fill(
    mesh: Mesh,
    tiles: ReadonlyArray<TileTint>,
    heights: HeightField,
    flatY: (x: number, y: number) => number | null,
  ): void {
    if (tiles.length === 0) {
      mesh.isVisible = false;
      return;
    }
    const positions = new Float32Array(tiles.length * FAN_VERTS * 3);
    const colors = new Float32Array(tiles.length * FAN_VERTS * 4);
    const indices = new Uint32Array(tiles.length * FAN_TRIANGLES * 3);
    const span = TILE_SIZE * TILE_FILL;
    tiles.forEach((tile, i) => {
      const vi = i * FAN_VERTS;
      const flat = flatY(tile.x, tile.y);
      if (flat === null) {
        writeTileFan(positions, vi, tile.x, tile.y, span, heights, REACH_LIFT);
      } else {
        const x0 = tile.x * TILE_SIZE;
        const z0 = tile.y * TILE_SIZE;
        const pts = [[x0, z0], [x0 + span, z0], [x0, z0 + span], [x0 + span, z0 + span], [x0 + span / 2, z0 + span / 2]];
        // Shore tiles can rise above the water line; stay on whichever is higher.
        pts.forEach(([cx, cz], v) => {
          positions.set([cx, Math.max(flat, heights.sample(cx, cz)) + REACH_LIFT, cz], (vi + v) * 3);
        });
      }
      for (let v = 0; v < FAN_VERTS; v++) {
        colors.set([tile.rgb.r, tile.rgb.g, tile.rgb.b, tile.alpha], (vi + v) * 4);
      }
      writeFanIndices(indices, i * FAN_TRIANGLES * 3, vi);
    });
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.colors = colors;
    data.indices = indices;
    data.applyToMesh(mesh, true);
    mesh.isVisible = true;
  }

  hide(): void {
    this._mesh.isVisible = false;
  }

  hideCoverage(): void {
    this._cover.isVisible = false;
    this._reach.isVisible = false;
  }
}
