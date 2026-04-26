// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { CityTile } from './CityTile';

/**
 * Rectangular grid of CityTiles.
 * The authoritative spatial data store for the simulation; no rendering logic.
 */
export class CityMap {
  readonly width:  number;
  readonly height: number;

  private readonly _tiles: CityTile[];

  constructor(width: number, height: number) {
    this.width  = width;
    this.height = height;
    this._tiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this._tiles.push(new CityTile(x, y));
      }
    }
  }

  /** Returns the tile at (x, y), or undefined if out of bounds. */
  getTile(x: number, y: number): CityTile | undefined {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return undefined;
    return this._tiles[y * this.width + x];
  }

  /** Iterates every tile in row-major order. */
  forEach(callback: (tile: CityTile) => void): void {
    this._tiles.forEach(callback);
  }
}
