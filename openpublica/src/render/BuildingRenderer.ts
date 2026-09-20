import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  VertexBuffer,
  InstancedMesh,
} from '@babylonjs/core';
import type { BuildingInstance } from '../sim/BuildingInstance';
import { ZoneType } from '../sim/CityTile';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import {
  BUILDING_SHAPES,
  DEFAULT_SHAPE,
  SERVICE_DEF_IDS,
  SKIP_MESH_DEF_IDS,
  kitForDef,
  kitPalette,
  type BuildingKit,
  type KitPart,
  type KitPalette,
} from './buildingVisuals';

/** Data stored in `mesh.metadata` — only render-safe ids, never sim objects. */
export interface BuildingPickData {
  readonly buildingId: string;
  readonly x:          number;
  readonly y:          number;
}

interface PlacedBuilding {
  instance: InstancedMesh;
  defId: string;
  zoneType: ZoneType;
  variant: 'zone' | 'service' | 'warning';
}

/**
 * Instanced procedural building kits.
 *
 * One hidden source mesh per (defId, variant) is baked from kit boxes/cylinders
 * with vertex colours. Placed buildings are `createInstance` copies so 200 houses
 * share a handful of draw calls. Unpowered buildings swap to a red-baked source
 * because instances cannot have their own material.
 */
export class BuildingRenderer {
  private readonly _scene:    Scene;
  private readonly _shadows:  ShadowGenerator | null;
  private readonly _placed:   Map<string, PlacedBuilding> = new Map();
  private readonly _sources:  Map<string, Mesh> = new Map();
  private readonly _kitMat:   StandardMaterial;
  private readonly _warnMat:  StandardMaterial;
  private _selectedKey: string | null = null;
  private _heights: HeightField | null = null;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;

    this._kitMat = this._makeVertexMat('bld-kit');
    this._warnMat = this._makeVertexMat('bld-kit-warning');
    this._warnMat.emissiveColor = new Color3(0.28, 0.0, 0.0);

    const bbr = scene.getBoundingBoxRenderer();
    bbr.frontColor = new Color3(1.0, 0.95, 0.1);
    bbr.backColor  = new Color3(0.7, 0.65, 0.05);
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  addBuilding(instance: BuildingInstance, zoneType: ZoneType): void {
    this.removeBuilding(instance.x, instance.y);

    if (SKIP_MESH_DEF_IDS.has(instance.defId)) return;

    const variant = SERVICE_DEF_IDS.has(instance.defId) ? 'service' : 'zone';
    this._spawn(instance, zoneType, variant);
  }

  removeBuilding(x: number, y: number): void {
    const key  = _tileKey(x, y);
    const placed = this._placed.get(key);
    if (!placed) return;

    if (this._selectedKey === key) this._selectedKey = null;
    placed.instance.dispose();
    this._placed.delete(key);
  }

  selectBuilding(x: number, y: number): BuildingPickData | null {
    this.clearSelection();

    const key  = _tileKey(x, y);
    const placed = this._placed.get(key);
    if (!placed) return null;

    placed.instance.showBoundingBox = true;
    this._selectedKey = key;
    return placed.instance.metadata as BuildingPickData;
  }

  clearSelection(): void {
    if (this._selectedKey !== null) {
      const prev = this._placed.get(this._selectedKey);
      if (prev) prev.instance.showBoundingBox = false;
      this._selectedKey = null;
    }
  }

  updatePowerState(x: number, y: number, powered: boolean): void {
    const key  = _tileKey(x, y);
    const placed = this._placed.get(key);
    if (!placed) return;
    if (SERVICE_DEF_IDS.has(placed.defId)) return;

    const next: 'zone' | 'warning' = powered ? 'zone' : 'warning';
    if (placed.variant === next) return;

    const pick = placed.instance.metadata as BuildingPickData;
    const selected = this._selectedKey === key;
    placed.instance.dispose();
    this._placed.delete(key);
    this._spawn({ defId: placed.defId, x: pick.x, y: pick.y }, placed.zoneType, next);
    if (selected) this.selectBuilding(pick.x, pick.y);
  }

  private _spawn(
    instance: BuildingInstance,
    zoneType: ZoneType,
    variant: 'zone' | 'service' | 'warning',
  ): void {
    const key = _tileKey(instance.x, instance.y);
    const source = this._sourceFor(instance.defId, zoneType, variant);
    const mesh = source.createInstance(`building-${key}`);

    const groundY = this._heights?.tileCenter(instance.x, instance.y) ?? 0;
    mesh.position = new Vector3(
      instance.x * TILE_SIZE + TILE_SIZE / 2,
      groundY,
      instance.y * TILE_SIZE + TILE_SIZE / 2,
    );

    const pickData: BuildingPickData = { buildingId: instance.defId, x: instance.x, y: instance.y };
    mesh.metadata = pickData;
    mesh.useVertexColors = true;
    mesh.receiveShadows = true;

    this._placed.set(key, { instance: mesh, defId: instance.defId, zoneType, variant });
  }

  private _sourceFor(
    defId: string,
    zoneType: ZoneType,
    variant: 'zone' | 'service' | 'warning',
  ): Mesh {
    const sourceKey = `${defId}:${variant}:${zoneType}`;
    const cached = this._sources.get(sourceKey);
    if (cached) return cached;

    const kit = kitForDef(defId);
    const palette = kitPalette(variant, zoneType);
    const baked = this._bakeKit(sourceKey, kit, palette);
    baked.isVisible = false;
    baked.isPickable = false;
    baked.useVertexColors = true;
    baked.material = variant === 'warning' ? this._warnMat : this._kitMat;
    baked.receiveShadows = true;
    this._shadows?.addShadowCaster(baked);
    this._sources.set(sourceKey, baked);
    return baked;
  }

  private _bakeKit(name: string, kit: BuildingKit | null, palette: KitPalette): Mesh {
    const parts = kit?.parts ?? [_fallbackPart(kit)];
    const meshes: Mesh[] = [];
    for (let i = 0; i < parts.length; i++) {
      meshes.push(this._partMesh(`${name}-p${i}`, parts[i], palette));
    }
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (!merged) {
      return this._partMesh(name, _fallbackPart(kit), palette);
    }
    merged.name = name;
    merged.bakeCurrentTransformIntoVertices();
    merged.position = Vector3.Zero();
    merged.rotation = Vector3.Zero();
    merged.scaling = Vector3.One();
    return merged;
  }

  private _partMesh(name: string, part: KitPart, palette: KitPalette): Mesh {
    let mesh: Mesh;
    if (part.shape === 'cylinder') {
      mesh = MeshBuilder.CreateCylinder(name, {
        diameter: part.w,
        height: part.h,
        tessellation: 10,
      }, this._scene);
    } else if (part.shape === 'prism') {
      mesh = MeshBuilder.CreateCylinder(name, {
        diameter: part.w,
        height: part.d,
        tessellation: 3,
      }, this._scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.scaling.z = (part.h * 2) / Math.max(part.w, 0.001);
    } else {
      mesh = MeshBuilder.CreateBox(name, {
        width: part.w,
        height: part.h,
        depth: part.d,
      }, this._scene);
    }
    mesh.position = new Vector3(part.x, part.y, part.z);
    if (part.rx) mesh.rotation.x += part.rx;
    if (part.ry) mesh.rotation.y += part.ry;
    if (part.rz) mesh.rotation.z += part.rz;
    _paintVertices(mesh, palette[part.slot]);
    mesh.bakeCurrentTransformIntoVertices();
    return mesh;
  }

  private _makeVertexMat(name: string): StandardMaterial {
    const mat = new StandardMaterial(name, this._scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = new Color3(0.18, 0.18, 0.18);
    return mat;
  }
}

function _tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function _fallbackPart(kit: BuildingKit | null): KitPart {
  const shape = kit?.shape ?? DEFAULT_SHAPE;
  return {
    shape: 'box',
    slot: 'body',
    w: shape.width,
    h: shape.height,
    d: shape.depth,
    x: 0,
    y: shape.height / 2,
    z: 0,
  };
}

function _paintVertices(mesh: Mesh, color: { r: number; g: number; b: number }): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const count = positions.length / 3;
  const colors = new Array<number>(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4]     = color.r;
    colors[i * 4 + 1] = color.g;
    colors[i * 4 + 2] = color.b;
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

export { BUILDING_SHAPES };
