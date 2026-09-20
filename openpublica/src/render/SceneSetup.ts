import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color3,
  Color4,
} from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';

export interface SceneBundle {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  sun: DirectionalLight;
  shadowGenerator: ShadowGenerator;
}

/**
 * Boots the Babylon.js engine with a perspective city camera, sun + fill
 * lighting, cascaded-quality shadows, fog, and a dark world ground skirt.
 * Camera input (orbit vs paint) is wired by CameraController.
 */
export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);

  const sky = new Color3(0.42, 0.58, 0.74);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = sky;
  scene.fogStart = 70;
  scene.fogEnd = 220;
  scene.ambientColor = new Color3(0.18, 0.20, 0.24);

  const mapCenter = new Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  const camera = new ArcRotateCamera('camera', -Math.PI / 4, Math.PI / 3.5, 78, mapCenter, scene);

  window.addEventListener('resize', () => engine.resize());
  engine.onResizeObservable.add(() => engine.resize());

  const sun = new DirectionalLight('sun', new Vector3(-0.55, -1.15, -0.4), scene);
  sun.position = new Vector3(MAP_SIZE * 0.95, 55, MAP_SIZE * 0.9);
  sun.intensity = 1.15;
  sun.diffuse = new Color3(1.0, 0.96, 0.88);
  sun.specular = new Color3(0.45, 0.42, 0.36);
  sun.autoCalcShadowZBounds = true;
  sun.autoUpdateExtends = true;

  const fill = new HemisphericLight('fill', new Vector3(0.15, 1, 0.1), scene);
  fill.intensity = 0.42;
  fill.diffuse = new Color3(0.72, 0.80, 0.92);
  fill.groundColor = new Color3(0.22, 0.24, 0.22);

  const shadowGenerator = new ShadowGenerator(2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.darkness = 0.38;
  shadowGenerator.bias = 0.0008;
  shadowGenerator.normalBias = 0.02;

  const ground = MeshBuilder.CreateGround(
    'world-ground',
    { width: MAP_SIZE * 6, height: MAP_SIZE * 6 },
    scene,
  );
  ground.position = new Vector3(MAP_SIZE / 2, -0.9, MAP_SIZE / 2);
  ground.isPickable = false;
  ground.receiveShadows = true;
  const groundMat = new StandardMaterial('world-ground-mat', scene);
  groundMat.diffuseColor = new Color3(0.11, 0.16, 0.14);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  engine.runRenderLoop(() => scene.render());

  return { engine, scene, camera, sun, shadowGenerator };
}
