import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  VertexBuffer,
  InstancedMesh,
  PBRMaterial,
} from '@babylonjs/core';
import type { BuildingInstance } from '../sim/BuildingInstance';
import { ZoneType } from '../sim/CityTile';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import {
  BUILDING_SHAPES,
  CIVIC_DEF_IDS,
  DEFAULT_SHAPE,
  FIRE_DEF_IDS,
  WATER_DEF_IDS,
  SERVICE_DEF_IDS,
  SKIP_MESH_DEF_IDS,
  kitForDef,
  kitPalette,
  type BuildingKit,
  type KitPart,
  type KitPalette,
} from './buildingVisuals';
import { coloredPbr, vertexColorPbr } from './pbrSurfaces';
import { foundationFor } from './foundation';
import { rotateOffset } from './buildingFacing';
import { ThinInstanceGroups } from './thinInstanceGroups';

type KitVariant = 'zone' | 'service' | 'civic' | 'fire' | 'water' | 'warning';

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
  variant: KitVariant;
  /** Y rotation that turns the kit's front toward its street. */
  facing: number;
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
  private readonly _kitMat:   PBRMaterial;
  private readonly _warnMat:  PBRMaterial;
  private readonly _plinth:   Mesh;
  /** Stone plinths under buildings on sloped lots, one group per lot. */
  private readonly _plinths = new ThinInstanceGroups();
  private _selectedKey: string | null = null;
  private _heights: HeightField | null = null;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;

    this._kitMat = this._makeVertexMat('bld-kit');
    this._warnMat = this._makeVertexMat('bld-kit-warning');
    this._warnMat.emissiveColor = new Color3(0.28, 0.0, 0.0);

    this._plinth = MeshBuilder.CreateBox('bld-foundation-src', { size: 1 }, scene);
    this._plinth.material = coloredPbr('bld-foundation', scene, new Color3(0.52, 0.49, 0.44), 0.94);
    this._plinth.isPickable = false;
    this._plinth.receiveShadows = true;
    ThinInstanceGroups.prepare(this._plinth);
    this._shadows?.addShadowCaster(this._plinth);
    // Growth and repaint place buildings one at a time; write the plinth buffer once per frame.
    scene.onBeforeRenderObservable.add(() => this._plinths.flush());

    const bbr = scene.getBoundingBoxRenderer();
    bbr.frontColor = new Color3(1.0, 0.95, 0.1);
    bbr.backColor  = new Color3(0.7, 0.65, 0.05);
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  /** Place a kit on its lot; `facing` turns its front (+z) toward the street. */
  addBuilding(instance: BuildingInstance, zoneType: ZoneType, facing = 0): void {
    this.removeBuilding(instance.x, instance.y);

    if (SKIP_MESH_DEF_IDS.has(instance.defId)) return;

    this._spawn(instance, zoneType, kitKindForDef(instance.defId), facing);
  }

  /** Def id of the building drawn on (x, y), or null. */
  defAt(x: number, y: number): string | null {
    return this._placed.get(_tileKey(x, y))?.defId ?? null;
  }

  /** Turn an existing building after the roads beside it changed. */
  setFacing(x: number, y: number, facing: number): void {
    const placed = this._placed.get(_tileKey(x, y));
    if (!placed || Math.abs(placed.facing - facing) < 1e-6) return;
    placed.facing = facing;
    placed.instance.rotation.y = facing;
    placed.instance.freezeWorldMatrix();
    this._foundation(placed.defId, x, y, facing);
  }

  removeBuilding(x: number, y: number): void {
    const key  = _tileKey(x, y);
    const placed = this._placed.get(key);
    if (!placed) return;

    if (this._selectedKey === key) this._selectedKey = null;
    placed.instance.dispose();
    this._plinths.clear(key);
    this._placed.delete(key);
  }

  /** Move buildings on these tiles to the ground after it was re-graded. */
  reseat(coords: ReadonlyArray<{ x: number; y: number }>): void {
    for (const coord of coords) {
      const placed = this._placed.get(_tileKey(coord.x, coord.y));
      if (!placed) continue;
      placed.instance.position.y = this._floorY(coord.x, coord.y);
      placed.instance.freezeWorldMatrix();
      this._foundation(placed.defId, coord.x, coord.y, placed.facing);
    }
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

    const next: KitVariant = powered ? kitKindForDef(placed.defId) : 'warning';
    if (placed.variant === next) return;

    const pick = placed.instance.metadata as BuildingPickData;
    const selected = this._selectedKey === key;
    placed.instance.dispose();
    this._placed.delete(key);
    this._spawn({ defId: placed.defId, x: pick.x, y: pick.y }, placed.zoneType, next, placed.facing);
    if (selected) this.selectBuilding(pick.x, pick.y);
  }

  private _spawn(
    instance: BuildingInstance,
    zoneType: ZoneType,
    variant: KitVariant,
    facing: number,
  ): void {
    const key = _tileKey(instance.x, instance.y);
    const source = this._sourceFor(instance.defId, zoneType, variant);
    const mesh = source.createInstance(`building-${key}`);

    mesh.position = new Vector3(
      instance.x * TILE_SIZE + TILE_SIZE / 2,
      this._floorY(instance.x, instance.y),
      instance.y * TILE_SIZE + TILE_SIZE / 2,
    );
    mesh.rotation = new Vector3(0, facing, 0);
    // Buildings stand still: compute the matrix once, not every frame. Moving
    // one (a new facing, re-seated ground) freezes it again at its new place.
    mesh.freezeWorldMatrix();

    const pickData: BuildingPickData = { buildingId: instance.defId, x: instance.x, y: instance.y };
    mesh.metadata = pickData; // colours and shadows come from the source mesh

    this._foundation(instance.defId, instance.x, instance.y, facing);
    this._placed.set(key, { instance: mesh, defId: instance.defId, zoneType, variant, facing });
  }

  private _floorY(x: number, y: number): number {
    return this._heights?.footing(x, y) ?? 0;
  }

  /** (Re)lay the plinth from the floor down past the lowest ground in the (turned) footprint. */
  private _foundation(defId: string, x: number, y: number, facing: number): void {
    const key = _tileKey(x, y);
    this._plinths.clear(key);
    const heights = this._heights;
    if (!heights) return;
    const cx = x * TILE_SIZE + TILE_SIZE / 2;
    const cz = y * TILE_SIZE + TILE_SIZE / 2;
    const shape = BUILDING_SHAPES[defId] ?? DEFAULT_SHAPE;
    const spec = foundationFor(shape, this._floorY(x, y), (dx, dz) => {
      const world = rotateOffset(dx, dz, facing);
      return heights.sample(cx + world.dx, cz + world.dz);
    });
    if (!spec) return;
    this._plinths.add(
      key,
      this._plinth,
      new Vector3(cx, (spec.top + spec.bottom) / 2, cz),
      new Vector3(spec.width, spec.top - spec.bottom, spec.depth),
      new Vector3(0, facing, 0),
    );
  }

  private _sourceFor(
    defId: string,
    zoneType: ZoneType,
    variant: KitVariant,
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

  private _makeVertexMat(name: string): PBRMaterial {
    return vertexColorPbr(name, this._scene, 0.72);
  }
}

function _tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function kitKindForDef(defId: string): Exclude<KitVariant, 'warning'> {
  if (SERVICE_DEF_IDS.has(defId)) return 'service';
  if (FIRE_DEF_IDS.has(defId)) return 'fire';
  if (WATER_DEF_IDS.has(defId)) return 'water';
  if (CIVIC_DEF_IDS.has(defId)) return 'civic';
  return 'zone';
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
