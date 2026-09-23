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
import {
  FAN_TRIANGLES,
  FAN_VERTS,
  HeightField,
  writeFanIndices,
  writeTileFan,
} from '../sim/HeightField';
import type { CityTile } from '../sim/CityTile';
import { isBridge } from '../sim/roadConnections';
import { colorForOverlay, type OverlayMode } from './overlayColors';
import { deckBaseHeight } from './roadDeck';

/**
 * Sit above extruded road decks (lift 0.03 + ~0.07 thickness) so traffic /
 * pollution tints are not buried under asphalt.
 */
const OVERLAY_LIFT = 0.14;

/**
 * One height-sampled overlay mesh. Modes are exclusive — inspect stays the
 * numeric source of truth.
 */
export class OverlayRenderer {
  private readonly _scene: Scene;
  private _mesh: Mesh | null = null;
  private _mode: OverlayMode | null = null;
  private _heights: HeightField | null = null;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  get mode(): OverlayMode | null {
    return this._mode;
  }

  isMode(mode: OverlayMode): boolean {
    return this._mode === mode;
  }

  get isVisible(): boolean {
    return this._mode !== null;
  }

  build(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    const tileCount = map.width * map.height;
    const positions = new Float32Array(tileCount * FAN_VERTS * 3);
    const normals   = new Float32Array(tileCount * FAN_VERTS * 3);
    const colors    = new Float32Array(tileCount * FAN_VERTS * 4);
    const indices   = new Uint32Array(tileCount * FAN_TRIANGLES * 3);

    map.forEach((tile) => {
      const t = tile.y * map.width + tile.x;
      this._writeQuad(positions, t * FAN_VERTS, map, tile, heights);
      this._writeColor(colors, t * FAN_VERTS * 4, tile);
      writeFanIndices(indices, t * FAN_TRIANGLES * 3, t * FAN_VERTS);
    });

    VertexData.ComputeNormals(positions, indices, normals);

    if (this._mesh) this._mesh.dispose();

    const mesh = new Mesh('city-overlay', this._scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals   = normals;
    vd.colors    = colors;
    vd.indices   = indices;
    vd.applyToMesh(mesh, true);

    const mat = new StandardMaterial('city-overlay-mat', this._scene);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.hasVertexAlpha = true;
    mesh.useVertexColors = true;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.isVisible = this._mode !== null;

    this._mesh = mesh;
  }

  setMode(mode: OverlayMode | null, map?: CityMap): void {
    this._mode = mode;
    if (this._mesh) this._mesh.isVisible = mode !== null;
    if (mode && map) this.refresh(map);
  }

  refresh(map: CityMap): void {
    if (!this._mesh || !this._mode) return;
    const rawColors = this._mesh.getVerticesData(VertexBuffer.ColorKind);
    if (!rawColors) return;
    map.forEach((tile) => {
      this._writeColor(rawColors, (tile.y * map.width + tile.x) * FAN_VERTS * 4, tile);
    });
    this._mesh.updateVerticesData(VertexBuffer.ColorKind, rawColors);
  }

  /**
   * Re-seat these tiles after a road edit or re-grade: bridge tiles float at
   * deck height so their tint is not under the water, graded ground moves.
   */
  updateTiles(map: CityMap, coords: ReadonlyArray<{ x: number; y: number }>): void {
    if (!this._mesh || !this._heights) return;
    const positions = this._mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) return;
    for (const coord of coords) {
      const tile = map.getTile(coord.x, coord.y);
      if (!tile) continue;
      this._writeQuad(positions, (tile.y * map.width + tile.x) * FAN_VERTS, map, tile, this._heights);
    }
    // Normals stay from build(): the tint barely shades, and recomputing the
    // whole map's normals on every painted tile is the costly part.
    this._mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  }

  /** Rebuild heights after load without dropping the selected mode. */
  rebuild(map: CityMap, heights: HeightField): void {
    const mode = this._mode;
    this.build(map, heights);
    this.setMode(mode, map);
  }

  private _writeQuad(
    positions: Float32Array | number[],
    vertexIndex: number,
    map: CityMap,
    tile: CityTile,
    heights: HeightField,
  ): void {
    if (!isBridge(tile)) {
      writeTileFan(positions, vertexIndex, tile.x, tile.y, TILE_SIZE * TILE_FILL, heights, OVERLAY_LIFT);
      return;
    }
    const y = deckBaseHeight(map, heights, tile.x, tile.y) + OVERLAY_LIFT;
    const x0 = tile.x * TILE_SIZE;
    const z0 = tile.y * TILE_SIZE;
    const span = TILE_SIZE * TILE_FILL;
    const corners = [[x0, z0], [x0 + span, z0], [x0, z0 + span], [x0 + span, z0 + span], [x0 + span / 2, z0 + span / 2]];
    for (let v = 0; v < FAN_VERTS; v++) {
      const p = (vertexIndex + v) * 3;
      positions[p] = corners[v][0];
      positions[p + 1] = y;
      positions[p + 2] = corners[v][1];
    }
  }

  private _writeColor(colors: Float32Array | number[], ci: number, tile: CityTile): void {
    const c = this._mode ? colorForOverlay(this._mode, tile) : { r: 0, g: 0, b: 0, a: 0 };
    for (let v = 0; v < FAN_VERTS; v++) {
      colors[ci + v * 4]     = c.r;
      colors[ci + v * 4 + 1] = c.g;
      colors[ci + v * 4 + 2] = c.b;
      colors[ci + v * 4 + 3] = c.a;
    }
  }
}
