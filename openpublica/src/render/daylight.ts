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

function lerp3(a: Color3, b: Color3, t: number): Color3 {
  return new Color3(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

/**
 * Aim the existing sun/fill/fog. Does not touch simulation.
 * 0 = dawn (warm east), 0.5 = noon, 1 = dusk (cool west). Never pitch-black.
 */
export function applyDaylight(lights: DaylightLights, day: number): void {
  const t = Math.max(0, Math.min(1, day));
  const noon = Math.sin(t * Math.PI);
  const dusk = t;
  const azimuth = -0.55 + t * 2.6;
  const height = 0.22 + noon * 1.15;
  const dir = new Vector3(Math.cos(azimuth), -height, Math.sin(azimuth));
  dir.normalize();
  lights.sun.direction = dir;
  const center = new Vector3(MAP_SIZE / 2, 8, MAP_SIZE / 2);
  lights.sun.position = center.add(dir.scale(-72));
  lights.sun.intensity = 0.48 + noon * 0.82;
  const dawnSun = new Color3(1.0, 0.62, 0.32);
  const noonSun = new Color3(1.0, 0.96, 0.88);
  const duskSun = new Color3(1.0, 0.55, 0.42);
  lights.sun.diffuse = lerp3(lerp3(dawnSun, noonSun, noon), duskSun, dusk * (1 - noon));
  lights.fill.intensity = 0.32 + noon * 0.55;
  lights.fill.diffuse = new Color3(
    lerp(0.78, 0.82, noon),
    lerp(0.55, 0.88, noon),
    lerp(0.42, 0.78, noon),
  );
  lights.fill.groundColor = new Color3(
    lerp(0.22, 0.32, noon),
    lerp(0.16, 0.38, noon),
    lerp(0.18, 0.28, noon),
  );

  const dawnSky = new Color3(0.55, 0.38, 0.32);
  const noonSky = new Color3(0.42, 0.58, 0.74);
  const duskSky = new Color3(0.28, 0.30, 0.52);
  const sky = lerp3(lerp3(dawnSky, noonSky, noon), duskSky, dusk * (1 - noon * 0.35));
  lights.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  lights.scene.fogColor = sky;
  lights.scene.ambientColor = new Color3(
    lerp(0.16, 0.18, noon),
    lerp(0.10, 0.20, noon),
    lerp(0.12, 0.24, noon),
  );
}
