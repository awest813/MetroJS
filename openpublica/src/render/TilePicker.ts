import { Scene, PointerEventTypes } from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { MAP_SIZE } from '../data/constants';
import type { CameraController } from './CameraController';
import { TERRAIN_MESH_NAME } from './TerrainRenderer';
import { WATER_MESH_NAME } from './WaterRenderer';

/**
 * Translates Babylon.js pointer events into tile grid coordinates.
 *
 * Picks the heightfield or water surface so hills and basins map to the
 * correct tile. Buildings are ignored so they do not steal tool placement.
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

  onPick(callback: (coord: TileCoord) => void): void {
    this._onPickCallback = callback;
  }

  onDragEnd(callback: () => void): void {
    this._onDragEndCallback = callback;
  }

  private _handlePick(): void {
    const result = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => mesh.name === TERRAIN_MESH_NAME || mesh.name === WATER_MESH_NAME,
    );
    if (!result.hit || !result.pickedPoint) return;

    const x = Math.floor(result.pickedPoint.x);
    const y = Math.floor(result.pickedPoint.z);

    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
      this._onPickCallback?.({ x, y });
    }
  }
}
