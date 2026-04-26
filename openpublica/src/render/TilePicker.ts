import { Scene, PointerEventTypes } from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { MAP_SIZE } from '../data/constants';

/**
 * Translates Babylon.js pointer events into tile grid coordinates.
 * Uses scene.pick() to find the world-space hit point on the terrain mesh,
 * then floors to integer tile indices.
 */
export class TilePicker {
  private readonly _scene: Scene;
  private _onPickCallback: ((coord: TileCoord) => void) | undefined;

  constructor(scene: Scene) {
    this._scene = scene;

    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        this._handlePick();
      }
    });
  }

  /** Register a callback invoked whenever the player clicks a valid tile. */
  onPick(callback: (coord: TileCoord) => void): void {
    this._onPickCallback = callback;
  }

  private _handlePick(): void {
    const result = this._scene.pick(this._scene.pointerX, this._scene.pointerY);
    if (!result.hit || !result.pickedPoint) return;

    // The terrain mesh is the XZ plane (Y=0).  Convert world XZ to tile coords.
    const x = Math.floor(result.pickedPoint.x);
    const y = Math.floor(result.pickedPoint.z);

    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
      this._onPickCallback?.({ x, y });
    }
  }
}
