// Render-only road kit. No Babylon — Jest can load this file.

import { RoadType } from '../sim/CityTile';
import type { RoadNeighbors } from '../sim/roadConnections';
import { roadProfile } from '../sim/roadConnections';

export type Cardinal = 'n' | 'e' | 's' | 'w';

export const CARDINALS: readonly Cardinal[] = ['n', 'e', 's', 'w'];

export const CARDINAL_VEC: Record<Cardinal, { dx: number; dz: number }> = {
  n: { dx: 0, dz: 1 },
  e: { dx: 1, dz: 0 },
  s: { dx: 0, dz: -1 },
  w: { dx: -1, dz: 0 },
};

/** Centre to tile edge; two arms meet at the shared border. */
export const ARM_SPAN = 0.5;

export const CURB_WIDTH = 0.05;
export const CURB_HEIGHT = 0.036;
export const MARK_WIDTH = 0.032;
export const MARK_HEIGHT = 0.01;
export const MARK_LENGTH = 0.12;
export const RAIL_WIDTH = 0.03;
export const RAIL_HEIGHT = 0.026;
export const RAIL_GAUGE = 0.12;
export const TIE_WIDTH = 0.28;
export const TIE_HEIGHT = 0.016;
export const TIE_LENGTH = 0.055;
export const CROSSWALK_BAR = 0.045;

export type RoadPieceKind =
  | 'pad'
  | 'arm'
  | 'curb'
  | 'dash'
  | 'rail'
  | 'tie'
  | 'crosswalk';

export interface RoadPiece {
  readonly kind: RoadPieceKind;
  readonly ox: number;
  readonly oz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly rotY: number;
  readonly slope?: Cardinal;
}

export function connectedCardinals(n: RoadNeighbors): Cardinal[] {
  return CARDINALS.filter((d) => n[d]);
}

export function isIsolated(n: RoadNeighbors): boolean {
  return connectedCardinals(n).length === 0;
}

export function isFourWay(n: RoadNeighbors): boolean {
  return n.n && n.e && n.s && n.w;
}

export function countByKind(pieces: readonly RoadPiece[], kind: RoadPieceKind): number {
  return pieces.filter((p) => p.kind === kind).length;
}

export function roadPieces(type: RoadType, neighbors: RoadNeighbors): RoadPiece[] {
  const profile = roadProfile(type);
  const pieces: RoadPiece[] = [];
  const dirs = connectedCardinals(neighbors);
  const isolated = dirs.length === 0;
  const trolley = type === RoadType.TrolleyAvenue;
  const w = profile.width;
  const thick = profile.thickness;

  pieces.push({ kind: 'pad', ox: 0, oz: 0, sx: w, sy: thick, sz: w, rotY: 0 });

  for (const dir of dirs) {
    const { dx, dz } = CARDINAL_VEC[dir];
    const eastWest = dir === 'e' || dir === 'w';
    pieces.push({
      kind: 'arm',
      ox: dx * (ARM_SPAN / 2),
      oz: dz * (ARM_SPAN / 2),
      sx: eastWest ? ARM_SPAN : w,
      sy: thick,
      sz: eastWest ? w : ARM_SPAN,
      rotY: 0,
      slope: dir,
    });

    const side = w / 2 + CURB_WIDTH / 2;
    if (eastWest) {
      pieces.push(piece('curb', dx * (ARM_SPAN / 2), dz * (ARM_SPAN / 2) + side, ARM_SPAN, CURB_HEIGHT, CURB_WIDTH, dir));
      pieces.push(piece('curb', dx * (ARM_SPAN / 2), dz * (ARM_SPAN / 2) - side, ARM_SPAN, CURB_HEIGHT, CURB_WIDTH, dir));
    } else {
      pieces.push(piece('curb', dx * (ARM_SPAN / 2) + side, dz * (ARM_SPAN / 2), CURB_WIDTH, CURB_HEIGHT, ARM_SPAN, dir));
      pieces.push(piece('curb', dx * (ARM_SPAN / 2) - side, dz * (ARM_SPAN / 2), CURB_WIDTH, CURB_HEIGHT, ARM_SPAN, dir));
    }
  }

  if (isolated) {
    const edge = w / 2 + CURB_WIDTH / 2;
    pieces.push(piece('curb', 0, edge, w + CURB_WIDTH * 2, CURB_HEIGHT, CURB_WIDTH));
    pieces.push(piece('curb', 0, -edge, w + CURB_WIDTH * 2, CURB_HEIGHT, CURB_WIDTH));
    pieces.push(piece('curb', edge, 0, CURB_WIDTH, CURB_HEIGHT, w));
    pieces.push(piece('curb', -edge, 0, CURB_WIDTH, CURB_HEIGHT, w));
  } else {
    for (const dir of CARDINALS) {
      if (neighbors[dir]) continue;
      const { dx, dz } = CARDINAL_VEC[dir];
      const edge = w / 2 + CURB_WIDTH / 2;
      const eastWest = dir === 'e' || dir === 'w';
      if (eastWest) {
        pieces.push(piece('curb', dx * edge, 0, CURB_WIDTH, CURB_HEIGHT, w));
      } else {
        pieces.push(piece('curb', 0, dz * edge, w, CURB_HEIGHT, CURB_WIDTH));
      }
    }
  }

  if (trolley) addTrolleyKit(pieces, dirs, isolated, w);
  else addStreetKit(pieces, type, dirs, isolated, isFourWay(neighbors));

  return pieces;
}

function piece(
  kind: RoadPieceKind,
  ox: number,
  oz: number,
  sx: number,
  sy: number,
  sz: number,
  slope?: Cardinal,
): RoadPiece {
  return { kind, ox, oz, sx, sy, sz, rotY: 0, slope };
}

function addStreetKit(
  pieces: RoadPiece[],
  type: RoadType,
  dirs: Cardinal[],
  isolated: boolean,
  fourWay: boolean,
): void {
  if (isolated) {
    pieces.push(piece('dash', 0, 0, MARK_WIDTH, MARK_HEIGHT, MARK_LENGTH));
    return;
  }

  for (const dir of dirs) {
    const { dx, dz } = CARDINAL_VEC[dir];
    const eastWest = dir === 'e' || dir === 'w';
    const ox = dx * 0.28;
    const oz = dz * 0.28;
    if (type === RoadType.Highway) {
      const off = 0.028;
      if (eastWest) {
        pieces.push(piece('dash', ox, oz + off, MARK_LENGTH, MARK_HEIGHT, MARK_WIDTH, dir));
        pieces.push(piece('dash', ox, oz - off, MARK_LENGTH, MARK_HEIGHT, MARK_WIDTH, dir));
      } else {
        pieces.push(piece('dash', ox + off, oz, MARK_WIDTH, MARK_HEIGHT, MARK_LENGTH, dir));
        pieces.push(piece('dash', ox - off, oz, MARK_WIDTH, MARK_HEIGHT, MARK_LENGTH, dir));
      }
    } else {
      pieces.push(piece(
        'dash',
        ox,
        oz,
        eastWest ? MARK_LENGTH : MARK_WIDTH,
        MARK_HEIGHT,
        eastWest ? MARK_WIDTH : MARK_LENGTH,
        dir,
      ));
    }
  }

  if (fourWay && type === RoadType.Street) {
    for (const dir of dirs) {
      const { dx, dz } = CARDINAL_VEC[dir];
      const eastWest = dir === 'e' || dir === 'w';
      const base = 0.22;
      for (let i = -1; i <= 1; i++) {
        const lat = i * 0.12;
        pieces.push(piece(
          'crosswalk',
          dx * base + (eastWest ? 0 : lat),
          dz * base + (eastWest ? lat : 0),
          eastWest ? CROSSWALK_BAR : 0.10,
          MARK_HEIGHT,
          eastWest ? 0.10 : CROSSWALK_BAR,
          dir,
        ));
      }
    }
  }
}

function addTrolleyKit(
  pieces: RoadPiece[],
  dirs: Cardinal[],
  isolated: boolean,
  padWidth: number,
): void {
  const ns = isolated || dirs.includes('n') || dirs.includes('s');
  const ew = isolated || dirs.includes('e') || dirs.includes('w');

  if (ns) {
    pieces.push(piece('rail', -RAIL_GAUGE, 0, RAIL_WIDTH, RAIL_HEIGHT, padWidth));
    pieces.push(piece('rail', RAIL_GAUGE, 0, RAIL_WIDTH, RAIL_HEIGHT, padWidth));
    for (const dir of ['n', 's'] as const) {
      if (!isolated && !dirs.includes(dir)) continue;
      const dz = CARDINAL_VEC[dir].dz;
      pieces.push(piece('rail', -RAIL_GAUGE, dz * (ARM_SPAN / 2), RAIL_WIDTH, RAIL_HEIGHT, ARM_SPAN, dir));
      pieces.push(piece('rail', RAIL_GAUGE, dz * (ARM_SPAN / 2), RAIL_WIDTH, RAIL_HEIGHT, ARM_SPAN, dir));
    }
    for (let i = -1; i <= 1; i++) {
      pieces.push(piece('tie', 0, i * 0.14, TIE_WIDTH, TIE_HEIGHT, TIE_LENGTH));
    }
  }

  if (ew) {
    pieces.push(piece('rail', 0, -RAIL_GAUGE, padWidth, RAIL_HEIGHT, RAIL_WIDTH));
    pieces.push(piece('rail', 0, RAIL_GAUGE, padWidth, RAIL_HEIGHT, RAIL_WIDTH));
    for (const dir of ['e', 'w'] as const) {
      if (!isolated && !dirs.includes(dir)) continue;
      const dx = CARDINAL_VEC[dir].dx;
      pieces.push(piece('rail', dx * (ARM_SPAN / 2), -RAIL_GAUGE, ARM_SPAN, RAIL_HEIGHT, RAIL_WIDTH, dir));
      pieces.push(piece('rail', dx * (ARM_SPAN / 2), RAIL_GAUGE, ARM_SPAN, RAIL_HEIGHT, RAIL_WIDTH, dir));
    }
    for (let i = -1; i <= 1; i++) {
      pieces.push(piece('tie', i * 0.14, 0, TIE_LENGTH, TIE_HEIGHT, TIE_WIDTH));
    }
  }
}
