// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to place a small fire station. */
export const FIRE_STATION_COST = 400;

export class PlaceFireStationTool implements Tool {
  readonly name  = 'placeFireStation';
  readonly label = 'Fire';

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, 'small_fire_station', FIRE_STATION_COST);
  }
}
