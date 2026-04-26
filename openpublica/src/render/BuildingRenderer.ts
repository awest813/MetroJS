import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
} from '@babylonjs/core';
import type { BuildingInstance } from '../sim/BuildingInstance';
import { ZoneType } from '../sim/CityTile';
import { TILE_SIZE } from '../data/constants';

// ── Visual shape config per building def ID ───────────────────────────────────

interface BuildingShape {
  width:  number;
  depth:  number;
  height: number;
}

/**
 * Per-def visual dimensions.
 * These are render-only values; no simulation data lives here.
 */
const BUILDING_SHAPES: Record<string, BuildingShape> = {
  small_house:    { width: 0.50, depth: 0.50, height: 0.40 },
  rowhouse:       { width: 0.70, depth: 0.45, height: 0.55 },
  small_shop:     { width: 0.65, depth: 0.65, height: 0.35 },
  light_workshop: { width: 0.75, depth: 0.75, height: 0.50 },
};

const DEFAULT_SHAPE: BuildingShape = { width: 0.50, depth: 0.50, height: 0.40 };

// ── Metadata stored on each mesh for picking ──────────────────────────────────

/** Data stored in `mesh.metadata` — only render-safe ids, never sim objects. */
export interface BuildingPickData {
  readonly buildingId: string;
  readonly x:          number;
  readonly y:          number;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders one Box mesh per placed building.
 *
 * Design:
 * - Three shared `StandardMaterial`s (one per zone type) → minimal draw-state changes.
 * - Meshes are stored in a `Map<"x,y", Mesh>`.
 * - Selection is shown by toggling `mesh.showBoundingBox`; the bounding-box renderer
 *   is styled once in the constructor.
 * - No simulation data is stored inside meshes — only the opaque `buildingId` string.
 */
export class BuildingRenderer {
  private readonly _scene:    Scene;
  private readonly _meshes:   Map<string, Mesh> = new Map();
  private readonly _materials: Record<ZoneType, StandardMaterial>;
  private _selectedKey: string | null = null;

  constructor(scene: Scene) {
    this._scene = scene;

    // Shared materials — one per zone type.
    this._materials = {
      [ZoneType.None]:        this._makeMaterial('bld-none',  new Color3(0.60, 0.60, 0.60)),
      [ZoneType.Residential]: this._makeMaterial('bld-res',   new Color3(0.40, 0.60, 0.90)),
      [ZoneType.Commercial]:  this._makeMaterial('bld-com',   new Color3(0.92, 0.78, 0.20)),
      [ZoneType.Industrial]:  this._makeMaterial('bld-ind',   new Color3(0.68, 0.48, 0.78)),
    };

    // Style the bounding-box renderer used for selection highlights.
    const bbr = scene.getBoundingBoxRenderer();
    bbr.frontColor = new Color3(1.0, 0.95, 0.1);
    bbr.backColor  = new Color3(0.7, 0.65, 0.05);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Spawn a mesh for the given building instance.
   * Safe to call multiple times for the same tile — the old mesh is replaced.
   */
  addBuilding(instance: BuildingInstance, zoneType: ZoneType): void {
    // Remove any prior mesh on this tile.
    this.removeBuilding(instance.x, instance.y);

    const key   = _tileKey(instance.x, instance.y);
    const shape = BUILDING_SHAPES[instance.defId] ?? DEFAULT_SHAPE;

    const mesh = MeshBuilder.CreateBox(
      `building-${key}`,
      { width: shape.width, height: shape.height, depth: shape.depth },
      this._scene,
    );

    // Center the footprint within the tile, sit the base on Y=0.
    mesh.position = new Vector3(
      instance.x * TILE_SIZE + TILE_SIZE / 2,
      shape.height / 2,
      instance.y * TILE_SIZE + TILE_SIZE / 2,
    );

    mesh.material = this._materials[zoneType] ?? this._materials[ZoneType.None];

    // Store only picking metadata — no live sim references.
    const pickData: BuildingPickData = { buildingId: instance.defId, x: instance.x, y: instance.y };
    mesh.metadata = pickData;

    this._meshes.set(key, mesh);
  }

  /**
   * Dispose the mesh for the building at (x, y), if one exists.
   * Called when a tile is bulldozed.
   */
  removeBuilding(x: number, y: number): void {
    const key  = _tileKey(x, y);
    const mesh = this._meshes.get(key);
    if (!mesh) return;

    if (this._selectedKey === key) this._selectedKey = null;
    mesh.dispose();
    this._meshes.delete(key);
  }

  /**
   * Highlight the building mesh at (x, y) as selected.
   * Returns the `BuildingPickData` stored on the mesh, or null if no building is there.
   */
  selectBuilding(x: number, y: number): BuildingPickData | null {
    this.clearSelection();

    const key  = _tileKey(x, y);
    const mesh = this._meshes.get(key);
    if (!mesh) return null;

    mesh.showBoundingBox = true;
    this._selectedKey    = key;

    return mesh.metadata as BuildingPickData;
  }

  /** Remove the selection highlight from the currently selected building, if any. */
  clearSelection(): void {
    if (this._selectedKey !== null) {
      const prev = this._meshes.get(this._selectedKey);
      if (prev) prev.showBoundingBox = false;
      this._selectedKey = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _makeMaterial(name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, this._scene);
    mat.diffuseColor  = color;
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    return mat;
  }
}

// ── Module-level helper (no closure state) ────────────────────────────────────

function _tileKey(x: number, y: number): string {
  return `${x},${y}`;
}
