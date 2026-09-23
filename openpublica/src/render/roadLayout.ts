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

export const CURB_WIDTH = 0.034;
export const CURB_HEIGHT = 0.062;
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
/** Bridge parapet: taller and lighter than a curb so the span reads from far off. */
export const RAILING_WIDTH = 0.03;
export const RAILING_HEIGHT = 0.12;
/** Box girder hung under a bridge deck. */
export const GIRDER_DEPTH = 0.09;
/** Pier wall thickness along the span (its width runs across the deck). */
export const PIER_THICKNESS = 0.12;

export type RoadPieceKind =
  | 'pad'
  | 'arm'
  | 'curb'
  | 'dash'
  | 'rail'
  | 'tie'
  | 'crosswalk'
  | 'railing'
  | 'girder'
  /** Vertical extent is resolved by the renderer (water bed up to the girder). */
  | 'pier'
  /** Earth embankment under a raised land road; the renderer sizes it. */
  | 'berm';

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

/**
 * Kit pieces for one road tile, centred on the tile.
 * With `bridge`, curbs become railings and the deck gets girders and a pier.
 *
 * `neighborWidths` gives the deck width of each connected neighbour. Where it
 * is narrower (a highway meeting a street), this tile's arm necks down to it
 * and short curbs close the pad edge, so the two decks meet flush at the seam.
 */
export function roadPieces(
  type: RoadType,
  neighbors: RoadNeighbors,
  bridge = false,
  neighborWidths: Partial<Record<Cardinal, number>> = {},
): RoadPiece[] {
  const profile = roadProfile(type);
  const pieces: RoadPiece[] = [];
  const dirs = connectedCardinals(neighbors);
  const isolated = dirs.length === 0;
  const trolley = type === RoadType.TrolleyAvenue;
  const w = profile.width;
  const thick = profile.thickness;
  const edge: RoadPieceKind = bridge ? 'railing' : 'curb';
  const edgeW = bridge ? RAILING_WIDTH : CURB_WIDTH;
  const edgeH = bridge ? RAILING_HEIGHT : CURB_HEIGHT;

  pieces.push({ kind: 'pad', ox: 0, oz: 0, sx: w, sy: thick, sz: w, rotY: 0 });

  const armWidth = (dir: Cardinal): number => Math.min(w, neighborWidths[dir] ?? w);

  for (const dir of dirs) {
    const { dx, dz } = CARDINAL_VEC[dir];
    const eastWest = dir === 'e' || dir === 'w';
    const armW = armWidth(dir);
    pieces.push({
      kind: 'arm',
      ox: dx * (ARM_SPAN / 2),
      oz: dz * (ARM_SPAN / 2),
      sx: eastWest ? ARM_SPAN : armW,
      sy: thick,
      sz: eastWest ? armW : ARM_SPAN,
      rotY: 0,
      slope: dir,
    });

    // Edges run beside the arm; a necked arm's edges start at the pad edge.
    const start = armW < w ? w / 2 : 0;
    const length = ARM_SPAN - start;
    const mid = start + length / 2;
    const side = armW / 2 + edgeW / 2;
    for (const sign of [1, -1]) {
      if (eastWest) pieces.push(piece(edge, dx * mid, sign * side, length, edgeH, edgeW, dir));
      else pieces.push(piece(edge, sign * side, dz * mid, edgeW, edgeH, length, dir));
    }
    if (armW < w) {
      // Close the pad edge on both sides of the narrower arm.
      const inner = armW / 2 + edgeW;
      const outer = w / 2 + edgeW;
      const at = w / 2 + edgeW / 2;
      for (const sign of [1, -1]) {
        const across = sign * (inner + outer) / 2;
        if (eastWest) pieces.push(piece(edge, dx * at, across, edgeW, edgeH, outer - inner, dir));
        else pieces.push(piece(edge, across, dz * at, outer - inner, edgeH, edgeW, dir));
      }
    }
  }

  if (isolated) {
    const off = w / 2 + edgeW / 2;
    pieces.push(piece(edge, 0, off, w + edgeW * 2, edgeH, edgeW));
    pieces.push(piece(edge, 0, -off, w + edgeW * 2, edgeH, edgeW));
    pieces.push(piece(edge, off, 0, edgeW, edgeH, w));
    pieces.push(piece(edge, -off, 0, edgeW, edgeH, w));
  } else {
    for (const dir of CARDINALS) {
      if (neighbors[dir]) continue;
      const { dx, dz } = CARDINAL_VEC[dir];
      const off = w / 2 + edgeW / 2;
      const eastWest = dir === 'e' || dir === 'w';
      if (eastWest) {
        pieces.push(piece(edge, dx * off, 0, edgeW, edgeH, w));
      } else {
        pieces.push(piece(edge, 0, dz * off, w, edgeH, edgeW));
      }
    }
  }

  if (bridge) addBridgeKit(pieces, dirs, w, armWidth);

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

/** Girders under the pad and each arm, plus one pier wall across the span. */
function addBridgeKit(
  pieces: RoadPiece[],
  dirs: Cardinal[],
  deckWidth: number,
  armWidth: (dir: Cardinal) => number,
): void {
  const gw = deckWidth + 0.02;
  pieces.push(piece('girder', 0, 0, gw, GIRDER_DEPTH, gw));
  for (const dir of dirs) {
    const { dx, dz } = CARDINAL_VEC[dir];
    const eastWest = dir === 'e' || dir === 'w';
    const aw = armWidth(dir) + 0.02;
    pieces.push(piece(
      'girder',
      dx * (ARM_SPAN / 2),
      dz * (ARM_SPAN / 2),
      eastWest ? ARM_SPAN : aw,
      GIRDER_DEPTH,
      eastWest ? aw : ARM_SPAN,
      dir,
    ));
  }
  const alongX = dirs.includes('e') || dirs.includes('w');
  const across = deckWidth * 0.86;
  pieces.push(piece('pier', 0, 0, alongX ? PIER_THICKNESS : across, 1, alongX ? across : PIER_THICKNESS));
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
      const base = 0.24;
      for (const lat of [-0.12, 0.12]) {
        pieces.push(piece(
          'crosswalk',
          dx * base + (eastWest ? 0 : lat),
          dz * base + (eastWest ? lat : 0),
          eastWest ? 0.028 : 0.07,
          MARK_HEIGHT,
          eastWest ? 0.07 : 0.028,
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
