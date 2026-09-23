import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, ZoneType } from '../sim/CityTile';

/** Cost in city funds to bulldoze one tile. */
export const BULLDOZE_COST = 1;

/** Clears the road, zone, and building from a tile. */
export class BulldozeTool implements Tool {
  readonly name = 'bulldoze';
  readonly label = '🚧 Bulldoze';
  readonly stroke = true;

  canApply(coord: TileCoord, sim: CitySim): boolean {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return false;
    const empty =
      tile.roadType === RoadType.None &&
      tile.zoneType === ZoneType.None &&
      tile.buildingId === null;
    return !empty && sim.canAfford(BULLDOZE_COST);
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    if (!this.canApply(coord, sim)) return false;
    if (!sim.deductMoney(BULLDOZE_COST)) return false;
    sim.bulldoze(coord.x, coord.y);
    return true;
  }
}
