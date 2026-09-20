import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  TransformNode,
  ShadowGenerator,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { roadNeighbors, roadProfile } from '../sim/roadConnections';

/** Extra Y so the deck sits on the heightfield without z-fighting. */
export const ROAD_DECK_LIFT = 0.03;

/**
 * Extruded road / trolley meshes. One transform root per road tile; shared
 * materials. Not pickable — tile picking stays on the terrain heightfield.
 */
export class RoadRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private readonly _roots = new Map<string, TransformNode>();
  private readonly _streetMat: StandardMaterial;
  private readonly _highwayMat: StandardMaterial;
  private readonly _trolleyMat: StandardMaterial;
  private readonly _railMat: StandardMaterial;
  private readonly _curbMat: StandardMaterial;
  private _heights: HeightField | null = null;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;

    this._streetMat = this._mat('road-street', new Color3(0.38, 0.39, 0.41), new Color3(0.12, 0.12, 0.12));
    this._highwayMat = this._mat('road-highway', new Color3(0.22, 0.23, 0.25), new Color3(0.08, 0.08, 0.08));
    this._trolleyMat = this._mat('road-trolley', new Color3(0.62, 0.34, 0.18), new Color3(0.18, 0.08, 0.04));
    this._railMat = this._mat('road-rail', new Color3(0.55, 0.58, 0.62), new Color3(0.45, 0.45, 0.48));
    this._railMat.emissiveColor = new Color3(0.04, 0.04, 0.05);
    this._curbMat = this._mat('road-curb', new Color3(0.50, 0.50, 0.48), new Color3(0.06, 0.06, 0.06));
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  /** Rebuild every road tile from the map. */
  rebuild(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    for (const root of this._roots.values()) root.dispose();
    this._roots.clear();
    map.forEach((tile) => {
      if (tile.roadType !== RoadType.None) this._rebuildTile(map, tile.x, tile.y);
    });
  }

  /** Rebuild this tile and its four neighbours (connectivity changed). */
  updateAround(map: CityMap, coord: TileCoord): void {
    this._rebuildTile(map, coord.x, coord.y);
    this._rebuildTile(map, coord.x + 1, coord.y);
    this._rebuildTile(map, coord.x - 1, coord.y);
    this._rebuildTile(map, coord.x, coord.y + 1);
    this._rebuildTile(map, coord.x, coord.y - 1);
  }

  private _rebuildTile(map: CityMap, x: number, y: number): void {
    const key = `${x},${y}`;
    const prev = this._roots.get(key);
    if (prev) {
      prev.dispose();
      this._roots.delete(key);
    }

    const tile = map.getTile(x, y);
    if (!tile || tile.roadType === RoadType.None) return;

    const heights = this._heights;
    const groundY = (heights?.tileCenter(x, y) ?? 0) + ROAD_DECK_LIFT;
    const profile = roadProfile(tile.roadType);
    const neighbors = roadNeighbors(map, x, y);
    const cx = x * TILE_SIZE + TILE_SIZE / 2;
    const cz = y * TILE_SIZE + TILE_SIZE / 2;
    const deckMat = this._deckMaterial(tile.roadType);

    const root = new TransformNode(`road-${key}`, this._scene);
    this._roots.set(key, root);

    const curbW = profile.width + 0.08;
    this._box(root, `curb-${key}`, curbW, profile.thickness * 0.55, curbW, cx, groundY + profile.thickness * 0.2, cz, this._curbMat);

    const isolated = !neighbors.n && !neighbors.e && !neighbors.s && !neighbors.w;
    this._box(
      root,
      `pad-${key}`,
      profile.width,
      profile.thickness,
      profile.width,
      cx,
      groundY + profile.thickness / 2,
      cz,
      deckMat,
    );

    const armLen = isolated ? 0 : TILE_SIZE * 0.52;
    const armY = groundY + profile.thickness / 2;
    if (neighbors.n) {
      this._box(root, `arm-n-${key}`, profile.width, profile.thickness, armLen, cx, armY, cz + armLen / 2, deckMat);
    }
    if (neighbors.s) {
      this._box(root, `arm-s-${key}`, profile.width, profile.thickness, armLen, cx, armY, cz - armLen / 2, deckMat);
    }
    if (neighbors.e) {
      this._box(root, `arm-e-${key}`, armLen, profile.thickness, profile.width, cx + armLen / 2, armY, cz, deckMat);
    }
    if (neighbors.w) {
      this._box(root, `arm-w-${key}`, armLen, profile.thickness, profile.width, cx - armLen / 2, armY, cz, deckMat);
    }

    if (tile.roadType === RoadType.TrolleyAvenue) {
      this._addRails(root, key, cx, cz, groundY + profile.thickness, neighbors, isolated);
    }
  }

  private _addRails(
    root: TransformNode,
    key: string,
    cx: number,
    cz: number,
    y: number,
    neighbors: ReturnType<typeof roadNeighbors>,
    isolated: boolean,
  ): void {
    const ns = neighbors.n || neighbors.s || isolated;
    const ew = neighbors.e || neighbors.w;
    const railW = 0.035;
    const railH = 0.028;
    const gauge = 0.11;
    const len = TILE_SIZE * 0.92;

    if (ns) {
      this._box(root, `rail-ns-a-${key}`, railW, railH, len, cx - gauge, y + railH / 2, cz, this._railMat);
      this._box(root, `rail-ns-b-${key}`, railW, railH, len, cx + gauge, y + railH / 2, cz, this._railMat);
    }
    if (ew) {
      this._box(root, `rail-ew-a-${key}`, len, railH, railW, cx, y + railH / 2, cz - gauge, this._railMat);
      this._box(root, `rail-ew-b-${key}`, len, railH, railW, cx, y + railH / 2, cz + gauge, this._railMat);
    }
  }

  private _box(
    parent: TransformNode,
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: StandardMaterial,
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this._scene);
    mesh.position = new Vector3(x, y, z);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this._shadows?.addShadowCaster(mesh);
    return mesh;
  }

  private _deckMaterial(type: RoadType): StandardMaterial {
    if (type === RoadType.Highway) return this._highwayMat;
    if (type === RoadType.TrolleyAvenue) return this._trolleyMat;
    return this._streetMat;
  }

  private _mat(name: string, diffuse: Color3, specular: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, this._scene);
    mat.diffuseColor = diffuse;
    mat.specularColor = specular;
    mat.ambientColor = new Color3(0.25, 0.25, 0.25);
    return mat;
  }
}
