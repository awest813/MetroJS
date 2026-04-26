// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to place a small power plant. */
export const POWER_PLANT_COST = 500;

/**
 * Placement tool for service buildings.
 *
 * Clicking a tile places a small power plant there and deducts
 * POWER_PLANT_COST from the city treasury.  The tool returns `true`
 * so the ToolController fires the onTileChanged callback, letting the
 * renderer update the terrain colour and building mesh immediately.
 */
export class PlacePowerPlantTool implements Tool {
  readonly name  = 'placePowerPlant';
  readonly label = '⚡ Power Plant';

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, 'small_power_plant', POWER_PLANT_COST);
  }
}
