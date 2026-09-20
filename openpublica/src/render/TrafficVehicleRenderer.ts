import {
  Scene,
  MeshBuilder,
  Color3,
  Mesh,
  Vector3,
  ShadowGenerator,
  TransformNode,
} from '@babylonjs/core';
import type { CityMap } from '../sim/CityMap';
import { TILE_SIZE } from '../data/constants';
import type { HeightField } from '../sim/HeightField';
import { roadProfile } from '../sim/roadConnections';
import { ROAD_DECK_LIFT } from './RoadRenderer';
import { coloredPbr } from './pbrSurfaces';
import {
  BASE_CAR_SPEED,
  BASE_TROLLEY_SPEED,
  buildRoadGraph,
  buildTrolleyGraph,
  edgeExists,
  edgePressure,
  edgeSpeedTilesPerSec,
  emptyGraph,
  nodesWithEdges,
  pickNext,
  summarizeTraffic,
  trolleyTargetCount,
  vehicleTargetCount,
  type NodeKey,
  type RoadGraph,
} from './roadGraph';

const CAR_WIDTH = 0.18;
const CAR_HEIGHT = 0.08;
const CAR_DEPTH = 0.32;
const CABIN_HEIGHT = 0.07;
const CAR_CLEARANCE = 0.02;
const LANE_OFFSET = 0.08;

const TROLLEY_WIDTH = 0.22;
const TROLLEY_HEIGHT = 0.11;
const TROLLEY_DEPTH = 0.72;
const TROLLEY_CABIN_HEIGHT = 0.08;

const CAR_COLORS: ReadonlyArray<Color3> = [
  new Color3(0.18, 0.28, 0.62),
  new Color3(0.72, 0.22, 0.16),
  new Color3(0.82, 0.80, 0.72),
  new Color3(0.16, 0.16, 0.16),
];

interface Actor {
  from: NodeKey;
  to: NodeKey;
  t: number;
  speed: number;
  lane: number;
  root: TransformNode;
}

/**
 * Instanced cars (and optional trolleys) that lerp along a render-only road
 * graph. Density and speed come from trafficPressure; sim state is never written.
 */
export class TrafficVehicleRenderer {
  private readonly _scene: Scene;
  private readonly _shadows: ShadowGenerator | null;
  private readonly _carSources: Array<{ body: Mesh; cabin: Mesh }>;
  private readonly _trolleyBody: Mesh;
  private readonly _trolleyCabin: Mesh;
  private readonly _cars: Actor[] = [];
  private readonly _trolleys: Actor[] = [];
  private _graph: RoadGraph = emptyGraph();
  private _trolleyGraph: RoadGraph = emptyGraph();
  private _map: CityMap | null = null;
  private _heights: HeightField | null = null;
  private _seq = 0;

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null = null) {
    this._scene = scene;
    this._shadows = shadowGenerator;

    this._carSources = CAR_COLORS.map((color, i) => {
      const mat = coloredPbr(`traffic-car-mat-${i}`, scene, color, 0.42, 0.18);
      const body = MeshBuilder.CreateBox(`traffic-car-body-src-${i}`, {
        width: CAR_WIDTH, height: CAR_HEIGHT, depth: CAR_DEPTH,
      }, scene);
      body.material = mat;
      body.isVisible = false;
      body.isPickable = false;
      this._shadows?.addShadowCaster(body);
      const cabin = MeshBuilder.CreateBox(`traffic-car-cabin-src-${i}`, {
        width: CAR_WIDTH * 0.82, height: CABIN_HEIGHT, depth: CAR_DEPTH * 0.48,
      }, scene);
      cabin.material = mat;
      cabin.position = new Vector3(0, (CAR_HEIGHT + CABIN_HEIGHT) / 2, -0.02);
      cabin.isVisible = false;
      cabin.isPickable = false;
      this._shadows?.addShadowCaster(cabin);
      return { body, cabin };
    });

    const trolleyMat = coloredPbr('traffic-trolley-mat', scene, new Color3(0.55, 0.16, 0.14), 0.48, 0.12);
    trolleyMat.emissiveColor = new Color3(0.06, 0.02, 0.01);

    this._trolleyBody = MeshBuilder.CreateBox('traffic-trolley-body-src', {
      width: TROLLEY_WIDTH, height: TROLLEY_HEIGHT, depth: TROLLEY_DEPTH,
    }, scene);
    this._trolleyBody.material = trolleyMat;
    this._trolleyBody.isVisible = false;
    this._trolleyBody.isPickable = false;
    this._shadows?.addShadowCaster(this._trolleyBody);

    const cabinMat = coloredPbr('traffic-trolley-cabin-mat', scene, new Color3(0.78, 0.74, 0.62), 0.36, 0.08);
    this._trolleyCabin = MeshBuilder.CreateBox('traffic-trolley-cabin-src', {
      width: TROLLEY_WIDTH * 0.88, height: TROLLEY_CABIN_HEIGHT, depth: TROLLEY_DEPTH * 0.72,
    }, scene);
    this._trolleyCabin.material = cabinMat;
    this._trolleyCabin.position = new Vector3(0, (TROLLEY_HEIGHT + TROLLEY_CABIN_HEIGHT) / 2, 0.04);
    this._trolleyCabin.isVisible = false;
    this._trolleyCabin.isPickable = false;
    this._shadows?.addShadowCaster(this._trolleyCabin);
  }

  rebuildGraph(map: CityMap, heights?: HeightField | null): void {
    this._map = map;
    if (heights !== undefined) this._heights = heights ?? null;
    this._graph = buildRoadGraph(map);
    this._trolleyGraph = buildTrolleyGraph(map);
    this._rehome(this._cars, this._graph);
    this._rehome(this._trolleys, this._trolleyGraph);
    this.syncDensity(map);
  }

  syncDensity(map: CityMap): void {
    this._map = map;
    const summary = summarizeTraffic(map);
    const carTarget = vehicleTargetCount(summary.totalPressure, summary.roadTileCount);
    const trolleyTarget = trolleyTargetCount(summary.trolleyTileCount);
    this._resizePool(this._cars, carTarget, this._graph, (id) => this._spawnCar(id));
    this._resizePool(this._trolleys, trolleyTarget, this._trolleyGraph, (id) => this._spawnTrolley(id));
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this._stepActors(this._cars, this._graph, dt);
    this._stepActors(this._trolleys, this._trolleyGraph, dt);
  }

  dispose(): void {
    for (const actor of [...this._cars, ...this._trolleys]) actor.root.dispose();
    this._cars.length = 0;
    this._trolleys.length = 0;
    for (const src of this._carSources) {
      src.body.dispose();
      src.cabin.dispose();
    }
    this._trolleyBody.dispose();
    this._trolleyCabin.dispose();
  }

  private _resizePool(
    pool: Actor[],
    target: number,
    graph: RoadGraph,
    spawn: (id: number) => Actor | null,
  ): void {
    while (pool.length > target) {
      const actor = pool.pop();
      actor?.root.dispose();
    }
    while (pool.length < target) {
      const actor = spawn(this._seq++);
      if (!actor) break;
      pool.push(actor);
    }
    for (const actor of pool) {
      if (!edgeExists(graph, actor.from, actor.to)) {
        const placed = this._placeOnGraph(graph, actor);
        if (!placed) {
          actor.root.setEnabled(false);
        }
      }
    }
  }

  private _rehome(pool: Actor[], graph: RoadGraph): void {
    for (const actor of pool) {
      if (!edgeExists(graph, actor.from, actor.to)) {
        const ok = this._placeOnGraph(graph, actor);
        actor.root.setEnabled(ok);
      }
    }
  }

  private _spawnCar(id: number): Actor | null {
    const color = id % this._carSources.length;
    const src = this._carSources[color];
    const root = new TransformNode(`traffic-car-${id}`, this._scene);
    const body = src.body.createInstance(`traffic-car-body-${id}`);
    const cabin = src.cabin.createInstance(`traffic-car-cabin-${id}`);
    body.parent = root;
    cabin.parent = root;
    body.isPickable = false;
    cabin.isPickable = false;
    body.receiveShadows = true;
    cabin.receiveShadows = true;
    const actor: Actor = {
      from: '',
      to: '',
      t: 0,
      speed: BASE_CAR_SPEED,
      lane: id % 2 === 0 ? 1 : -1,
      root,
    };
    if (!this._placeOnGraph(this._graph, actor)) {
      root.dispose();
      return null;
    }
    return actor;
  }

  private _spawnTrolley(id: number): Actor | null {
    const root = new TransformNode(`traffic-trolley-${id}`, this._scene);
    const body = this._trolleyBody.createInstance(`traffic-trolley-body-${id}`);
    const cabin = this._trolleyCabin.createInstance(`traffic-trolley-cabin-${id}`);
    body.parent = root;
    cabin.parent = root;
    body.isPickable = false;
    cabin.isPickable = false;
    body.receiveShadows = true;
    cabin.receiveShadows = true;
    const actor: Actor = {
      from: '',
      to: '',
      t: 0,
      speed: BASE_TROLLEY_SPEED,
      lane: 0,
      root,
    };
    if (!this._placeOnGraph(this._trolleyGraph, actor)) {
      root.dispose();
      return null;
    }
    return actor;
  }

  private _placeOnGraph(graph: RoadGraph, actor: Actor): boolean {
    const starts = nodesWithEdges(graph);
    if (starts.length === 0) return false;
    const from = starts[Math.floor(Math.random() * starts.length)];
    const to = pickNext(graph, null, from, Math.random);
    if (!to) return false;
    actor.from = from;
    actor.to = to;
    actor.t = Math.random();
    actor.speed = this._speedFor(from, to, actor.lane === 0 ? BASE_TROLLEY_SPEED : BASE_CAR_SPEED);
    actor.root.setEnabled(true);
    this._pose(actor);
    return true;
  }

  private _speedFor(from: NodeKey, to: NodeKey, base: number): number {
    if (!this._map) return base;
    return edgeSpeedTilesPerSec(edgePressure(this._map, from, to), base);
  }

  private _stepActors(pool: Actor[], graph: RoadGraph, dt: number): void {
    for (const actor of pool) {
      if (!actor.root.isEnabled()) continue;
      if (!edgeExists(graph, actor.from, actor.to)) {
        if (!this._placeOnGraph(graph, actor)) {
          actor.root.setEnabled(false);
        }
        continue;
      }
      actor.t += (actor.speed * dt) / TILE_SIZE;
      let guard = 0;
      while (actor.t >= 1 && guard++ < 8) {
        actor.t -= 1;
        const prev = actor.from;
        actor.from = actor.to;
        const next = pickNext(graph, prev, actor.from, Math.random);
        if (!next) {
          actor.t = 0;
          actor.root.setEnabled(false);
          break;
        }
        actor.to = next;
        actor.speed = this._speedFor(
          actor.from,
          actor.to,
          actor.lane === 0 ? BASE_TROLLEY_SPEED : BASE_CAR_SPEED,
        );
      }
      this._pose(actor);
    }
  }

  private _pose(actor: Actor): void {
    const from = actor.from.split(',').map(Number);
    const to = actor.to.split(',').map(Number);
    const fx = from[0] * TILE_SIZE + TILE_SIZE / 2;
    const fz = from[1] * TILE_SIZE + TILE_SIZE / 2;
    const tx = to[0] * TILE_SIZE + TILE_SIZE / 2;
    const tz = to[1] * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - fx;
    const dz = tz - fz;
    const x = fx + dx * actor.t;
    const z = fz + dz * actor.t;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * LANE_OFFSET * actor.lane;
    const oz = (dx / len) * LANE_OFFSET * actor.lane;

    const map = this._map;
    const fromTile = map?.getTile(from[0], from[1]);
    const toTile = map?.getTile(to[0], to[1]);
    const thickA = fromTile ? roadProfile(fromTile.roadType).thickness : 0.055;
    const thickB = toTile ? roadProfile(toTile.roadType).thickness : thickA;
    const thickness = thickA + (thickB - thickA) * actor.t;
    const ground = this._heights?.sample(x + ox, z + oz) ?? 0;
    const y = ground + ROAD_DECK_LIFT + thickness + CAR_HEIGHT / 2 + CAR_CLEARANCE;

    actor.root.position = new Vector3(x + ox, y, z + oz);
    actor.root.rotation = new Vector3(0, Math.atan2(dx, dz), 0);
  }
}
