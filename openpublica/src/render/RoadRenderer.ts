import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  PBRMaterial,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { isBridgeAt, roadNeighbors, roadProfile, type RoadNeighbors } from '../sim/roadConnections';
import { levelCrossingAxis } from '../sim/TransitSystem';
import {
  ARM_SPAN,
  CARDINAL_VEC,
  CURB_WIDTH,
  GIRDER_DEPTH,
  roadPieces,
  type Cardinal,
  type RoadPiece,
  type RoadPieceKind,
} from './roadLayout';
import { deckBaseHeight, roadKitDirtyTiles } from './roadDeck';
import { coloredPbr } from './pbrSurfaces';
import { ThinInstanceGroups } from './thinInstanceGroups';

/** Extra Y so the deck sits on the heightfield without z-fighting. */
export const ROAD_DECK_LIFT = 0.03;

/** Pieces that sit on top of the deck surface rather than on its base. */
const ON_DECK: ReadonlySet<RoadPieceKind> = new Set(['dash', 'rail', 'tie', 'crosswalk']);

/** A road deck this far above the lowest ground in its tile gets an embankment. */
export const EMBANKMENT_MIN_GAP = 0.035;

/** Embankments run this deep below the lowest ground so no gap shows. */
const EMBANKMENT_SINK = 0.04;

/** Pieces stretched along a sloped arm so seams stay closed. */
const STRETCH: ReadonlySet<RoadPieceKind> = new Set(['arm', 'rail', 'curb', 'railing', 'girder', 'berm']);

/**
 * Extruded, slope-aware streets, trolley avenues, and bridges. Shared 1×1
 * sources drawn as thin instances: each tile keeps its piece matrices, and a
 * flush rewrites only the sources an edit touched, so a city's ~20k road
 * pieces cost a dozen scene meshes instead of 20k nodes to cull every frame.
 * Not pickable — picking stays on the heightfield and water plane.
 */
export class RoadRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private readonly _pieces = new ThinInstanceGroups();
  private readonly _src: Record<Exclude<RoadPieceKind, 'pad' | 'arm'> | 'berm', Mesh>;
  private readonly _decks: Record<RoadType, Mesh>;
  private _heights: HeightField | null = null;

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
    const railing = this._mat('road-railing', new Color3(0.80, 0.80, 0.77), 0.70, 0.15);
    const concrete = this._mat('road-concrete', new Color3(0.56, 0.55, 0.52), 0.92);

    const streetDeck = this._unit('road-src-street', street);
    this._decks = {
      [RoadType.None]: streetDeck,
      [RoadType.Street]: streetDeck,
      [RoadType.Highway]: this._unit('road-src-highway', highway),
      [RoadType.TrolleyAvenue]: this._unit('road-src-trolley', trolley),
    };
    this._src = {
      curb: this._unit('road-src-curb', curb),
      dash: this._unit('road-src-dash', mark),
      rail: this._unit('road-src-rail', rail),
      tie: this._unit('road-src-tie', tie),
      crosswalk: this._unit('road-src-walk', walk),
      railing: this._unit('road-src-railing', railing),
      girder: this._unit('road-src-girder', concrete),
      pier: this._unit('road-src-pier', concrete),
      berm: this._unit('road-src-berm', this._mat('road-berm', new Color3(0.46, 0.42, 0.35), 0.95)),
    };
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  rebuild(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    this._pieces.clearAll();
    map.forEach((tile) => {
      if (tile.roadType !== RoadType.None) this._rebuildTile(map, tile.x, tile.y);
    });
    this._pieces.flush();
  }

  /** Rebuild the painted tile, its neighbours, any bridge span they touch, and nearby level crossings. */
  updateAround(map: CityMap, coord: TileCoord): void {
    this.rebuildTiles(map, roadKitDirtyTiles(map, coord.x, coord.y));
  }

  /** Rebuild these tiles (roads only; other tiles are skipped). */
  rebuildTiles(map: CityMap, coords: ReadonlyArray<TileCoord>): void {
    for (const tile of coords) this._rebuildTile(map, tile.x, tile.y);
    this._pieces.flush();
  }

  private _deck(map: CityMap, x: number, y: number): number {
    const ground = this._heights;
    if (!ground) return 0;
    return deckBaseHeight(map, ground, x, y);
  }

  private _rebuildTile(map: CityMap, x: number, y: number): void {
    const key = `${x},${y}`;
    this._pieces.clear(key);

    const tile = map.getTile(x, y);
    if (!tile || tile.roadType === RoadType.None) return;

    const h0 = this._deck(map, x, y) + ROAD_DECK_LIFT;
    const neighbors = roadNeighbors(map, x, y);
    const profile = roadProfile(tile.roadType);
    const seams = {} as Record<Cardinal, number>;
    for (const dir of ['n', 'e', 's', 'w'] as const) {
      const { dx, dz } = CARDINAL_VEC[dir];
      const there = neighbors[dir] ? this._deck(map, x + dx, y + dz) + ROAD_DECK_LIFT : h0;
      seams[dir] = (h0 + there) / 2;
    }

    const cx = x * TILE_SIZE + TILE_SIZE / 2;
    const cz = y * TILE_SIZE + TILE_SIZE / 2;

    const widths: Partial<Record<Cardinal, number>> = {};
    for (const dir of ['n', 'e', 's', 'w'] as const) {
      if (!neighbors[dir]) continue;
      const { dx, dz } = CARDINAL_VEC[dir];
      const next = map.getTile(x + dx, y + dz);
      if (next) widths[dir] = roadProfile(next.roadType).width;
    }

    const bridge = isBridgeAt(map, x, y);
    const bed = this._heights?.tileCenter(x, y) ?? h0 - 1;
    const deckSrc = this._decks[tile.roadType];
    const railAxis = levelCrossingAxis(map, x, y);
    for (const piece of roadPieces(tile.roadType, neighbors, bridge, widths, railAxis)) {
      if (piece.kind === 'pier') {
        this._spawnPier(key, piece, cx, cz, bed, h0 - GIRDER_DEPTH);
      } else {
        this._spawn(key, piece, cx, cz, h0, profile.thickness, seams, deckSrc);
      }
    }
    if (!bridge) this._spawnEmbankment(key, neighbors, profile.width, cx, cz, h0, seams);
  }

  /**
   * A land road raised over sloping ground (a shore road riding its dry side,
   * or a deck over a dip) stands on an earth embankment under the pad and
   * each arm, down past the lowest ground in the tile.
   */
  private _spawnEmbankment(
    key: string,
    neighbors: RoadNeighbors,
    deckWidth: number,
    cx: number,
    cz: number,
    h0: number,
    seams: Record<Cardinal, number>,
  ): void {
    const heights = this._heights;
    if (!heights) return;
    let lowest = Infinity;
    for (const ox of [-0.4, 0, 0.4]) {
      for (const oz of [-0.4, 0, 0.4]) lowest = Math.min(lowest, heights.sample(cx + ox, cz + oz));
    }
    const drop = h0 - lowest;
    if (!(drop > EMBANKMENT_MIN_GAP)) return;
    const depth = drop + EMBANKMENT_SINK;
    const w = deckWidth + CURB_WIDTH * 2;
    this._instance(
      key,
      this._src.berm,
      new Vector3(cx, h0 - depth / 2, cz),
      new Vector3(w, depth, w),
      Vector3.Zero(),
    );
    for (const dir of ['n', 'e', 's', 'w'] as const) {
      if (!neighbors[dir]) continue;
      const { dx, dz } = CARDINAL_VEC[dir];
      const eastWest = dir === 'e' || dir === 'w';
      this._spawn(key, {
        kind: 'berm',
        ox: dx * (ARM_SPAN / 2),
        oz: dz * (ARM_SPAN / 2),
        sx: eastWest ? ARM_SPAN : w,
        sy: depth,
        sz: eastWest ? w : ARM_SPAN,
        rotY: 0,
        slope: dir,
      }, cx, cz, h0, 0, seams, this._src.berm);
    }
  }

  private _spawn(
    key: string,
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

    let lift = piece.sy / 2;
    if (ON_DECK.has(piece.kind)) lift = deckT + piece.sy / 2 + 0.002;
    else if (piece.kind === 'girder' || piece.kind === 'berm') lift = -piece.sy / 2;

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
      if (STRETCH.has(piece.kind)) {
        const stretch = Math.hypot(ARM_SPAN, dy) / ARM_SPAN;
        if (piece.slope === 'e' || piece.slope === 'w') sx *= stretch;
        else sz *= stretch;
      }
    } else {
      y = h0 + lift;
    }

    const src = piece.kind === 'pad' || piece.kind === 'arm' ? deckSrc : this._src[piece.kind];
    this._instance(
      key,
      src,
      new Vector3(cx + piece.ox, y, cz + piece.oz),
      new Vector3(sx, piece.sy, sz),
      new Vector3(rotX, piece.rotY, rotZ),
    );
  }

  /** A pier wall from the lake bed (or bank) up to the underside of the girder. */
  private _spawnPier(
    key: string,
    piece: RoadPiece,
    cx: number,
    cz: number,
    bottom: number,
    top: number,
  ): void {
    const height = top - bottom;
    if (height <= 0.02) return;
    this._instance(
      key,
      this._src.pier,
      new Vector3(cx + piece.ox, bottom + height / 2, cz + piece.oz),
      new Vector3(piece.sx, height, piece.sz),
      Vector3.Zero(),
    );
  }

  private _instance(key: string, src: Mesh, position: Vector3, scaling: Vector3, rotation: Vector3): void {
    this._pieces.add(key, src, position, scaling, rotation);
  }

  private _unit(name: string, mat: PBRMaterial): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width: 1, height: 1, depth: 1 }, this._scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    ThinInstanceGroups.prepare(mesh);
    this._shadows?.addShadowCaster(mesh);
    return mesh;
  }

  private _mat(name: string, albedo: Color3, roughness: number, metallic = 0): PBRMaterial {
    return coloredPbr(name, this._scene, albedo, roughness, metallic);
  }
}
