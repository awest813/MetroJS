import { Plane, Scene, Vector3, PointerEventTypes } from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { MAP_SIZE } from '../data/constants';
import type { CameraController } from './CameraController';

const GROUND_PLANE = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

/**
 * Translates Babylon.js pointer events into tile grid coordinates.
 *
 * Intersects the picking ray with the Y=0 ground plane so buildings and
 * overlays do not steal tool placement. Camera orbit/pan buttons are ignored
 * via CameraController.shouldIgnoreToolPointer.
 */
export class TilePicker {
  private readonly _scene: Scene;
  private readonly _camera: CameraController;
  private _onPickCallback: ((coord: TileCoord) => void) | undefined;
  private _onDragEndCallback: (() => void) | undefined;
  private _isDragging = false;

  constructor(scene: Scene, camera: CameraController) {
    this._scene = scene;
    this._camera = camera;

    scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (this._camera.shouldIgnoreToolPointer(event)) return;
          this._isDragging = true;
          this._handlePick();
          break;

        case PointerEventTypes.POINTERMOVE:
          if (!this._isDragging) return;
          if (this._camera.shouldIgnoreToolPointer(event)) return;
          this._handlePick();
          break;

        case PointerEventTypes.POINTERUP:
          if (this._isDragging) {
            this._isDragging = false;
            this._onDragEndCallback?.();
          }
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
    const ray = this._scene.createPickingRay(
      this._scene.pointerX,
      this._scene.pointerY,
      null,
      this._scene.activeCamera,
    );
    const distance = ray.intersectsPlane(GROUND_PLANE);
    if (distance === null || distance < 0) return;

    const point = ray.origin.add(ray.direction.scale(distance));
    const x = Math.floor(point.x);
    const y = Math.floor(point.z);

    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
      this._onPickCallback?.({ x, y });
    }
  }
}
