import { Scene, PointerEventTypes, type PickingInfo } from '@babylonjs/core';
import type { TileCoord } from '../data/types';
import { MAP_SIZE } from '../data/constants';
import type { CameraController } from './CameraController';
import { TERRAIN_MESH_NAME } from './TerrainRenderer';
import { WATER_MESH_NAME } from './WaterRenderer';
import { refinePickOnDecks } from './deckPick';

/** Keys held during a pick. Shift paints roads freehand instead of as a line. */
export interface PickModifiers {
  readonly shift: boolean;
}

/**
 * Translates Babylon.js pointer events into tile grid coordinates.
 *
 * Picks the heightfield or water surface so hills and basins map to the
 * correct tile, then lets a bridge deck above that hit claim the click.
 * Buildings are ignored so they do not steal tool placement.
 */
export class TilePicker {
  private readonly _scene: Scene;
  private readonly _camera: CameraController;
  private _onPickCallback: ((coord: TileCoord, via: 'down' | 'drag', mods: PickModifiers) => void) | undefined;
  private _onHoverCallback: ((coord: TileCoord | null) => void) | undefined;
  private _onDragEndCallback: (() => void) | undefined;
  private _isDragging = false;
  private _hoverKey = '';
  private _deckTopAt: (x: number, y: number) => number | null = () => null;

  constructor(scene: Scene, camera: CameraController) {
    this._scene = scene;
    this._camera = camera;

    scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (this._camera.shouldIgnoreToolPointer(event)) return;
          this._isDragging = true;
          this._handlePick('down', { shift: event.shiftKey });
          break;

        case PointerEventTypes.POINTERMOVE:
          if (this._isDragging) {
            if (this._camera.shouldIgnoreToolPointer(event)) return;
            this._handlePick('drag', { shift: event.shiftKey });
          } else if (!this._camera.shouldIgnoreHover(event)) {
            this._handleHover();
          }
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

  onPick(callback: (coord: TileCoord, via: 'down' | 'drag', mods: PickModifiers) => void): void {
    this._onPickCallback = callback;
  }

  onHover(callback: (coord: TileCoord | null) => void): void {
    this._onHoverCallback = callback;
  }

  onDragEnd(callback: () => void): void {
    this._onDragEndCallback = callback;
  }

  /** Deck surface height for bridge tiles (null elsewhere), so clicks land on the deck. */
  setDeckTop(deckTopAt: (x: number, y: number) => number | null): void {
    this._deckTopAt = deckTopAt;
  }

  private _pickTile(): TileCoord | null {
    const result: PickingInfo = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => mesh.name === TERRAIN_MESH_NAME || mesh.name === WATER_MESH_NAME,
    );
    if (!result.hit || !result.pickedPoint) return null;
    const origin = result.ray?.origin ?? this._scene.activeCamera?.globalPosition;
    if (!origin) {
      return { x: Math.floor(result.pickedPoint.x), y: Math.floor(result.pickedPoint.z) };
    }
    return refinePickOnDecks(origin, result.pickedPoint, this._deckTopAt);
  }

  private _handlePick(via: 'down' | 'drag', mods: PickModifiers): void {
    const tile = this._pickTile();
    if (!tile) return;
    const { x, y } = tile;

    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
      this._onPickCallback?.({ x, y }, via, mods);
    }
  }

  private _handleHover(): void {
    const tile = this._pickTile();
    if (!tile) {
      if (this._hoverKey !== '') {
        this._hoverKey = '';
        this._onHoverCallback?.(null);
      }
      return;
    }
    const { x, y } = tile;
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
      if (this._hoverKey !== '') {
        this._hoverKey = '';
        this._onHoverCallback?.(null);
      }
      return;
    }
    const key = `${x},${y}`;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    this._onHoverCallback?.({ x, y });
  }
}
