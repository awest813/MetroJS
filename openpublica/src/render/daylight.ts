import { Color3, Color4, Vector3 } from '@babylonjs/core';
import type { DirectionalLight, HemisphericLight, Scene } from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';

export interface DaylightLights {
  scene: Scene;
  sun: DirectionalLight;
  fill: HemisphericLight;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Aim the existing sun/fill/fog. Does not touch simulation.
 */
export function applyDaylight(lights: DaylightLights, day: number): void {
  const t = Math.max(0, Math.min(1, day));
  const noon = Math.sin(t * Math.PI);
  const azimuth = -0.35 + t * 2.2;
  const height = 0.28 + noon * 1.05;
  const dir = new Vector3(Math.cos(azimuth), -height, Math.sin(azimuth));
  dir.normalize();
  lights.sun.direction = dir;
  const center = new Vector3(MAP_SIZE / 2, 8, MAP_SIZE / 2);
  lights.sun.position = center.add(dir.scale(-72));
  lights.sun.intensity = 0.58 + noon * 0.68;
  lights.sun.diffuse = new Color3(
    1,
    lerp(0.72, 0.96, noon),
    lerp(0.48, 0.88, noon),
  );
  lights.fill.intensity = 0.42 + noon * 0.48;
  lights.fill.diffuse = new Color3(
    lerp(0.70, 0.82, noon),
    lerp(0.68, 0.88, noon),
    lerp(0.62, 0.78, noon),
  );

  const sky = new Color3(
    lerp(0.28, 0.42, noon),
    lerp(0.34, 0.58, noon),
    lerp(0.48, 0.74, noon),
  );
  lights.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  lights.scene.fogColor = sky;
  lights.scene.ambientColor = new Color3(
    lerp(0.10, 0.18, noon),
    lerp(0.11, 0.20, noon),
    lerp(0.14, 0.24, noon),
  );
}
