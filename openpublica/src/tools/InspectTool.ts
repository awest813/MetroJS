import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';

/** Shows tile information in the console.  Does not modify the map. */
export class InspectTool implements Tool {
  readonly name = 'inspect';
  readonly label = '🔍 Inspect';

  onTileClick(coord: TileCoord, map: GameMap): void {
    const tile = map.getTile(coord.x, coord.y);
    if (tile) {
      console.info(`[Inspect] Tile (${tile.x}, ${tile.y}): type=${tile.type}`);
    }
  }
}
