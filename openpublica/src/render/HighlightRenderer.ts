import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
} from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { TILE_SIZE, TILE_FILL } from '../data/constants';
import type { HeightField } from '../sim/HeightField';

/**
 * Tile cursor plus a translucent coverage disc for civic/utility tools.
 */
export class HighlightRenderer {
  private readonly _mesh: Mesh;
  private readonly _cover: Mesh;
  private readonly _coverMat: StandardMaterial;

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
    mat.diffuseColor = new Color3(1.0, 0.95, 0.1);
    mat.emissiveColor = new Color3(0.4, 0.35, 0.0);
    mat.alpha = 0.55;
    mat.backFaceCulling = false;
    this._mesh.material = mat;

    this._cover = MeshBuilder.CreateGround(
      'service-cover',
      { width: 1, height: 1 },
      scene,
    );
    this._cover.isPickable = false;
    this._cover.isVisible = false;
    this._coverMat = new StandardMaterial('service-cover-mat', scene);
    this._coverMat.alpha = 0.18;
    this._coverMat.backFaceCulling = false;
    this._coverMat.disableLighting = true;
    this._cover.material = this._coverMat;
  }

  /** Move the highlight to the given tile and make it visible. */
  show(coord: TileCoord, heights?: HeightField | null): void {
    this._mesh.position.x = coord.x * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.position.z = coord.y * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.position.y = (heights?.tileCenter(coord.x, coord.y) ?? 0) + 0.02;
    this._mesh.isVisible = true;
  }

  showCoverage(
    coord: TileCoord,
    radiusTiles: number,
    rgb: { r: number; g: number; b: number },
    heights?: HeightField | null,
  ): void {
    if (radiusTiles <= 0) {
      this.hideCoverage();
      return;
    }
    const diameter = Math.max(1, radiusTiles * 2);
    this._cover.scaling.x = diameter;
    this._cover.scaling.z = diameter;
    this._cover.position.x = coord.x * TILE_SIZE + TILE_SIZE / 2;
    this._cover.position.z = coord.y * TILE_SIZE + TILE_SIZE / 2;
    this._cover.position.y = (heights?.tileCenter(coord.x, coord.y) ?? 0) + 0.015;
    this._coverMat.emissiveColor = new Color3(rgb.r, rgb.g, rgb.b);
    this._coverMat.diffuseColor = new Color3(rgb.r, rgb.g, rgb.b);
    this._cover.isVisible = true;
  }

  hide(): void {
    this._mesh.isVisible = false;
  }

  hideCoverage(): void {
    this._cover.isVisible = false;
  }
}
