// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';
import { GRID_SHORT, type UtilityGrid } from './utilityGrid';

/**
 * Power left on each grid for this month's growth.
 *
 * Power is handed out nearest first, so a building that grows where its grid
 * has no room takes power from the far end: those lots go dark, their
 * buildings leave, and the next ones grow dark in turn. Growth checks here
 * first. A new building (or a bigger one) only goes up where its grid can
 * carry the extra load, and nowhere on a grid that already leaves a building
 * dark. Lots no plant reaches at all are not on a grid, so they still fill
 * slowly, dark, until the player connects them.
 */
export class PowerRoom {
  /** Supply left per network; -Infinity once a building on it is dark. */
  private readonly _spare: number[];
  private readonly _networkOf: Int32Array | null;
  private readonly _width: number;
  /** Buildings held back this month for want of power. */
  held = 0;

  /**
   * @param grid       - the last power distribution (null before the first)
   * @param loadFactor - weather multiplier on every lot's load
   */
  constructor(grid: UtilityGrid | null, map: CityMap, readonly loadFactor = 1) {
    this._width = map.width;
    this._networkOf = grid?.networkOf ?? null;
    this._spare = grid ? grid.networks.map((n) => n.supply - n.load) : [];
    if (!grid) return;
    map.forEach((tile) => {
      const index = tile.y * map.width + tile.x;
      if (grid.state[index] !== GRID_SHORT || tile.buildingId === null) return;
      const id = grid.networkOf[index];
      if (id >= 0) this._spare[id] = -Infinity;
    });
  }

  private _network(tile: CityTile): number {
    return this._networkOf ? this._networkOf[tile.y * this._width + tile.x] : -1;
  }

  /** True when the lot is on a grid that can carry `load` more (residents plus jobs), or on none. */
  fits(tile: CityTile, load: number): boolean {
    const id = this._network(tile);
    if (id < 0) return true;
    return this._spare[id] >= load * this.loadFactor;
  }

  /** Take `load` from the lot's grid for a building that grew there. */
  take(tile: CityTile, load: number): void {
    const id = this._network(tile);
    if (id >= 0) this._spare[id] -= load * this.loadFactor;
  }
}
