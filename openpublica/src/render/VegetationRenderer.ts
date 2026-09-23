import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  InstancedMesh,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType, TerrainType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import { WATER_SURFACE_Y, type HeightField } from '../sim/HeightField';
import { roadHeading, roadNeighbors } from '../sim/roadConnections';
import { connectedCardinals } from './roadLayout';
import { drySlots, parkTreeSlots, streetTreeSlot, type TreeSlot } from './vegetationLayout';
import { coloredPbr } from './pbrSurfaces';

interface PlantedTile {
  meshes: InstancedMesh[];
  /** Slot signature; a refresh that yields the same one leaves the trees alone. */
  sig: string;
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
  private _streetTrees = true;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._shadows = shadowGenerator;

    const trunkMat = coloredPbr('veg-trunk', scene, new Color3(0.28, 0.16, 0.08), 0.88);
    const canopyMat = coloredPbr('veg-canopy', scene, new Color3(0.10, 0.32, 0.12), 0.90);

    this._trunkSrc = MeshBuilder.CreateCylinder('veg-trunk-src', {
      diameter: 0.09,
      height: 0.36,
      tessellation: 7,
    }, scene);
    this._trunkSrc.material = trunkMat;
    this._trunkSrc.isVisible = false;
    this._trunkSrc.isPickable = false;
    this._shadows?.addShadowCaster(this._trunkSrc);

    this._canopySrc = MeshBuilder.CreateSphere('veg-canopy-src', {
      diameter: 0.56,
      segments: 8,
    }, scene);
    this._canopySrc.material = canopyMat;
    this._canopySrc.isVisible = false;
    this._canopySrc.isPickable = false;
    this._shadows?.addShadowCaster(this._canopySrc);
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  setStreetTrees(on: boolean): boolean {
    if (this._streetTrees === on) return false;
    this._streetTrees = on;
    return true;
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

  /**
   * Re-check street trees after traffic changes (busy streets lose theirs).
   * Tiles whose tree slots did not change keep their instances.
   */
  refreshStreets(map: CityMap): void {
    map.forEach((tile) => {
      if (tile.roadType === RoadType.Street) this._rebuildTile(map, tile.x, tile.y, false);
    });
  }

  private _rebuildTile(map: CityMap, x: number, y: number, force = true): void {
    const key = `${x},${y}`;
    const ox = x * TILE_SIZE + TILE_SIZE / 2;
    const oz = y * TILE_SIZE + TILE_SIZE / 2;
    const heights = this._heights;
    const groundAt = (slot: TreeSlot): number =>
      heights ? heights.sample(ox + slot.dx, oz + slot.dz) : 0;
    const slots = drySlots(this._slotsFor(map, x, y), groundAt, WATER_SURFACE_Y);
    const sig = slots.map((s) => `${s.dx.toFixed(3)}:${s.dz.toFixed(3)}:${s.scale.toFixed(3)}`).join('|');
    if (!force && (this._tiles.get(key)?.sig ?? '') === sig) return;
    this._clear(key);
    if (slots.length === 0) return;

    const meshes: InstancedMesh[] = [];

    for (const slot of slots) {
      const groundY = groundAt(slot);
      const trunk = this._trunkSrc.createInstance(`veg-t-${this._seq++}`);
      const canopy = this._canopySrc.createInstance(`veg-c-${this._seq++}`);
      const canopy2 = this._canopySrc.createInstance(`veg-c2-${this._seq++}`);
      const s = slot.scale;
      trunk.scaling.set(s, s, s);
      canopy.scaling.set(s * 1.05, s * 0.72, s * 1.05);
      canopy2.scaling.set(s * 0.72, s * 0.55, s * 0.72);
      trunk.position = new Vector3(ox + slot.dx, groundY + 0.18 * s, oz + slot.dz);
      canopy.position = new Vector3(ox + slot.dx, groundY + 0.42 * s, oz + slot.dz);
      canopy2.position = new Vector3(ox + slot.dx + 0.06 * s, groundY + 0.50 * s, oz + slot.dz + 0.04 * s);
      trunk.isPickable = false;
      canopy.isPickable = false;
      canopy2.isPickable = false;
      trunk.receiveShadows = true;
      canopy.receiveShadows = true;
      canopy2.receiveShadows = true;
      meshes.push(trunk, canopy, canopy2);
    }
    this._tiles.set(key, { meshes, sig });
  }

  /** Park trees, or one curb tree on a quiet land street. Bridges get none. */
  private _slotsFor(map: CityMap, x: number, y: number): TreeSlot[] {
    const tile = map.getTile(x, y);
    if (!tile) return [];
    if (tile.buildingId === 'small_park') return parkTreeSlots(x, y);
    if (
      this._streetTrees &&
      tile.roadType === RoadType.Street &&
      tile.terrain !== TerrainType.Water &&
      tile.buildingId === null
    ) {
      const nbrs = roadNeighbors(map, x, y);
      const heading = roadHeading(nbrs);
      const slot = streetTreeSlot(
        x, y, tile.roadType, tile.trafficPressure, heading,
        connectedCardinals(nbrs).length,
      );
      if (slot) return [slot];
    }
    return [];
  }

  private _clear(key: string): void {
    const planted = this._tiles.get(key);
    if (!planted) return;
    for (const mesh of planted.meshes) mesh.dispose();
    this._tiles.delete(key);
  }
}
