import {
  Scene,
  ParticleSystem,
  DynamicTexture,
  Vector3,
  Color4,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import type { HeightField } from '../sim/HeightField';
import { TILE_SIZE } from '../data/constants';
import { POWER_PLANT_SMOKE } from './vegetationLayout';
import { buildingFacing, rotateOffset } from './buildingFacing';

/**
 * Soft puff smoke from power-plant stacks. Visual only.
 */
export class SmokeRenderer {
  private readonly _scene: Scene;
  private readonly _texture: DynamicTexture;
  private readonly _systems: ParticleSystem[] = [];
  private _heights: HeightField | null = null;
  private _enabled = true;

  constructor(scene: Scene) {
    this._scene = scene;
    this._texture = _makePuffTexture(scene);
  }

  setHeightField(heights: HeightField): void {
    this._heights = heights;
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    for (const ps of this._systems) {
      if (on) ps.start();
      else ps.stop();
    }
  }

  rebuild(map: CityMap, heights: HeightField): void {
    this._heights = heights;
    this._disposeAll();
    map.forEach((tile) => {
      if (tile.buildingId !== 'small_power_plant') return;
      const groundY = this._heights?.footing(tile.x, tile.y) ?? 0;
      const ox = tile.x * TILE_SIZE + TILE_SIZE / 2;
      const oz = tile.y * TILE_SIZE + TILE_SIZE / 2;
      // The plant turns to face its street; its stacks turn with it.
      const facing = buildingFacing(map, tile.x, tile.y);
      for (const stack of POWER_PLANT_SMOKE) {
        const at = rotateOffset(stack.x, stack.z, facing);
        this._systems.push(this._emitter(
          new Vector3(ox + at.dx, groundY + stack.y, oz + at.dz),
        ));
      }
    });
    if (!this._enabled) {
      for (const ps of this._systems) ps.stop();
    }
  }

  private _emitter(origin: Vector3): ParticleSystem {
    const ps = new ParticleSystem(`smoke-${this._systems.length}`, 80, this._scene);
    ps.particleTexture = this._texture;
    ps.emitter = origin;
    ps.minEmitBox = new Vector3(-0.03, 0, -0.03);
    ps.maxEmitBox = new Vector3(0.03, 0.02, 0.03);
    ps.color1 = new Color4(0.22, 0.22, 0.24, 0.55);
    ps.color2 = new Color4(0.40, 0.40, 0.42, 0.28);
    ps.colorDead = new Color4(0.55, 0.55, 0.58, 0);
    ps.minSize = 0.22;
    ps.maxSize = 0.58;
    ps.minLifeTime = 1.6;
    ps.maxLifeTime = 3.2;
    ps.emitRate = 28;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, 0.02, 0);
    ps.direction1 = new Vector3(-0.08, 0.9, -0.08);
    ps.direction2 = new Vector3(0.08, 1.2, 0.08);
    ps.minEmitPower = 0.12;
    ps.maxEmitPower = 0.28;
    ps.updateSpeed = 0.012;
    ps.isBillboardBased = true;
    ps.start();
    return ps;
  }

  private _disposeAll(): void {
    for (const ps of this._systems) {
      ps.stop();
      ps.dispose(false);
    }
    this._systems.length = 0;
  }
}

function _makePuffTexture(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('smoke-puff', { width: size, height: size }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 3, size / 2, size / 2, size / 2 - 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}
