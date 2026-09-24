import { FxaaPostProcess, SSAO2RenderingPipeline, type Camera, type Scene } from '@babylonjs/core';

/**
 * Screen-space ambient occlusion, tuned on the test cities (Gap AC): soft
 * shade where buildings and trees meet the ground and each other.
 *
 * - `epsilon` well above Babylon's 0.02 keeps flat lawns and streets from
 *   shading themselves: at 0.02 a street view darkened 7 in 10 sample points,
 *   most of them open ground.
 * - A radius of half a tile reaches from a wall to the lawn beside it, not
 *   across the street.
 * - The occlusion runs at half resolution; the blur and the combine run at
 *   full.
 * - The scene now draws off-screen, without the canvas's antialiasing.
 *   Multisampling the prepass's targets put 63–82% on the frame in
 *   SwiftShader, so FXAA smooths the edges instead, for next to nothing.
 * - It fades out by 120 units, past the city at the overview's distance.
 */
const SSAO_RATIO = 0.5;
const SSAO_RADIUS = 0.5;
const SSAO_STRENGTH = 2.0;
const SSAO_EPSILON = 0.15;
const SSAO_SAMPLES = 16;
const SSAO_MAX_Z = 120;

/**
 * Builds and drops the pipeline. It renders through Babylon's prepass
 * (WebGL2): no second geometry pass, a few more draw calls, and full-screen
 * work that scales with the canvas.
 */
export class AmbientOcclusion {
  private _pipeline: SSAO2RenderingPipeline | null = null;
  private _fxaa: FxaaPostProcess | null = null;

  constructor(
    private readonly _scene: Scene,
    private readonly _camera: Camera,
  ) {}

  /** False where the browser lacks what it needs (WebGL2). */
  static get supported(): boolean {
    return SSAO2RenderingPipeline.IsSupported;
  }

  get enabled(): boolean {
    return this._pipeline !== null;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    if (!on) {
      this._fxaa?.dispose(this._camera);
      this._fxaa = null;
      this._pipeline!.dispose();
      this._pipeline = null;
      // Nothing else draws through the prepass: stop writing its extra targets.
      this._scene.disablePrePassRenderer();
      return;
    }
    if (!AmbientOcclusion.supported) return;
    const pipeline = new SSAO2RenderingPipeline(
      'ambient-occlusion',
      this._scene,
      { ssaoRatio: SSAO_RATIO, blurRatio: 1 },
      [this._camera],
      false,
    );
    pipeline.radius = SSAO_RADIUS;
    pipeline.totalStrength = SSAO_STRENGTH;
    pipeline.epsilon = SSAO_EPSILON;
    pipeline.samples = SSAO_SAMPLES;
    pipeline.maxZ = SSAO_MAX_Z;
    pipeline.expensiveBlur = true;
    this._pipeline = pipeline;
    // Attached after the pipeline, so it runs last, on the shaded frame.
    this._fxaa = new FxaaPostProcess('ambient-occlusion-fxaa', 1.0, this._camera);
  }
}
