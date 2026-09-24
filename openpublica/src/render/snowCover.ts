import { MaterialPluginBase } from '@babylonjs/core';
import type { Material, UniformBuffer } from '@babylonjs/core';

/** Colour of lying snow (linear-ish albedo). */
const SNOW = '0.86, 0.89, 0.93';

/**
 * Lays snow on flat, upward faces of a PBR material: ground, lawns, roofs.
 * Walls and steep banks stay bare, and roads (which keep their own material)
 * read as plowed. One uniform, `snowAmount`, 0–1.
 */
export class SnowCoverPlugin extends MaterialPluginBase {
  amount = 0;

  constructor(material: Material) {
    super(material, 'SnowCover', 200, { SNOWCOVER: false });
    this._enable(true);
  }

  prepareDefines(defines: Record<string, unknown>): void {
    defines.SNOWCOVER = true;
  }

  getUniforms(): { ubo: Array<{ name: string; size: number; type: string }>; fragment: string } {
    return {
      ubo: [{ name: 'snowAmount', size: 1, type: 'float' }],
      fragment: `#ifdef SNOWCOVER
uniform float snowAmount;
#endif`,
    };
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('snowAmount', this.amount);
  }

  getClassName(): string {
    return 'SnowCoverPlugin';
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `#ifdef SNOWCOVER
surfaceAlbedo = mix(surfaceAlbedo, vec3(${SNOW}), snowAmount * smoothstep(0.55, 0.85, normalW.y));
#endif`,
    };
  }
}
