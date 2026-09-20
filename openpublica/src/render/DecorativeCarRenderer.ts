import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  ShadowGenerator,
  TransformNode,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { RoadType } from '../sim/CityTile';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { roadNeighbors, roadHeading, roadProfile } from '../sim/roadConnections';
import { ROAD_DECK_LIFT } from './RoadRenderer';

const HIGH_PRESSURE_THRESHOLD = 6;
const CAR_SPAWN_CHANCE = 0.4;
const CAR_WIDTH  = 0.18;
const CAR_HEIGHT = 0.08;
const CAR_DEPTH  = 0.32;
const CABIN_HEIGHT = 0.07;
const CAR_CLEARANCE = 0.02;

const CAR_COLORS: ReadonlyArray<Color3> = [
  new Color3(0.18, 0.28, 0.62),
  new Color3(0.72, 0.22, 0.16),
  new Color3(0.82, 0.80, 0.72),
  new Color3(0.16, 0.16, 0.16),
];

/**
 * Decorative cars — body + cabin, a few shared paints. Visual only.
 */
export class DecorativeCarRenderer {
  private readonly _scene:    Scene;
  private readonly _shadows:  ShadowGenerator | null;
  private readonly _mats:     StandardMaterial[];
  private readonly _roots:    Map<string, TransformNode> = new Map();

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;
    this._mats = CAR_COLORS.map((color, i) => {
      const mat = new StandardMaterial(`car-mat-${i}`, scene);
      mat.diffuseColor = color;
      mat.specularColor = new Color3(0.35, 0.35, 0.35);
      return mat;
    });
  }

  refresh(map: CityMap, heights?: HeightField | null): void {
    const kept = new Set<string>();

    map.forEach((tile) => {
      if (tile.roadType === RoadType.None) return;
      if (tile.trafficPressure < HIGH_PRESSURE_THRESHOLD) return;

      const key = `${tile.x},${tile.y}`;

      if (!this._roots.has(key)) {
        const r = _tileRand(tile.x, tile.y);
        if (r > CAR_SPAWN_CHANCE) return;

        const mat = this._mats[Math.floor(_tileRand(tile.x + 3, tile.y + 5) * this._mats.length)];
        const root = new TransformNode(`car-${key}`, this._scene);
        const neighbors = roadNeighbors(map, tile.x, tile.y);
        const deck = roadProfile(tile.roadType);
        const offsetX = (_tileRand(tile.x + 1, tile.y)     - 0.5) * (TILE_SIZE * 0.28);
        const offsetZ = (_tileRand(tile.x,     tile.y + 1) - 0.5) * (TILE_SIZE * 0.28);
        const y =
          (heights?.tileCenter(tile.x, tile.y) ?? 0) +
          ROAD_DECK_LIFT + deck.thickness + CAR_HEIGHT / 2 + CAR_CLEARANCE;

        root.position = new Vector3(
          tile.x * TILE_SIZE + TILE_SIZE / 2 + offsetX,
          y,
          tile.y * TILE_SIZE + TILE_SIZE / 2 + offsetZ,
        );
        root.rotation = new Vector3(0, roadHeading(neighbors), 0);

        const body = MeshBuilder.CreateBox(`car-body-${key}`, {
          width: CAR_WIDTH, height: CAR_HEIGHT, depth: CAR_DEPTH,
        }, this._scene);
        body.parent = root;
        body.material = mat;
        body.isPickable = false;
        body.receiveShadows = true;
        this._shadows?.addShadowCaster(body);

        const cabin = MeshBuilder.CreateBox(`car-cabin-${key}`, {
          width: CAR_WIDTH * 0.82, height: CABIN_HEIGHT, depth: CAR_DEPTH * 0.48,
        }, this._scene);
        cabin.parent = root;
        cabin.position = new Vector3(0, (CAR_HEIGHT + CABIN_HEIGHT) / 2, -0.02);
        cabin.material = mat;
        cabin.isPickable = false;
        cabin.receiveShadows = true;
        this._shadows?.addShadowCaster(cabin);

        this._roots.set(key, root);
      }

      kept.add(key);
    });

    for (const [key, root] of this._roots) {
      if (!kept.has(key)) {
        root.dispose();
        this._roots.delete(key);
      }
    }
  }

  dispose(): void {
    for (const root of this._roots.values()) root.dispose();
    this._roots.clear();
  }
}

const HASH_MULTIPLIER_X = 2654435761;
const HASH_MULTIPLIER_Y = 2246822519;

function _tileRand(x: number, y: number): number {
  let h = Math.imul(x, HASH_MULTIPLIER_X) ^ Math.imul(y, HASH_MULTIPLIER_Y);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}
