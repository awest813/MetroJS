import { Scene, PointerEventTypes } from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { MAP_SIZE } from '../data/constants';

/**
 * Translates Babylon.js pointer events into tile grid coordinates.
 * Uses scene.pick() to find the world-space hit point on the terrain mesh,
 * then floors to integer tile indices.
 *
 * Emits tile coordinates on:
 * - POINTERDOWN  (click)
 * - POINTERMOVE  while the primary button is held (drag)
 * - POINTERUP    fires the optional dragEnd callback so callers can reset state.
 */
export class TilePicker {
  private readonly _scene: Scene;
  private _onPickCallback: ((coord: TileCoord) => void) | undefined;
  private _onDragEndCallback: (() => void) | undefined;
  private _isDragging = false;

  constructor(scene: Scene) {
    this._scene = scene;

    scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          this._isDragging = true;
          this._handlePick();
          break;

        case PointerEventTypes.POINTERMOVE:
          if (this._isDragging) this._handlePick();
          break;

        case PointerEventTypes.POINTERUP:
          this._isDragging = false;
          this._onDragEndCallback?.();
          break;
      }
    });
  }

  /** Register a callback invoked whenever the player clicks or drags over a valid tile. */
  onPick(callback: (coord: TileCoord) => void): void {
    this._onPickCallback = callback;
  }

  /**
   * Register a callback invoked when the player releases the pointer.
   * Use this to reset drag-deduplication state in the ToolController.
   */
  onDragEnd(callback: () => void): void {
    this._onDragEndCallback = callback;
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
