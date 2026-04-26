import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Interface every player tool must implement. */
export interface Tool {
  /** Unique machine-readable identifier. */
  readonly name: string;
  /** Human-readable label shown in the toolbar. */
  readonly label: string;
  /**
   * Apply the tool to the tile at `coord`.
   * Returns `true` if the tile was mutated (so the renderer can refresh it).
   */
  apply(coord: TileCoord, sim: CitySim): boolean;
}
