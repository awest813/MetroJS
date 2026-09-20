import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  TransformNode,
  PBRMaterial,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { roadNeighbors, roadProfile } from '../sim/roadConnections';
import {
  ARM_SPAN,
  CARDINAL_VEC,
  roadPieces,
  type Cardinal,
  type RoadPiece,
  type RoadPieceKind,
} from './roadLayout';
import { coloredPbr } from './pbrSurfaces';

/** Extra Y so the deck sits on the heightfield without z-fighting. */
export const ROAD_DECK_LIFT = 0.03;

/**
 * Extruded, slope-aware streets and trolley avenues. Shared 1×1 sources,
 * instanced per kit piece. Not pickable — picking stays on the heightfield.
 */
export class RoadRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private readonly _roots = new Map<string, TransformNode>();
  private readonly _src: Record<RoadPieceKind, Mesh>;
  private _heights: HeightField | null = null;
  private _seq = 0;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;

    const street = this._mat('road-street', new Color3(0.22, 0.23, 0.25), 0.86);
    const highway = this._mat('road-highway', new Color3(0.16, 0.17, 0.18), 0.78);
    const trolley = this._mat('road-trolley', new Color3(0.58, 0.32, 0.18), 0.82);
    const curb = this._mat('road-curb', new Color3(0.48, 0.47, 0.45), 0.90);
    const mark = this._mat('road-mark', new Color3(0.95, 0.82, 0.22), 0.48);
    mark.emissiveColor = new Color3(0.12, 0.09, 0.02);
    const walk = this._mat('road-walk', new Color3(0.88, 0.88, 0.86), 0.94);
    const rail = this._mat('road-rail', new Color3(0.62, 0.64, 0.68), 0.38, 0.55);
    rail.emissiveColor = new Color3(0.05, 0.05, 0.06);
    const tie = this._mat('road-tie', new Color3(0.28, 0.16, 0.09), 0.88);

    this._src = {
      pad: this._unit('road-src-street', street),
      arm: this._unit('road-src-highway', highway),
      curb: this._unit('road-src-curb', curb),
      dash: this._unit('road-src-dash', mark),
      rail: this._unit('road-src-rail', rail),
      tie: this._unit('road-src-tie', tie),
      crosswalk: this._unit('road-src-walk', walk),
    };
    // pad/arm share look per tile type — swap material on instance is not allowed,
    // so keep extra deck sources:
    this._trolleyDeck = this._unit('road-src-trolley', trolley);
    this._streetDeck = this._src.pad;
    this._highwayDeck = this._src.arm;
  }

  private readonly _trolleyDeck: Mesh;
  private readonly _streetDeck: Mesh;
  private readonly _highwayDeck: Mesh;

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  rebuild(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    for (const root of this._roots.values()) root.dispose();
    this._roots.clear();
    map.forEach((tile) => {
      if (tile.roadType !== RoadType.None) this._rebuildTile(map, tile.x, tile.y);
    });
  }

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

    const h0 = (this._heights?.tileCenter(x, y) ?? 0) + ROAD_DECK_LIFT;
    const neighbors = roadNeighbors(map, x, y);
    const profile = roadProfile(tile.roadType);
    const seams: Record<Cardinal, number> = {
      n: this._seam(x, y, 'n'),
      e: this._seam(x, y, 'e'),
      s: this._seam(x, y, 's'),
      w: this._seam(x, y, 'w'),
    };

    const cx = x * TILE_SIZE + TILE_SIZE / 2;
    const cz = y * TILE_SIZE + TILE_SIZE / 2;
    const root = new TransformNode(`road-${key}`, this._scene);
    this._roots.set(key, root);

    const deckSrc = this._deckSource(tile.roadType);
    for (const piece of roadPieces(tile.roadType, neighbors)) {
      this._spawn(root, piece, cx, cz, h0, profile.thickness, seams, deckSrc);
    }
  }

  private _seam(x: number, y: number, dir: Cardinal): number {
    const { dx, dz } = CARDINAL_VEC[dir];
    const here = this._heights?.tileCenter(x, y) ?? 0;
    const there = this._heights?.tileCenter(x + dx, y + dz) ?? here;
    return (here + there) / 2 + ROAD_DECK_LIFT;
  }

  private _spawn(
    root: TransformNode,
    piece: RoadPiece,
    cx: number,
    cz: number,
    h0: number,
    deckT: number,
    seams: Record<Cardinal, number>,
    deckSrc: Mesh,
  ): void {
    let sx = piece.sx;
    let sz = piece.sz;
    let rotX = 0;
    let rotZ = 0;
    let y: number;

    const onDeck = piece.kind === 'dash' || piece.kind === 'rail' || piece.kind === 'tie' || piece.kind === 'crosswalk';
    const lift = onDeck ? deckT + piece.sy / 2 + 0.002 : piece.sy / 2;

    if (piece.slope) {
      const seam = seams[piece.slope];
      const dy = seam - h0;
      const { dx, dz } = CARDINAL_VEC[piece.slope];
      const along = Math.abs(piece.ox * dx + piece.oz * dz);
      const t = ARM_SPAN > 0 ? along / ARM_SPAN : 0;
      y = h0 + dy * t + lift;
      const pitch = Math.atan2(dy, ARM_SPAN);
      if (piece.slope === 'n') rotX = -pitch;
      else if (piece.slope === 's') rotX = pitch;
      else if (piece.slope === 'e') rotZ = pitch;
      else rotZ = -pitch;
      if (piece.kind === 'arm' || piece.kind === 'rail' || piece.kind === 'curb') {
        const stretch = Math.hypot(ARM_SPAN, dy) / ARM_SPAN;
        if (piece.slope === 'e' || piece.slope === 'w') sx *= stretch;
        else sz *= stretch;
      }
    } else {
      y = h0 + lift;
    }

    const src = this._sourceFor(piece.kind, deckSrc);
    const inst = src.createInstance(`rd-${piece.kind}-${this._seq++}`);
    inst.parent = root;
    inst.position = new Vector3(cx + piece.ox, y, cz + piece.oz);
    inst.scaling = new Vector3(sx, piece.sy, sz);
    inst.rotation = new Vector3(rotX, piece.rotY, rotZ);
    inst.isPickable = false;
    inst.receiveShadows = true;
  }

  private _sourceFor(kind: RoadPieceKind, deckSrc: Mesh): Mesh {
    if (kind === 'pad' || kind === 'arm') return deckSrc;
    return this._src[kind];
  }

  private _deckSource(type: RoadType): Mesh {
    if (type === RoadType.Highway) return this._highwayDeck;
    if (type === RoadType.TrolleyAvenue) return this._trolleyDeck;
    return this._streetDeck;
  }

  private _unit(name: string, mat: PBRMaterial): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width: 1, height: 1, depth: 1 }, this._scene);
    mesh.material = mat;
    mesh.isVisible = false;
    mesh.isPickable = false;
    this._shadows?.addShadowCaster(mesh);
    return mesh;
  }

  private _mat(name: string, albedo: Color3, roughness: number, metallic = 0): PBRMaterial {
    return coloredPbr(name, this._scene, albedo, roughness, metallic);
  }
}
