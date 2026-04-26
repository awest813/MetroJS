// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType } from '../sim/CityTile';

/**
 * Cost in city funds to place one trolley avenue tile.
 * Higher than a normal street ($10) to reflect track and overhead wire
 * installation.
 */
export const TROLLEY_AVENUE_COST = 30;

/**
 * Placement tool for trolley / streetcar avenues.
 *
 * Clicking a tile places a `RoadType.TrolleyAvenue` road and deducts
 * `TROLLEY_AVENUE_COST` from the city treasury.
 *
 * Monthly maintenance ($5/tile) is handled separately by EconomySystem.
 */
export class TrolleyAvenueTool implements Tool {
  readonly name  = 'trolleyAvenue';
  readonly label = '🚃 Trolley Ave';

  apply(coord: TileCoord, sim: CitySim): boolean {
    const cost = TROLLEY_AVENUE_COST;
    if (!sim.deductMoney(cost)) {
      console.warn(`[TrolleyAve] Insufficient funds (need $${cost}, have $${sim.stats.money})`);
      return false;
    }
    sim.placeRoad(coord.x, coord.y, RoadType.TrolleyAvenue);
    return true;
  }
}
