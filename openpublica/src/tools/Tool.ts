import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';

/** Interface every player tool must implement. */
export interface Tool {
  /** Unique machine-readable identifier. */
  readonly name: string;
  /** Human-readable label shown in the toolbar. */
  readonly label: string;
  /** Called when the player clicks a tile while this tool is active. */
  onTileClick(coord: TileCoord, map: GameMap): void;
}
