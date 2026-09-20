import {
  ArcRotateCamera,
  ArcRotateCameraPointersInput,
  Camera,
  Vector3,
} from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';

/** Named camera presets (keys 1 / 2 / 3). */
export type CameraViewMode = 'iso' | 'top' | 'orbit';

const MAP_CENTER = new Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);

const ISO_ALPHA = -Math.PI / 4;
const ISO_BETA = Math.PI / 3.5;
const ISO_RADIUS = 78;

const TOP_ALPHA = -Math.PI / 2;
const TOP_BETA = 0.12;
const TOP_RADIUS = 92;

const ORBIT_ALPHA = -Math.PI / 3;
const ORBIT_BETA = Math.PI / 2.45;
const ORBIT_RADIUS = 52;

/**
 * Perspective orbit camera with city-builder input:
 * - Left mouse paints tiles (not bound to the camera).
 * - Middle-drag or Alt/Space + left-drag orbits.
 * - Right-drag pans on the XZ plane.
 * - Wheel zooms.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  private _mode: CameraViewMode = 'iso';
  private _spaceDown = false;
  private _altDown = false;
  private _onModeChange: ((mode: CameraViewMode) => void) | undefined;

  constructor(canvas: HTMLCanvasElement, camera: ArcRotateCamera) {
    this.camera = camera;

    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.fov = 0.85;
    camera.minZ = 0.1;
    camera.maxZ = 500;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 180;
    camera.lowerBetaLimit = 0.08;
    camera.upperBetaLimit = Math.PI / 2.12;
    camera.allowUpsideDown = false;
    camera.panningAxis = new Vector3(1, 0, 1);
    camera.panningSensibility = 80;
    camera.wheelPrecision = 6;
    camera.pinchPrecision = 24;
    camera.angularSensibilityX = 1200;
    camera.angularSensibilityY = 1200;
    camera.inertia = 0.8;
    camera.panningInertia = 0.7;
    camera.setTarget(MAP_CENTER);

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });

    camera.attachControl(canvas, false);
    this._configurePointers();
    this.applyPreset('iso');

    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    window.addEventListener('keydown', (event) => {
      if (isTypingTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        this._spaceDown = true;
        this._configurePointers();
        return;
      }

      if (event.key === 'Alt' || event.altKey) {
        this._altDown = true;
        this._configurePointers();
      }

      if (event.key === '1') this.applyPreset('iso');
      if (event.key === '2') this.applyPreset('top');
      if (event.key === '3') this.applyPreset('orbit');
      if (event.key === 'Home') {
        event.preventDefault();
        this.resetView();
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        this._spaceDown = false;
        this._configurePointers();
      }
      if (event.key === 'Alt') {
        this._altDown = false;
        this._configurePointers();
      }
    });

    window.addEventListener('blur', () => {
      this._spaceDown = false;
      this._altDown = false;
      this._configurePointers();
    });
  }

  get mode(): CameraViewMode {
    return this._mode;
  }

  /** True while the player is orbiting with left mouse (Alt or Space). */
  isOrbitModifierHeld(event?: PointerEvent): boolean {
    const alt = event?.altKey === true;
    return this._spaceDown || this._altDown || alt;
  }

  /** Tools must ignore this pointer event (wrong button or orbit modifier). */
  shouldIgnoreToolPointer(event: PointerEvent): boolean {
    if (event.pointerType === 'mouse' || event.pointerType === '' || event.pointerType === 'pen') {
      if (event.type !== 'pointermove' && event.button !== 0 && event.button !== -1) {
        return true;
      }
      if (event.type === 'pointermove' && (event.buttons & 1) === 0) {
        return true;
      }
    }
    return this.isOrbitModifierHeld(event);
  }

  onModeChange(callback: (mode: CameraViewMode) => void): void {
    this._onModeChange = callback;
  }

  applyPreset(mode: CameraViewMode): void {
    this._mode = mode;
    this.camera.setTarget(MAP_CENTER);

    switch (mode) {
      case 'iso':
        this.camera.alpha = ISO_ALPHA;
        this.camera.beta = ISO_BETA;
        this.camera.radius = ISO_RADIUS;
        break;
      case 'top':
        this.camera.alpha = TOP_ALPHA;
        this.camera.beta = TOP_BETA;
        this.camera.radius = TOP_RADIUS;
        break;
      case 'orbit':
        this.camera.alpha = ORBIT_ALPHA;
        this.camera.beta = ORBIT_BETA;
        this.camera.radius = ORBIT_RADIUS;
        break;
    }

    this._onModeChange?.(mode);
  }

  /** Iso, framed on the whole map. */
  resetView(): void {
    this.applyPreset('iso');
  }

  /** Pan the look-at point to a tile without changing orbit angles. */
  lookAtTile(x: number, y: number): void {
    this.camera.setTarget(new Vector3(x + 0.5, 0, y + 0.5));
  }

  private _configurePointers(): void {
    const attached = this.camera.inputs.attached.pointers;
    if (!(attached instanceof ArcRotateCameraPointersInput)) return;

    attached.buttons = this._spaceDown || this._altDown ? [0, 1] : [1];
    attached.panningSensibility = 80;
  }
}
