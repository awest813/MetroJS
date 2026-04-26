import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType } from '../sim/CityTile';

/** Cost in city funds to place one road tile. */
export const ROAD_COST: Record<RoadType, number> = {
  [RoadType.None]:    0,
  [RoadType.Street]:  10,
  [RoadType.Highway]: 25,
};

/** Places a road tile and deducts the placement cost from city funds. */
export class RoadTool implements Tool {
  readonly name = 'road';
  readonly label = '🛣️ Road';

  private readonly _roadType: RoadType;

  constructor(roadType: RoadType = RoadType.Street) {
    this._roadType = roadType;
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    const cost = ROAD_COST[this._roadType];
    if (!sim.deductMoney(cost)) {
      console.warn(`[Road] Insufficient funds (need $${cost}, have $${sim.stats.money})`);
      return false;
    }
    sim.placeRoad(coord.x, coord.y, this._roadType);
    return true;
  }
}
