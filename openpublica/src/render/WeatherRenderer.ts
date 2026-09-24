import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { ArcRotateCamera, Material, Scene } from '@babylonjs/core';
import type { Weather } from '../sim/weather';
import { applyDaylight, type DaylightLights } from './daylight';
import { SnowCoverPlugin } from './snowCover';
import { CLEAR_LOOK, blendLooks, weatherLook, type WeatherLook } from './weatherLook';

/** Seconds a change of weather takes to roll in. */
const TRANSITION_SECONDS = 3;

/** Materials snow settles on: ground, lawns and roofs, tree tops. Roads stay plowed. */
const SNOW_MATERIALS = ['terrain-mat', 'terrain-skirt-mat', 'world-ground-mat', 'bld-kit', 'bld-kit-warning', 'veg-canopy'];

/** Falling rain and snow per tile of sky per second, at full strength. */
const RAIN_PER_TILE = 0.6;
const SNOW_PER_TILE = 0.07;

/** Height above the camera target that rain and snow start from. */
const FALL_HEIGHT = 18;

/**
 * The month's weather on screen: the sky, fog, sun, and shadows it brings
 * (on top of the Dawn–Dusk slider), rain and snow around the camera, snow on
 * the ground and roofs, and lightning in a storm. Visual only; the sim owns
 * what weather it is. Changes roll in over a few seconds. Low quality drops
 * the falling rain and snow and the lightning; lightning also stays off when
 * the system asks for reduced motion.
 */
export class WeatherRenderer {
  private readonly _scene: Scene;
  private readonly _lights: DaylightLights;
  private readonly _camera: ArcRotateCamera;
  private readonly _rain: ParticleSystem;
  private readonly _snow: ParticleSystem;
  private readonly _snowPlugins = new Map<Material, SnowCoverPlugin>();
  private readonly _reducedMotion: boolean;
  private _day: number;
  private _from: WeatherLook = CLEAR_LOOK;
  private _to: WeatherLook = CLEAR_LOOK;
  private _t = 1;
  private _look: WeatherLook = CLEAR_LOOK;
  private _effects = true;
  private _baseFill = 0;
  private _flash = 0;
  private _untilFlash = 4;
  private _untilScan = 0;
  /** Rain and snow shaders still to compile (see {@link update}). */
  private _cold = true;
  /** Called on each lightning flash (the app plays thunder). */
  onLightning: (() => void) | null = null;

  constructor(scene: Scene, lights: DaylightLights, camera: ArcRotateCamera, day: number) {
    this._scene = scene;
    this._lights = lights;
    this._camera = camera;
    this._day = day;
    this._reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    this._rain = this._makeRain();
    this._snow = this._makeSnow();
    this._apply();
  }

  /** The look now on screen (mid-transition too). */
  get look(): WeatherLook {
    return this._look;
  }

  /** Dawn–Dusk slider. */
  setDay(day: number): void {
    this._day = day;
    this._apply();
  }

  /** Roll in a month's weather (at once on load). The same look again is a no-op. */
  setWeather(weather: Weather, instant = false): void {
    const next = weatherLook(weather);
    if (!instant && sameLook(next, this._to)) return;
    if (instant) {
      this._from = next;
      this._t = 1;
      this._look = next;
    } else {
      this._from = this._look;
      this._t = 0;
    }
    this._to = next;
    this._apply();
  }

  /** Falling rain and snow, and lightning (High quality). */
  setEffects(on: boolean): void {
    this._effects = on;
    this._syncParticles();
  }

  /** Per frame: transitions, the rain around the camera, lightning. */
  update(dtSeconds: number): void {
    // Compile the rain and snow shaders while the city loads: asking whether
    // a system is ready builds its effect once its shader code has arrived.
    // Left to the first wet month, the compile stalled that frame (0.4 s in
    // software rendering).
    if (this._cold) this._cold = !(this._rain.isReady() && this._snow.isReady());
    const dt = Math.max(0, Math.min(0.25, dtSeconds));
    if (this._t < 1) {
      this._t = Math.min(1, this._t + dt / TRANSITION_SECONDS);
      this._look = blendLooks(this._from, this._to, this._t);
      this._apply();
    }
    this._untilScan -= dt;
    if (this._untilScan <= 0) {
      this._untilScan = 2;
      this._attachSnow();
    }
    this._followCamera();
    this._lightning(dt);
  }

  private _apply(): void {
    this._attachSnow();
    applyDaylight(this._lights, this._day, this._look);
    this._baseFill = this._lights.fill.intensity;
    for (const plugin of this._snowPlugins.values()) plugin.amount = this._look.snowCover;
    this._syncParticles();
  }

  /** Put the snow plugin on any snow material not yet carrying it (rebuilds make new ones). */
  private _attachSnow(): void {
    for (const name of SNOW_MATERIALS) {
      const mat = this._scene.getMaterialByName(name);
      if (!mat || this._snowPlugins.has(mat)) continue;
      const plugin = new SnowCoverPlugin(mat);
      plugin.amount = this._look.snowCover;
      this._snowPlugins.set(mat, plugin);
      mat.onDisposeObservable.addOnce(() => this._snowPlugins.delete(mat));
    }
  }

  private _syncParticles(): void {
    const area = this._fallArea();
    const rain = this._effects ? this._look.rain : 0;
    const snow = this._effects ? this._look.snow : 0;
    this._rain.emitRate = rain * RAIN_PER_TILE * area;
    this._snow.emitRate = snow * SNOW_PER_TILE * area;
    if (rain > 0.01 && !this._rain.isStarted()) this._rain.start();
    if (rain <= 0.01 && this._rain.isStarted()) this._rain.stop();
    if (snow > 0.01 && !this._snow.isStarted()) this._snow.start();
    if (snow <= 0.01 && this._snow.isStarted()) this._snow.stop();
  }

  /** Half-width of the square of sky that rain falls from: about what the camera sees. */
  private _halfSpan(): number {
    return Math.max(10, Math.min(40, this._camera.radius * 0.55));
  }

  private _fallArea(): number {
    const half = this._halfSpan();
    return 4 * half * half;
  }

  private _followCamera(): void {
    if (!this._rain.isStarted() && !this._snow.isStarted()) return;
    const target = this._camera.target;
    const half = this._halfSpan();
    for (const ps of [this._rain, this._snow]) {
      const at = ps.emitter as Vector3;
      at.copyFrom(target);
      ps.minEmitBox.set(-half, FALL_HEIGHT - 3, -half);
      ps.maxEmitBox.set(half, FALL_HEIGHT + 3, half);
    }
    const area = 4 * half * half;
    this._rain.emitRate = (this._effects ? this._look.rain : 0) * RAIN_PER_TILE * area;
    this._snow.emitRate = (this._effects ? this._look.snow : 0) * SNOW_PER_TILE * area;
  }

  private _lightning(dt: number): void {
    const allowed = this._effects && this._look.lightning && !this._reducedMotion;
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt / 0.18);
      this._lights.fill.intensity = this._baseFill + this._flash * 1.4;
      if (this._flash === 0) this._lights.fill.intensity = this._baseFill;
      return;
    }
    if (!allowed) return;
    this._untilFlash -= dt;
    if (this._untilFlash > 0) return;
    this._untilFlash = 4 + Math.random() * 7;
    this._flash = 1;
    this.onLightning?.();
  }

  private _makeRain(): ParticleSystem {
    const ps = new ParticleSystem('weather-rain', 4000, this._scene);
    ps.particleTexture = _streakTexture(this._scene);
    ps.emitter = new Vector3();
    ps.minEmitBox = new Vector3();
    ps.maxEmitBox = new Vector3();
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.isBillboardBased = true;
    ps.color1 = new Color4(0.72, 0.78, 0.88, 0.5);
    ps.color2 = new Color4(0.62, 0.68, 0.80, 0.35);
    ps.colorDead = new Color4(0.62, 0.68, 0.80, 0);
    ps.minSize = 0.6;
    ps.maxSize = 0.8;
    ps.minScaleX = 0.1;
    ps.maxScaleX = 0.14;
    ps.minScaleY = 1;
    ps.maxScaleY = 1.4;
    ps.direction1 = new Vector3(-0.12, -1, -0.05);
    ps.direction2 = new Vector3(-0.08, -1, 0.05);
    ps.minEmitPower = 24;
    ps.maxEmitPower = 30;
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 0.75;
    ps.gravity = Vector3.Zero();
    ps.updateSpeed = 1 / 60;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    return ps;
  }

  private _makeSnow(): ParticleSystem {
    const ps = new ParticleSystem('weather-snow', 4000, this._scene);
    ps.particleTexture = _flakeTexture(this._scene);
    ps.emitter = new Vector3();
    ps.minEmitBox = new Vector3();
    ps.maxEmitBox = new Vector3();
    ps.color1 = new Color4(1, 1, 1, 0.95);
    ps.color2 = new Color4(0.92, 0.95, 1, 0.8);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.minSize = 0.08;
    ps.maxSize = 0.16;
    ps.direction1 = new Vector3(-0.35, -1, -0.25);
    ps.direction2 = new Vector3(0.3, -1, 0.3);
    ps.minEmitPower = 1.5;
    ps.maxEmitPower = 2.2;
    ps.minLifeTime = 8;
    ps.maxLifeTime = 11;
    ps.minAngularSpeed = -1;
    ps.maxAngularSpeed = 1;
    ps.gravity = Vector3.Zero();
    ps.updateSpeed = 1 / 60;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    return ps;
  }
}

function sameLook(a: WeatherLook, b: WeatherLook): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** A thin vertical streak, bright in the middle. */
function _streakTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('weather-rain-tex', { width: 8, height: 64 }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 8, 64);
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(1, 0, 6, 64);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

/** A soft round flake. */
function _flakeTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('weather-snow-tex', { width: 32, height: 32 }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 32, 32);
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}
