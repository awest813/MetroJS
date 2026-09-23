// Render-only deck heights. No Babylon — Jest can load this file.

import type { CityMap } from '../sim/CityMap';
import { FOOTING_CLEARANCE, WATER_SURFACE_Y } from '../sim/HeightField';
import { bridgeSpanAt, isBridgeAt, isLandRoad } from '../sim/roadConnections';

/** Anything that can report ground height at a tile centre (HeightField does). */
export interface GroundHeights {
  tileCenter(x: number, y: number): number;
  /** Mean of the tile's dry corners; lets a shore road ride its embankment. */
  dryCenter?(x: number, y: number): number;
}

/** Gap between the water plane and the lowest bridge deck base. */
export const BRIDGE_CLEARANCE = 0.2;

/** Lowest Y a bridge deck base may sit at. */
export const BRIDGE_DECK_MIN_Y = WATER_SURFACE_Y + BRIDGE_CLEARANCE;

/**
 * Where a land road (or anything else on a dry tile) stands: the tile centre,
 * but never within FOOTING_CLEARANCE of the water. Matches HeightField.footing.
 */
export function landFooting(ground: GroundHeights, x: number, y: number): number {
  return Math.max(ground.tileCenter(x, y), WATER_SURFACE_Y + FOOTING_CLEARANCE);
}

/**
 * Where a land road's deck sits: the graded ground, but on the shore the level
 * of its dry corners, so the uphill side does not bury the deck.
 */
export function landRoadBed(ground: GroundHeights, x: number, y: number): number {
  const dry = ground.dryCenter ? ground.dryCenter(x, y) : ground.tileCenter(x, y);
  return Math.max(dry, landFooting(ground, x, y));
}

/**
 * Base Y of the road deck at (x, y), before the renderer's deck lift.
 * Land roads follow the graded terrain, kept clear of the water. A bridge runs
 * level-ish from one land abutment to the other, never lower than
 * {@link BRIDGE_DECK_MIN_Y}. Non-road tiles report their footing.
 */
export function deckBaseHeight(map: CityMap, ground: GroundHeights, x: number, y: number): number {
  if (!isBridgeAt(map, x, y)) {
    return isLandRoad(map.getTile(x, y)) ? landRoadBed(ground, x, y) : landFooting(ground, x, y);
  }
  const span = bridgeSpanAt(map, x, y);
  if (!span) return landFooting(ground, x, y);

  const before = _abutment(map, ground, span.before.x, span.before.y);
  const after = _abutment(map, ground, span.after.x, span.after.y);
  let h: number;
  if (before !== null && after !== null) {
    const index = span.tiles.findIndex((t) => t.x === x && t.y === y);
    const t = (index + 1) / (span.tiles.length + 1);
    h = before + (after - before) * t;
  } else {
    h = before ?? after ?? BRIDGE_DECK_MIN_Y;
  }
  return Math.max(BRIDGE_DECK_MIN_Y, h);
}

function _abutment(map: CityMap, ground: GroundHeights, x: number, y: number): number | null {
  return isLandRoad(map.getTile(x, y)) ? landRoadBed(ground, x, y) : null;
}

/**
 * Tiles whose deck geometry may change when (x, y) is paved or cleared:
 * the tile, its four neighbours, and every tile of any bridge span touching
 * them plus each span's abutments.
 */
export function deckDirtyTiles(map: CityMap, x: number, y: number): Array<{ x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const add = (tx: number, ty: number): void => {
    if (!map.getTile(tx, ty)) return;
    out.set(`${tx},${ty}`, { x: tx, y: ty });
  };
  const around: Array<[number, number]> = [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  for (const [tx, ty] of around) {
    add(tx, ty);
    const span = bridgeSpanAt(map, tx, ty);
    if (!span) continue;
    for (const t of span.tiles) add(t.x, t.y);
    add(span.before.x, span.before.y);
    add(span.after.x, span.after.y);
  }
  return Array.from(out.values());
}

/** Height of the deck surface under a vehicle part-way along an edge. */
export function edgeDeckHeight(fromDeck: number, toDeck: number, t: number): number {
  return fromDeck + (toDeck - fromDeck) * t;
}
