import { Color3, Color4, Vector3 } from '@babylonjs/core';
import type { DirectionalLight, HemisphericLight, Scene } from '@babylonjs/core';
import { MAP_SIZE } from '../data/constants';
import { daylightPalette, type Rgb } from './skyColors';
import type { SkyDome } from './SkyDome';

export interface DaylightLights {
  scene: Scene;
  sun: DirectionalLight;
  fill: HemisphericLight;
  sky?: SkyDome;
}

function rgb(c: Rgb): Color3 {
  return new Color3(c.r, c.g, c.b);
}

/**
 * Aim the existing sun/fill/fog/sky. Does not touch simulation.
 * 0 = dawn (warm east), 0.5 = noon, 1 = dusk (cool west). Never pitch-black.
 */
export function applyDaylight(lights: DaylightLights, day: number): void {
  const pal = daylightPalette(day);
  const dir = new Vector3(Math.cos(pal.azimuth), -pal.height, Math.sin(pal.azimuth));
  dir.normalize();
  lights.sun.direction = dir;
  const center = new Vector3(MAP_SIZE / 2, 8, MAP_SIZE / 2);
  lights.sun.position = center.add(dir.scale(-72));
  lights.sun.intensity = pal.sunIntensity;
  lights.sun.diffuse = rgb(pal.sun);
  lights.fill.intensity = pal.fillIntensity;
  lights.fill.diffuse = rgb(pal.fill);
  lights.fill.groundColor = rgb(pal.fillGround);

  const sky = rgb(pal.zenith);
  lights.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  lights.scene.fogColor = sky;
  lights.scene.ambientColor = rgb(pal.ambient);
  lights.sky?.setSky(pal.zenith, pal.horizon);
}
