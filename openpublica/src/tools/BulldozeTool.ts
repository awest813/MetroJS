import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';
import { TileType } from '../data/tileTypes';

/** Clears a tile back to bulldozed (bare) ground. */
export class BulldozeTool implements Tool {
  readonly name = 'bulldoze';
  readonly label = '🚧 Bulldoze';

  onTileClick(coord: TileCoord, map: GameMap): void {
    map.setTileType(coord.x, coord.y, TileType.Bulldozed);
  }
}
