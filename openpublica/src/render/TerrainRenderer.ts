import {
  Scene,
  Mesh,
  VertexData,
  VertexBuffer,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { GameMap, Tile } from '../sim/GameMap';
import type { CityMap } from '../sim/CityMap';
import type { CityTile } from '../sim/CityTile';
import { TILE_COLORS } from '../data/tileTypes';
import { cityTileColor } from '../data/cityTileColors';
import { TILE_SIZE, TILE_FILL } from '../data/constants';
import type { TileColor } from '../data/tileTypes';

/** Name of the terrain mesh — used by TilePicker to identify hits. */
export const TERRAIN_MESH_NAME = 'terrain';

/**
 * Renders the entire tile grid as a single merged mesh with per-vertex colours.
 * One draw call regardless of map size.  Update a tile by calling updateTile().
 */
export class TerrainRenderer {
  private readonly _scene: Scene;
  private _mesh: Mesh | null = null;
  private _mapWidth = 0;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /**
   * Builds the terrain mesh from the current map state.
   * Must be called once before rendering begins.
   */
  buildGrid(map: GameMap): void {
    this._mapWidth = map.width;

    const W = map.width;
    const H = map.height;
    const tileCount = W * H;

    // 4 independent vertices per quad (no shared edges → clean per-tile colour)
    const positions = new Float32Array(tileCount * 4 * 3); // xyz per vert
    const normals = new Float32Array(tileCount * 4 * 3);   // xyz per vert
    const colors = new Float32Array(tileCount * 4 * 4);    // rgba per vert
    const indices = new Uint32Array(tileCount * 6);        // 2 triangles per quad

    let vi = 0; // vertex index (per vertex)
    let ci = 0; // colour index (per channel)
    let ii = 0; // index buffer index

    map.forEach((tile) => {
      const tx = tile.x;
      const ty = tile.y;
      const x0 = tx * TILE_SIZE;
      const x1 = x0 + TILE_SIZE * TILE_FILL;
      const z0 = ty * TILE_SIZE;
      const z1 = z0 + TILE_SIZE * TILE_FILL;
      const c = TILE_COLORS[tile.type];

      // 4 vertices: v0=front-left, v1=front-right, v2=back-left, v3=back-right
      const p = vi * 3;
      positions[p]     = x0; positions[p + 1] = 0; positions[p + 2]  = z0;
      positions[p + 3] = x1; positions[p + 4] = 0; positions[p + 5]  = z0;
      positions[p + 6] = x0; positions[p + 7] = 0; positions[p + 8]  = z1;
      positions[p + 9] = x1; positions[p + 10] = 0; positions[p + 11] = z1;

      // All normals point up (+Y)
      for (let v = 0; v < 4; v++) {
        normals[p + v * 3]     = 0;
        normals[p + v * 3 + 1] = 1;
        normals[p + v * 3 + 2] = 0;
      }

      // Colour (RGBA, same for all 4 verts)
      for (let v = 0; v < 4; v++) {
        colors[ci + v * 4]     = c.r;
        colors[ci + v * 4 + 1] = c.g;
        colors[ci + v * 4 + 2] = c.b;
        colors[ci + v * 4 + 3] = 1.0;
      }
      ci += 16;

      // Indices: 2 triangles, CCW winding = normal faces +Y in Babylon (left-handed)
      // Triangle 1: v0, v2, v1  Triangle 2: v1, v2, v3
      indices[ii]     = vi;
      indices[ii + 1] = vi + 2;
      indices[ii + 2] = vi + 1;
      indices[ii + 3] = vi + 1;
      indices[ii + 4] = vi + 2;
      indices[ii + 5] = vi + 3;
      ii += 6;

      vi += 4;
    });

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.colors = colors;
    vertexData.indices = indices;

    const mesh = new Mesh(TERRAIN_MESH_NAME, this._scene);
    vertexData.applyToMesh(mesh, true); // true = updatable

    const mat = new StandardMaterial('terrain-mat', this._scene);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;

    this._mesh = mesh;
  }

  /**
   * Updates the vertex colours for a single tile after its type changes.
   * Call this immediately after mutating the GameMap tile.
   */
  updateTile(tile: Tile): void {
    this._updateColors(tile.x, tile.y, TILE_COLORS[tile.type]);
  }

  /**
   * Builds the terrain mesh from a CityMap.
   * Use this variant when working with the CitySim layer (new pipeline).
   */
  buildCityGrid(map: CityMap): void {
    this._mapWidth = map.width;

    const W = map.width;
    const H = map.height;
    const tileCount = W * H;

    const positions = new Float32Array(tileCount * 4 * 3);
    const normals   = new Float32Array(tileCount * 4 * 3);
    const colors    = new Float32Array(tileCount * 4 * 4);
    const indices   = new Uint32Array(tileCount * 6);

    let vi = 0;
    let ci = 0;
    let ii = 0;

    map.forEach((tile) => {
      const tx = tile.x;
      const ty = tile.y;
      const x0 = tx * TILE_SIZE;
      const x1 = x0 + TILE_SIZE * TILE_FILL;
      const z0 = ty * TILE_SIZE;
      const z1 = z0 + TILE_SIZE * TILE_FILL;
      const c  = cityTileColor(tile);

      const p = vi * 3;
      positions[p]      = x0; positions[p + 1]  = 0; positions[p + 2]  = z0;
      positions[p + 3]  = x1; positions[p + 4]  = 0; positions[p + 5]  = z0;
      positions[p + 6]  = x0; positions[p + 7]  = 0; positions[p + 8]  = z1;
      positions[p + 9]  = x1; positions[p + 10] = 0; positions[p + 11] = z1;

      for (let v = 0; v < 4; v++) {
        normals[p + v * 3]     = 0;
        normals[p + v * 3 + 1] = 1;
        normals[p + v * 3 + 2] = 0;
      }

      for (let v = 0; v < 4; v++) {
        colors[ci + v * 4]     = c.r;
        colors[ci + v * 4 + 1] = c.g;
        colors[ci + v * 4 + 2] = c.b;
        colors[ci + v * 4 + 3] = 1.0;
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

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals   = normals;
    vertexData.colors    = colors;
    vertexData.indices   = indices;

    if (this._mesh) this._mesh.dispose();

    const mesh = new Mesh(TERRAIN_MESH_NAME, this._scene);
    vertexData.applyToMesh(mesh, true);

    const mat = new StandardMaterial('terrain-mat', this._scene);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;

    this._mesh = mesh;
  }

  /**
   * Updates the vertex colors for a single CityTile after it is mutated.
   * Call this from the App's `onTileChanged` handler to keep the view in sync.
   */
  updateCityTile(tile: CityTile): void {
    this._updateColors(tile.x, tile.y, cityTileColor(tile));
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _updateColors(x: number, y: number, c: TileColor): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    const i  = y * this._mapWidth + x;
    const ci = i * 16; // 4 verts × 4 channels

    for (let v = 0; v < 4; v++) {
      rawColors[ci + v * 4]     = c.r;
      rawColors[ci + v * 4 + 1] = c.g;
      rawColors[ci + v * 4 + 2] = c.b;
      rawColors[ci + v * 4 + 3] = 1.0;
    }

    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }
}
