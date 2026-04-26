import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Camera,
  Vector3,
  Color3,
  Color4,
} from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';

export interface SceneBundle {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
}

/**
 * Boots the Babylon.js engine, creates a scene with an orthographic
 * angled camera (2.5D city-builder perspective) and a soft ambient light.
 */
export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);

  scene.clearColor = new Color4(0.13, 0.18, 0.24, 1);

  // --- Camera ---
  // ArcRotateCamera gives an isometric-style angle in orthographic mode.
  // alpha = -π/4  → looking from the NE corner (SE-facing grid)
  // beta  = π/3.5 → ~51° from vertical (classic city-builder tilt)
  const mapCenter = new Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  const camera = new ArcRotateCamera('camera', -Math.PI / 4, Math.PI / 3.5, 100, mapCenter, scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 200;

  const applyOrtho = (): void => {
    const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    const halfH = 44; // half-height in world units — fits 64-tile map with margin
    camera.orthoBottom = -halfH;
    camera.orthoTop = halfH;
    camera.orthoLeft = -halfH * aspect;
    camera.orthoRight = halfH * aspect;
  };

  applyOrtho();
  engine.onResizeObservable.add(applyOrtho);
  window.addEventListener('resize', () => {
    engine.resize();
    applyOrtho();
  });

  // --- Lighting ---
  // HemisphericLight gives even top-down illumination; perfectly flat for terrain.
  const light = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  light.intensity = 1.0;
  light.groundColor = new Color3(0.35, 0.35, 0.35);

  // --- Render loop ---
  engine.runRenderLoop(() => scene.render());

  return { engine, scene, camera };
}
