// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to place a small park. */
export const PARK_COST = 200;

/**
 * Placement tool for parks.
 *
 * Clicking a tile places a small park there and deducts PARK_COST from the
 * city treasury.  The tool returns `true` so the ToolController fires the
 * onTileChanged callback, letting the renderer update the tile immediately.
 */
export class PlaceParkTool implements Tool {
  readonly name  = 'placePark';
  readonly label = '🌳 Park';

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, 'small_park', PARK_COST);
  }
}
