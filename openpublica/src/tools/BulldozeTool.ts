import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Cost in city funds to bulldoze one tile. */
export const BULLDOZE_COST = 1;

/** Clears the road, zone, and building from a tile. */
export class BulldozeTool implements Tool {
  readonly name = 'bulldoze';
  readonly label = '🚧 Bulldoze';

  apply(coord: TileCoord, sim: CitySim): boolean {
    if (!sim.deductMoney(BULLDOZE_COST)) {
      console.warn(
        `[Bulldoze] Insufficient funds (need $${BULLDOZE_COST}, have $${sim.stats.money})`,
      );
      return false;
    }
    sim.bulldoze(coord.x, coord.y);
    return true;
  }
}
