import {
  Scene,
  Mesh,
  VertexData,
  VertexBuffer,
  StandardMaterial,
  Color3,
  ShadowGenerator,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import type { CityTile } from '../sim/CityTile';
import { cityTileColor } from '../data/cityTileColors';
import { TILE_SIZE } from '../data/constants';
import type { TileColor } from '../data/tileTypes';
import { HeightField, writeSlopedQuad } from '../sim/HeightField';

/** Name of the terrain mesh — used by TilePicker to identify hits. */
export const TERRAIN_MESH_NAME = 'terrain';

/**
 * Renders the city grid as a sloped heightfield with per-tile vertex colours.
 * One draw call. Update a tile colour with updateCityTile().
 */
export class TerrainRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private _mesh: Mesh | null = null;
  private _mapWidth = 0;
  private _heights: HeightField | null = null;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;
  }

  /**
   * Builds the terrain mesh from a CityMap and matching HeightField.
   */
  buildCityGrid(map: CityMap, heights: HeightField): void {
    this._mapWidth = map.width;
    this._heights = heights;

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
      writeSlopedQuad(positions, vi, tile.x, tile.y, TILE_SIZE, heights, 0);
      const c = cityTileColor(tile);

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

    VertexData.ComputeNormals(positions, indices, normals);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals   = normals;
    vertexData.colors    = colors;
    vertexData.indices   = indices;

    if (this._mesh) this._mesh.dispose();

    const mesh = new Mesh(TERRAIN_MESH_NAME, this._scene);
    vertexData.applyToMesh(mesh, true);

    const mat = new StandardMaterial('terrain-mat', this._scene);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.receiveShadows = true;
    this._shadows?.addShadowCaster(mesh);

    this._mesh = mesh;
  }

  /**
   * Updates the vertex colors for a single CityTile after it is mutated.
   */
  updateCityTile(tile: CityTile): void {
    this._updateColors(tile.x, tile.y, cityTileColor(tile));
  }

  get heights(): HeightField | null {
    return this._heights;
  }

  private _updateColors(x: number, y: number, c: TileColor): void {
    if (!this._mesh) return;

    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;

    const i  = y * this._mapWidth + x;
    const ci = i * 16;

    for (let v = 0; v < 4; v++) {
      rawColors[ci + v * 4]     = c.r;
      rawColors[ci + v * 4 + 1] = c.g;
      rawColors[ci + v * 4 + 2] = c.b;
      rawColors[ci + v * 4 + 3] = 1.0;
    }

    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }
}
