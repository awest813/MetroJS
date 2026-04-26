import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import { TILE_SIZE } from '../data/constants';

// ── Constants ──────────────────────────────────────────────────────────────────

/** trafficPressure threshold above which a road tile may spawn a car. */
const HIGH_PRESSURE_THRESHOLD = 6;

/**
 * Probability (0–1) that a qualifying road tile actually gets a car.
 * Keeps the total number of meshes manageable on large maps.
 */
const CAR_SPAWN_CHANCE = 0.4;

/** Car mesh dimensions (world units). */
const CAR_WIDTH  = 0.20;
const CAR_HEIGHT = 0.12;
const CAR_DEPTH  = 0.35;

/** Y offset — sit the car on top of the road surface. */
const CAR_Y = CAR_HEIGHT / 2 + 0.01;

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Decorative car renderer — places small box meshes on high-traffic road tiles.
 *
 * Cars are **purely visual** and have no effect on the simulation.
 *
 * Call `refresh(map)` after each monthly traffic tick so cars appear / disappear
 * as pressure changes.  Cars are offset slightly within their tile and given a
 * random heading to break up the visual repetition.
 */
export class DecorativeCarRenderer {
  private readonly _scene:    Scene;
  private readonly _mat:      StandardMaterial;
  private readonly _meshes:   Map<string, Mesh> = new Map();

  constructor(scene: Scene) {
    this._scene = scene;

    // Single shared material for all car boxes.
    const mat = new StandardMaterial('car-mat', scene);
    mat.diffuseColor  = new Color3(0.20, 0.20, 0.85); // blue cars
    mat.specularColor = new Color3(0.4, 0.4, 0.4);
    mat.emissiveColor = new Color3(0.05, 0.05, 0.20);
    this._mat = mat;
  }

  /**
   * Spawn cars on newly pressured roads and remove cars from tiles that no
   * longer qualify.  Uses a seeded position within each tile so cars don't
   * jump on every call.
   *
   * Decorative cars do not affect simulation state.
   */
  refresh(map: CityMap): void {
    const kept = new Set<string>();

    map.forEach((tile) => {
      if (tile.roadType === RoadType.None) return;
      if (tile.trafficPressure < HIGH_PRESSURE_THRESHOLD) return;

      const key = `${tile.x},${tile.y}`;

      // Deterministic per-tile pseudo-random using tile coordinates.
      if (!this._meshes.has(key)) {
        const r = _tileRand(tile.x, tile.y);
        if (r > CAR_SPAWN_CHANCE) return; // skip this tile

        const mesh = MeshBuilder.CreateBox(
          `car-${key}`,
          { width: CAR_WIDTH, height: CAR_HEIGHT, depth: CAR_DEPTH },
          this._scene,
        );

        // Place within the tile with a small random offset so cars aren't all centred.
        const offsetX = (_tileRand(tile.x + 1, tile.y)     - 0.5) * (TILE_SIZE * 0.35);
        const offsetZ = (_tileRand(tile.x,     tile.y + 1) - 0.5) * (TILE_SIZE * 0.35);

        mesh.position = new Vector3(
          tile.x * TILE_SIZE + TILE_SIZE / 2 + offsetX,
          CAR_Y,
          tile.y * TILE_SIZE + TILE_SIZE / 2 + offsetZ,
        );

        // Random heading in 45° increments for variety.
        const headingSteps = Math.floor(_tileRand(tile.x + 3, tile.y + 7) * 8);
        mesh.rotation.y = (headingSteps * Math.PI) / 4;

        mesh.material   = this._mat;
        mesh.isPickable = false;
        this._meshes.set(key, mesh);
      }

      kept.add(key);
    });

    // Remove cars from tiles that no longer have high traffic.
    for (const [key, mesh] of this._meshes) {
      if (!kept.has(key)) {
        mesh.dispose();
        this._meshes.delete(key);
      }
    }
  }

  /** Dispose all car meshes and clear the registry. */
  dispose(): void {
    for (const mesh of this._meshes.values()) mesh.dispose();
    this._meshes.clear();
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/** Prime multiplier applied to the x coordinate in _tileRand. */
const HASH_MULTIPLIER_X = 2654435761; // Knuth multiplicative hash prime

/** Prime multiplier applied to the y coordinate in _tileRand. */
const HASH_MULTIPLIER_Y = 2246822519; // Complementary prime for spatial hashing

/**
 * Cheap deterministic pseudo-random value in [0, 1) from two integer seeds.
 * Used so each tile consistently spawns (or skips) a car across refreshes.
 */
function _tileRand(x: number, y: number): number {
  // Simple integer hash — fast and sufficient for decorative variation.
  let h = Math.imul(x, HASH_MULTIPLIER_X) ^ Math.imul(y, HASH_MULTIPLIER_Y);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}
