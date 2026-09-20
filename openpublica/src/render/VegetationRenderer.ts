import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  InstancedMesh,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { roadHeading, roadNeighbors } from '../sim/roadConnections';
import { parkTreeSlots, streetTreeSlot, type TreeSlot } from './vegetationLayout';

interface PlantedTile {
  meshes: InstancedMesh[];
}

/**
 * Instanced trees for parks and quiet streets. Pickable false so tools
 * still hit the heightfield. Purely visual.
 */
export class VegetationRenderer {
  private readonly _shadows: ShadowGenerator | null;
  private readonly _trunkSrc: Mesh;
  private readonly _canopySrc: Mesh;
  private readonly _tiles = new Map<string, PlantedTile>();
  private _heights: HeightField | null = null;
  private _seq = 0;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._shadows = shadowGenerator;

    const trunkMat = new StandardMaterial('veg-trunk', scene);
    trunkMat.diffuseColor = new Color3(0.36, 0.22, 0.12);
    trunkMat.specularColor = new Color3(0.08, 0.08, 0.08);

    const canopyMat = new StandardMaterial('veg-canopy', scene);
    canopyMat.diffuseColor = new Color3(0.20, 0.46, 0.18);
    canopyMat.specularColor = new Color3(0.06, 0.08, 0.05);

    this._trunkSrc = MeshBuilder.CreateCylinder('veg-trunk-src', {
      diameter: 0.07,
      height: 0.22,
      tessellation: 6,
    }, scene);
    this._trunkSrc.material = trunkMat;
    this._trunkSrc.isVisible = false;
    this._trunkSrc.isPickable = false;
    this._shadows?.addShadowCaster(this._trunkSrc);

    this._canopySrc = MeshBuilder.CreateSphere('veg-canopy-src', {
      diameter: 0.32,
      segments: 7,
    }, scene);
    this._canopySrc.material = canopyMat;
    this._canopySrc.isVisible = false;
    this._canopySrc.isPickable = false;
    this._shadows?.addShadowCaster(this._canopySrc);
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  rebuild(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    for (const key of [...this._tiles.keys()]) this._clear(key);
    map.forEach((tile) => this._rebuildTile(map, tile.x, tile.y));
  }

  updateTile(map: CityMap, coord: TileCoord): void {
    this._rebuildTile(map, coord.x, coord.y);
  }

  updateAround(map: CityMap, coord: TileCoord): void {
    this._rebuildTile(map, coord.x, coord.y);
    this._rebuildTile(map, coord.x + 1, coord.y);
    this._rebuildTile(map, coord.x - 1, coord.y);
    this._rebuildTile(map, coord.x, coord.y + 1);
    this._rebuildTile(map, coord.x, coord.y - 1);
  }

  refreshStreets(map: CityMap): void {
    map.forEach((tile) => {
      if (tile.roadType === RoadType.Street) this._rebuildTile(map, tile.x, tile.y);
    });
  }

  private _rebuildTile(map: CityMap, x: number, y: number): void {
    const key = `${x},${y}`;
    this._clear(key);
    const tile = map.getTile(x, y);
    if (!tile) return;

    let slots: TreeSlot[] = [];
    if (tile.buildingId === 'small_park') {
      slots = parkTreeSlots(x, y);
    } else if (tile.roadType === RoadType.Street && tile.buildingId === null) {
      const heading = roadHeading(roadNeighbors(map, x, y));
      const slot = streetTreeSlot(x, y, tile.roadType, tile.trafficPressure, heading);
      if (slot) slots = [slot];
    }
    if (slots.length === 0) return;

    const groundY = this._heights?.tileCenter(x, y) ?? 0;
    const ox = x * TILE_SIZE + TILE_SIZE / 2;
    const oz = y * TILE_SIZE + TILE_SIZE / 2;
    const meshes: InstancedMesh[] = [];

    for (const slot of slots) {
      const trunk = this._trunkSrc.createInstance(`veg-t-${this._seq++}`);
      const canopy = this._canopySrc.createInstance(`veg-c-${this._seq++}`);
      const s = slot.scale;
      trunk.scaling.set(s, s, s);
      canopy.scaling.set(s, s * 0.9, s);
      trunk.position = new Vector3(ox + slot.dx, groundY + 0.11 * s, oz + slot.dz);
      canopy.position = new Vector3(ox + slot.dx, groundY + 0.28 * s, oz + slot.dz);
      trunk.isPickable = false;
      canopy.isPickable = false;
      trunk.receiveShadows = true;
      canopy.receiveShadows = true;
      meshes.push(trunk, canopy);
    }
    this._tiles.set(key, { meshes });
  }

  private _clear(key: string): void {
    const planted = this._tiles.get(key);
    if (!planted) return;
    for (const mesh of planted.meshes) mesh.dispose();
    this._tiles.delete(key);
  }
}
