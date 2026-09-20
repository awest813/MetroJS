// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to place a small water tower. */
export const WATER_TOWER_COST = 350;

export class PlaceWaterTowerTool implements Tool {
  readonly name  = 'placeWaterTower';
  readonly label = 'Water';

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, 'small_water_tower', WATER_TOWER_COST);
  }
}
