import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';
import { TileType } from '../data/tileTypes';

/** Places a road tile. */
export class RoadTool implements Tool {
  readonly name = 'road';
  readonly label = '🛣️ Road';

  onTileClick(coord: TileCoord, map: GameMap): void {
    map.setTileType(coord.x, coord.y, TileType.Road);
  }
}
