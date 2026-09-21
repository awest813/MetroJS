import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Interface every player tool must implement. */
export interface Tool {
  /** Unique machine-readable identifier. */
  readonly name: string;
  /** Human-readable label shown in the toolbar. */
  readonly label: string;
  /**
   * When true, a drag that jumps tiles still paints the 4-connected path
   * between pointer samples. Roads need that or the graph stays disconnected
   * and cars never spawn. Inspect and civic buildings stay click-only.
   */
  readonly stroke?: boolean;
  /**
   * Apply the tool to the tile at `coord`.
   * Returns `true` if the tile was mutated (so the renderer can refresh it).
   */
  apply(coord: TileCoord, sim: CitySim): boolean;
}
