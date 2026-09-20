import { PBRMaterial, Color3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/**
 * Untextured metallic-roughness surfaces. No Micropolis sheets.
 * Environment intensity stays low so missing IBL does not black out the city.
 */
export function coloredPbr(
  name: string,
  scene: Scene,
  albedo: Color3,
  roughness: number,
  metallic = 0,
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = albedo;
  mat.metallic = metallic;
  mat.roughness = roughness;
  mat.environmentIntensity = 0.22;
  mat.directIntensity = 1.15;
  mat.specularIntensity = 0.55;
  return mat;
}

export function vertexColorPbr(name: string, scene: Scene, roughness: number): PBRMaterial {
  return coloredPbr(name, scene, Color3.White(), roughness, 0);
}
