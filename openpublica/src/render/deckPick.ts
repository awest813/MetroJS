// Render-only pick refinement. No Babylon — Jest can load this file.

import type { TileCoord } from '../data/types';
import { TILE_SIZE } from '../data/constants';

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Highest a deck can sit above the surface the ray hit (tallest bank plus deck). */
export const DECK_SEARCH_HEIGHT = 1.2;

/** Samples along the ray between that height and the hit. */
const DECK_SEARCH_STEPS = 48;

/**
 * Picking hits the terrain or the water plane, but a bridge deck floats above
 * both, so from an angled camera the hit lands a fraction of a tile behind
 * the deck the player clicked. March the ray down from
 * {@link DECK_SEARCH_HEIGHT} above the hit; the first tile whose deck top is
 * at or above the ray wins. Without a deck in the way, the hit tile stands.
 *
 * `deckTopAt` returns the deck surface height for bridge tiles and null for
 * everything else.
 */
export function refinePickOnDecks(
  origin: Vec3Like,
  hit: Vec3Like,
  deckTopAt: (x: number, y: number) => number | null,
): TileCoord {
  const hitTile = { x: Math.floor(hit.x / TILE_SIZE), y: Math.floor(hit.z / TILE_SIZE) };
  const dy = hit.y - origin.y;
  if (dy >= 0) return hitTile;

  // Ray parameter where it is DECK_SEARCH_HEIGHT above the hit (0 = origin, 1 = hit).
  const start = Math.max(0, 1 - DECK_SEARCH_HEIGHT / -dy);
  for (let i = 0; i <= DECK_SEARCH_STEPS; i++) {
    const t = start + ((1 - start) * i) / DECK_SEARCH_STEPS;
    const px = origin.x + (hit.x - origin.x) * t;
    const py = origin.y + dy * t;
    const pz = origin.z + (hit.z - origin.z) * t;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(pz / TILE_SIZE);
    const deck = deckTopAt(tx, ty);
    if (deck !== null && py <= deck) return { x: tx, y: ty };
  }
  return hitTile;
}
