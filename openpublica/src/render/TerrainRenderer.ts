import {
  Scene,
  Color3,
  Mesh,
  VertexData,
  VertexBuffer,
  ShadowGenerator,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType, ZoneType } from '../sim/CityTile';
import { averageColors, cityTileColor, isEmptyZonePlat, platCenterColor, tileCornerColors } from '../data/cityTileColors';
import { TILE_SIZE } from '../data/constants';
import {
  FAN_TRIANGLES,
  FAN_VERTS,
  HeightField,
  writeFanIndices,
  writeTileFan,
} from '../sim/HeightField';
import { vertexColorPbr } from './pbrSurfaces';
import { SKIRT_BASE_Y, skirtSegments } from './terrainSkirt';

/**
 * Terrain albedo scale. Until the smooth normals landed, the ground's normals
 * pointed down and the sun never lit it, so the palette was tuned to that dim
 * look; this keeps flat ground close to it while slopes now shade with the sun.
 */
export const TERRAIN_ALBEDO_SCALE = 0.42;

const SKIRT_EARTH_TOP = { r: 0.34, g: 0.26, b: 0.17 };
const SKIRT_EARTH_BASE = { r: 0.16, g: 0.12, b: 0.08 };
const SKIRT_WATER_TOP = { r: 0.06, g: 0.27, b: 0.38 };
const SKIRT_WATER_BASE = { r: 0.02, g: 0.08, b: 0.13 };

/** Name of the terrain mesh — used by TilePicker to identify hits. */
export const TERRAIN_MESH_NAME = 'terrain';

/**
 * Renders the city grid as a sloped heightfield with per-tile vertex colours.
 * One draw call. Each tile is a four-triangle fan: corners blend with their
 * neighbours, and a developed tile keeps its own colour at the centre. Normals
 * are shared across tiles so hills shade smoothly instead of showing the grid.
 */
export class TerrainRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private _mesh: Mesh | null = null;
  private _skirt: Mesh | null = null;
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

    const tileCount = map.width * map.height;
    const positions = new Float32Array(tileCount * FAN_VERTS * 3);
    const normals   = new Float32Array(tileCount * FAN_VERTS * 3);
    const colors    = new Float32Array(tileCount * FAN_VERTS * 4);
    const indices   = new Uint32Array(tileCount * FAN_TRIANGLES * 3);

    map.forEach((tile) => {
      const t = tile.y * map.width + tile.x;
      writeTileFan(positions, t * FAN_VERTS, tile.x, tile.y, TILE_SIZE, heights, 0);
      writeFanIndices(indices, t * FAN_TRIANGLES * 3, t * FAN_VERTS);
      this._writeNormals(normals, tile.x, tile.y);
      this._writeColors(colors, tile.x, tile.y);
    });

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals   = normals;
    vertexData.colors    = colors;
    vertexData.indices   = indices;

    // Its material goes too, or every reload leaves a terrain material behind.
    if (this._mesh) this._mesh.dispose(false, true);

    const mesh = new Mesh(TERRAIN_MESH_NAME, this._scene);
    vertexData.applyToMesh(mesh, true);

    const mat = vertexColorPbr('terrain-mat', this._scene, 0.92);
    mat.albedoColor = new Color3(TERRAIN_ALBEDO_SCALE, TERRAIN_ALBEDO_SCALE, TERRAIN_ALBEDO_SCALE);
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.receiveShadows = true;
    this._shadows?.addShadowCaster(mesh);

    this._mesh = mesh;
    this._buildSkirt();
  }

  /** Recolour mutated tiles and their neighbours with one buffer upload. */
  updateCityTiles(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    if (!this._mesh || !this._map || tiles.length === 0) return;
    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;
    const done = new Set<number>();
    for (const tile of tiles) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighbour = this._map.getTile(tile.x + dx, tile.y + dy);
          if (!neighbour) continue;
          const index = neighbour.y * this._map.width + neighbour.x;
          if (done.has(index)) continue;
          done.add(index);
          this._writeColors(rawColors, neighbour.x, neighbour.y);
        }
      }
    }
    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }

  /**
   * Re-read heights after the HeightField was re-graded. `moved` are the tiles
   * whose corners changed: their positions are rewritten, and normals one ring
   * further (a corner normal reads its neighbours). Omit it to redo the map.
   */
  refreshHeights(moved?: ReadonlyArray<{ x: number; y: number }>): void {
    if (!this._mesh || !this._map || !this._heights) return;
    const map = this._map;
    const heights = this._heights;
    const positions = this._mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = this._mesh.getVerticesData(VertexBuffer.NormalKind);
    if (!positions || !normals) return;

    const shifted: Array<{ x: number; y: number }> = [];
    if (moved) shifted.push(...moved);
    else map.forEach((tile) => shifted.push({ x: tile.x, y: tile.y }));
    const shaded = new Map<number, { x: number; y: number }>();
    let touchesEdge = !moved;
    for (const tile of shifted) {
      const t = tile.y * map.width + tile.x;
      writeTileFan(positions, t * FAN_VERTS, tile.x, tile.y, TILE_SIZE, heights, 0);
      if (tile.x === 0 || tile.y === 0 || tile.x === map.width - 1 || tile.y === map.height - 1) {
        touchesEdge = true;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tile.x + dx;
          const ny = tile.y + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          shaded.set(ny * map.width + nx, { x: nx, y: ny });
        }
      }
    }
    for (const tile of shaded.values()) this._writeNormals(normals, tile.x, tile.y);
    this._mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    this._mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    if (touchesEdge) this._buildSkirt();
  }

  get heights(): HeightField | null {
    return this._heights;
  }

  /**
   * Walls down the four map edges so the city is a solid block, not a sheet.
   * Not pickable; rebuilt whenever heights change (a road on the edge grades it).
   */
  private _buildSkirt(): void {
    if (!this._map || !this._heights) return;
    const segments = skirtSegments(this._map, this._heights);
    const positions = new Float32Array(segments.length * 4 * 3);
    const normals = new Float32Array(segments.length * 4 * 3);
    const colors = new Float32Array(segments.length * 4 * 4);
    const indices = new Uint32Array(segments.length * 6);
    segments.forEach((seg, i) => {
      const verts = [
        [seg.x0, seg.top0, seg.z0],
        [seg.x1, seg.top1, seg.z1],
        [seg.x0, SKIRT_BASE_Y, seg.z0],
        [seg.x1, SKIRT_BASE_Y, seg.z1],
      ];
      const topColor = seg.water ? SKIRT_WATER_TOP : SKIRT_EARTH_TOP;
      const baseColor = seg.water ? SKIRT_WATER_BASE : SKIRT_EARTH_BASE;
      verts.forEach((v, k) => {
        positions.set(v, (i * 4 + k) * 3);
        normals.set([seg.nx, 0, seg.nz], (i * 4 + k) * 3);
        const c = k < 2 ? topColor : baseColor;
        colors.set([c.r, c.g, c.b, 1], (i * 4 + k) * 4);
      });
      const b = i * 4;
      indices.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6);
    });
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.colors = colors;
    data.indices = indices;
    if (!this._skirt) {
      this._skirt = new Mesh('terrain-skirt', this._scene);
      const mat = vertexColorPbr('terrain-skirt-mat', this._scene, 0.96);
      mat.backFaceCulling = false;
      this._skirt.material = mat;
      this._skirt.isPickable = false;
      this._skirt.receiveShadows = true;
    }
    data.applyToMesh(this._skirt, true);
  }

  private _writeNormals(normals: Float32Array | number[], x: number, y: number): void {
    const heights = this._heights;
    if (!heights) return;
    const base = (y * this._mapWidth + x) * FAN_VERTS * 3;
    const fan = [
      heights.cornerNormal(x, y),
      heights.cornerNormal(x + 1, y),
      heights.cornerNormal(x, y + 1),
      heights.cornerNormal(x + 1, y + 1),
      heights.centerNormal(x, y),
    ];
    fan.forEach((n, v) => {
      normals[base + v * 3] = n[0];
      normals[base + v * 3 + 1] = n[1];
      normals[base + v * 3 + 2] = n[2];
    });
  }

  private _writeColors(rawColors: Float32Array | number[], x: number, y: number): void {
    if (!this._map) return;
    const tile = this._map.getTile(x, y);
    if (!tile) return;
    const corners = tileCornerColors(this._map, x, y);
    // Developed tiles keep their own colour at the centre so lots and roads
    // read crisply; open ground blends so the grass shows no grid.
    const open = tile.zoneType === ZoneType.None && tile.roadType === RoadType.None && tile.buildingId === null;
    const center = isEmptyZonePlat(tile) ? platCenterColor(tile) : open ? averageColors(corners) : cityTileColor(tile);
    const fan = [...corners, center];
    const ci = (y * this._mapWidth + x) * FAN_VERTS * 4;
    fan.forEach((c, v) => {
      rawColors[ci + v * 4]     = c.r;
      rawColors[ci + v * 4 + 1] = c.g;
      rawColors[ci + v * 4 + 2] = c.b;
      rawColors[ci + v * 4 + 3] = 1.0;
    });
  }
}
