import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { ZoneType } from '../sim/CityTile';

/** Cost in city funds to zone one residential tile. */
export const RESIDENTIAL_COST = 5;

/** Designates a tile as a low-density residential zone. */
export class ResidentialTool implements Tool {
  readonly name = 'residential';
  readonly label = '🏠 Residential';

  apply(coord: TileCoord, sim: CitySim): boolean {
    if (!sim.deductMoney(RESIDENTIAL_COST)) {
      console.warn(
        `[Residential] Insufficient funds (need $${RESIDENTIAL_COST}, have $${sim.stats.money})`,
      );
      return false;
    }
    sim.setZone(coord.x, coord.y, ZoneType.Residential);
    return true;
  }
}
