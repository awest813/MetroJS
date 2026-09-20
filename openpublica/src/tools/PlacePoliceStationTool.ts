// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to place a small police station. */
export const POLICE_STATION_COST = 400;

export class PlacePoliceStationTool implements Tool {
  readonly name  = 'placePoliceStation';
  readonly label = 'Police';

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, 'small_police_station', POLICE_STATION_COST);
  }
}
