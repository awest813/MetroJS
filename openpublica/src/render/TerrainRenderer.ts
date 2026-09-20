import {
  Scene,
  Mesh,
  VertexData,
  VertexBuffer,
  ShadowGenerator,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import type { CityTile } from '../sim/CityTile';
import { tileCornerColors } from '../data/cityTileColors';
import { TILE_SIZE } from '../data/constants';
import { HeightField, writeSlopedQuad } from '../sim/HeightField';
import { vertexColorPbr } from './pbrSurfaces';

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
  private _map: CityMap | null = null;
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
    this._map = map;
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
      const corners = tileCornerColors(map, tile.x, tile.y);

      for (let v = 0; v < 4; v++) {
        colors[ci + v * 4]     = corners[v].r;
        colors[ci + v * 4 + 1] = corners[v].g;
        colors[ci + v * 4 + 2] = corners[v].b;
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

    const mat = vertexColorPbr('terrain-mat', this._scene, 0.92);
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
    if (!this._mesh || !this._map) return;
    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighbour = this._map.getTile(tile.x + dx, tile.y + dy);
        if (neighbour) this._paintCorners(rawColors, neighbour.x, neighbour.y);
      }
    }
    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }

  get heights(): HeightField | null {
    return this._heights;
  }

  private _paintCorners(rawColors: Float32Array | number[], x: number, y: number): void {
    if (!this._map) return;
    const corners = tileCornerColors(this._map, x, y);
    const ci = (y * this._mapWidth + x) * 16;
    for (let v = 0; v < 4; v++) {
      rawColors[ci + v * 4]     = corners[v].r;
      rawColors[ci + v * 4 + 1] = corners[v].g;
      rawColors[ci + v * 4 + 2] = corners[v].b;
      rawColors[ci + v * 4 + 3] = 1.0;
    }
  }
}
