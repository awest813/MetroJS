import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  VertexBuffer,
} from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';
import { daylightPalette, type Rgb } from './skyColors';

/**
 * Inverted sphere behind the city. Vertex colours lerp horizon → zenith.
 * Unlit so the sun slider can recolour it without a second lighting model.
 */
export class SkyDome {
  private readonly _mesh: Mesh;
  private readonly _lift: Float32Array;
  private readonly _colors: Float32Array;

  constructor(scene: Scene) {
    this._mesh = MeshBuilder.CreateSphere(
      'sky-dome',
      { diameter: MAP_SIZE * 12, segments: 20, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    this._mesh.infiniteDistance = true;
    this._mesh.isPickable = false;
    this._mesh.applyFog = false;
    this._mesh.ignoreCameraMaxZ = true;

    const mat = new StandardMaterial('sky-dome-mat', scene);
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White();
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    this._mesh.material = mat;
    this._mesh.useVertexColors = true;

    const positions = this._mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) {
      this._lift = new Float32Array(0);
      this._colors = new Float32Array(0);
      return;
    }
    const count = positions.length / 3;
    this._lift = new Float32Array(count);
    this._colors = new Float32Array(count * 4);
    const radius = (MAP_SIZE * 12) / 2;
    for (let i = 0; i < count; i++) {
      const y = positions[i * 3 + 1] / radius;
      this._lift[i] = Math.max(0, Math.min(1, (y + 0.15) / 1.15));
      this._colors[i * 4 + 3] = 1;
    }
    this._mesh.setVerticesData(VertexBuffer.ColorKind, this._colors, true);
    const pal = daylightPalette(0.5);
    this.setSky(pal.zenith, pal.horizon);
  }

  setSky(zenith: Rgb, horizon: Rgb): void {
    for (let i = 0; i < this._lift.length; i++) {
      const t = this._lift[i] * this._lift[i];
      this._colors[i * 4]     = horizon.r + (zenith.r - horizon.r) * t;
      this._colors[i * 4 + 1] = horizon.g + (zenith.g - horizon.g) * t;
      this._colors[i * 4 + 2] = horizon.b + (zenith.b - horizon.b) * t;
    }
    this._mesh.updateVerticesData(VertexBuffer.ColorKind, this._colors);
  }
}
