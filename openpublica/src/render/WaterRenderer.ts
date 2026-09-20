import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
} from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';
import { WATER_SURFACE_Y } from '../sim/HeightField';

export const WATER_MESH_NAME = 'water';

/**
 * Translucent water plane. Basins in the heightfield sit below this Y,
 * so water is only visible in lakes and rivers.
 */
export class WaterRenderer {
  private readonly _mesh: Mesh;

  constructor(scene: Scene) {
    this._mesh = MeshBuilder.CreateGround(
      WATER_MESH_NAME,
      { width: MAP_SIZE, height: MAP_SIZE },
      scene,
    );
    this._mesh.position = new Vector3(MAP_SIZE / 2, WATER_SURFACE_Y, MAP_SIZE / 2);
    this._mesh.receiveShadows = true;
    this._mesh.isPickable = false;

    const mat = new StandardMaterial('water-mat', scene);
    mat.diffuseColor = new Color3(0.08, 0.42, 0.62);
    mat.specularColor = new Color3(0.70, 0.85, 0.95);
    mat.emissiveColor = new Color3(0.03, 0.08, 0.12);
    mat.alpha = 0.66;
    mat.backFaceCulling = false;
    this._mesh.material = mat;
  }
}
