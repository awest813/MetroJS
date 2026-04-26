// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { TileType } from '../data/tileTypes';
import { MAP_SIZE } from '../data/constants';

export interface Tile {
  readonly x: number;
  readonly y: number;
  type: TileType;
}

/**
 * 64×64 tile grid.  The single source of truth for the simulation state.
 * No Babylon.js dependency — safe to unit-test in Node.
 */
export class GameMap {
  readonly width: number;
  readonly height: number;

  private readonly _tiles: Tile[];

  constructor(width = MAP_SIZE, height = MAP_SIZE) {
    this.width = width;
    this.height = height;
    this._tiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this._tiles.push({ x, y, type: TileType.Empty });
      }
    }
  }

  /** Returns the tile at (x, y), or undefined if out of bounds. */
  getTile(x: number, y: number): Tile | undefined {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return undefined;
    return this._tiles[y * this.width + x];
  }

  /** Mutates the tile type at (x, y).  Does nothing if out of bounds. */
  setTileType(x: number, y: number, type: TileType): void {
    const tile = this.getTile(x, y);
    if (tile) tile.type = type;
  }

  /** Iterates every tile in row-major order. */
  forEach(callback: (tile: Tile) => void): void {
    this._tiles.forEach(callback);
  }
}
