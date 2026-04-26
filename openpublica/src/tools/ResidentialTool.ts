import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';
import { TileType } from '../data/tileTypes';

/** Designates a tile as a residential zone. */
export class ResidentialTool implements Tool {
  readonly name = 'residential';
  readonly label = '🏠 Residential';

  onTileClick(coord: TileCoord, map: GameMap): void {
    map.setTileType(coord.x, coord.y, TileType.Residential);
  }
}
