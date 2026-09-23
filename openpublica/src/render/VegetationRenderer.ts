import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType, TerrainType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import { WATER_SURFACE_Y, type HeightField } from '../sim/HeightField';
import { roadHeading, roadNeighbors } from '../sim/roadConnections';
import { connectedCardinals } from './roadLayout';
import {
  STREET_TREE_BUSY_PRESSURE,
  drySlots,
  parkTreeSlots,
  streetTreeSlot,
  type TreeSlot,
} from './vegetationLayout';
import { coloredPbr } from './pbrSurfaces';
import { ThinInstanceGroups } from './thinInstanceGroups';

/**
 * Trees for parks and quiet streets, as thin instances of one trunk and one
 * canopy. Pickable false so tools still hit the heightfield. Purely visual.
 */
export class VegetationRenderer {
  private readonly _shadows: ShadowGenerator | null;
  private readonly _trunkSrc: Mesh;
  private readonly _canopySrc: Mesh;
  private readonly _trees = new ThinInstanceGroups();
  /** Slot signature per planted tile; a refresh that yields the same one leaves the trees alone. */
  private readonly _sigs = new Map<string, string>();
  /** Whether each street was busy when last planted; traffic only matters when this flips. */
  private readonly _busy = new Map<string, boolean>();
  private _heights: HeightField | null = null;
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
    this._trunkSrc.isPickable = false;
    this._trunkSrc.receiveShadows = true;
    ThinInstanceGroups.prepare(this._trunkSrc);
    this._shadows?.addShadowCaster(this._trunkSrc);

    this._canopySrc = MeshBuilder.CreateSphere('veg-canopy-src', {
      diameter: 0.56,
      segments: 8,
    }, scene);
    this._canopySrc.material = canopyMat;
    this._canopySrc.isPickable = false;
    this._canopySrc.receiveShadows = true;
    ThinInstanceGroups.prepare(this._canopySrc);
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
    this._trees.clearAll();
    this._sigs.clear();
    this._busy.clear();
    map.forEach((tile) => this._rebuildTile(map, tile.x, tile.y));
    this._trees.flush();
  }

  updateTile(map: CityMap, coord: TileCoord): void {
    this.updateTiles(map, [coord]);
  }

  /** Re-plant these tiles, e.g. after the ground under them was re-graded. */
  updateTiles(map: CityMap, coords: ReadonlyArray<TileCoord>): void {
    for (const coord of coords) this._rebuildTile(map, coord.x, coord.y);
    this._trees.flush();
  }

  updateAround(map: CityMap, coord: TileCoord): void {
    this.updateTiles(map, [
      coord,
      { x: coord.x + 1, y: coord.y },
      { x: coord.x - 1, y: coord.y },
      { x: coord.x, y: coord.y + 1 },
      { x: coord.x, y: coord.y - 1 },
    ]);
  }

  /**
   * Re-check street trees after traffic changes (busy streets lose theirs).
   * Tiles whose tree slots did not change keep their instances.
   */
  refreshStreets(map: CityMap): void {
    map.forEach((tile) => {
      if (tile.roadType !== RoadType.Street) return;
      const busy = tile.trafficPressure >= STREET_TREE_BUSY_PRESSURE;
      if (this._busy.get(`${tile.x},${tile.y}`) === busy) return;
      this._rebuildTile(map, tile.x, tile.y, false);
    });
    this._trees.flush();
  }

  private _rebuildTile(map: CityMap, x: number, y: number, force = true): void {
    const key = `${x},${y}`;
    const tile = map.getTile(x, y);
    if (tile?.roadType === RoadType.Street) this._busy.set(key, tile.trafficPressure >= STREET_TREE_BUSY_PRESSURE);
    else this._busy.delete(key);
    const ox = x * TILE_SIZE + TILE_SIZE / 2;
    const oz = y * TILE_SIZE + TILE_SIZE / 2;
    const heights = this._heights;
    const groundAt = (slot: TreeSlot): number =>
      heights ? heights.sample(ox + slot.dx, oz + slot.dz) : 0;
    const slots = drySlots(this._slotsFor(map, x, y), groundAt, WATER_SURFACE_Y);
    const sig = slots.map((s) => `${s.dx.toFixed(3)}:${s.dz.toFixed(3)}:${s.scale.toFixed(3)}`).join('|');
    if (!force && (this._sigs.get(key) ?? '') === sig) return;
    this._trees.clear(key);
    this._sigs.delete(key);
    if (slots.length === 0) return;

    for (const slot of slots) {
      const groundY = groundAt(slot);
      const s = slot.scale;
      this._trees.add(key, this._trunkSrc,
        new Vector3(ox + slot.dx, groundY + 0.18 * s, oz + slot.dz), new Vector3(s, s, s));
      this._trees.add(key, this._canopySrc,
        new Vector3(ox + slot.dx, groundY + 0.42 * s, oz + slot.dz), new Vector3(s * 1.05, s * 0.72, s * 1.05));
      this._trees.add(key, this._canopySrc,
        new Vector3(ox + slot.dx + 0.06 * s, groundY + 0.50 * s, oz + slot.dz + 0.04 * s),
        new Vector3(s * 0.72, s * 0.55, s * 0.72));
    }
    this._sigs.set(key, sig);
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
        connectedCardinals(nbrs).length, nbrs,
      );
      if (slot) return [slot];
    }
    return [];
  }
}
