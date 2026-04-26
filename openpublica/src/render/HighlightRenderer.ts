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

/**
 * Renders a semi-transparent yellow highlight over the currently selected tile.
 * The mesh is not pickable so it does not interfere with TilePicker ray casts.
 */
export class HighlightRenderer {
  private readonly _mesh: Mesh;

  constructor(scene: Scene) {
    this._mesh = MeshBuilder.CreateGround(
      'highlight',
      { width: TILE_SIZE * TILE_FILL, height: TILE_SIZE * TILE_FILL },
      scene,
    );
    this._mesh.position = new Vector3(0, 0.005, 0); // tiny Y offset avoids z-fighting
    this._mesh.isPickable = false;
    this._mesh.isVisible = false;

    const mat = new StandardMaterial('highlight-mat', scene);
    mat.diffuseColor = new Color3(1.0, 0.95, 0.1);
    mat.emissiveColor = new Color3(0.4, 0.35, 0.0);
    mat.alpha = 0.55;
    mat.backFaceCulling = false;
    this._mesh.material = mat;
  }

  /** Move the highlight to the given tile and make it visible. */
  show(coord: TileCoord): void {
    this._mesh.position.x = coord.x * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.position.z = coord.y * TILE_SIZE + (TILE_SIZE * TILE_FILL) / 2;
    this._mesh.isVisible = true;
  }

  hide(): void {
    this._mesh.isVisible = false;
  }
}
