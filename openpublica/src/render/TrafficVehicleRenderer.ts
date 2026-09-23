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
import { deckBaseHeight, edgeDeckHeight } from './roadDeck';
import {
  BASE_CAR_SPEED,
  BASE_TROLLEY_SPEED,
  advanceWithGaps,
  buildRoadGraph,
  buildTrolleyGraph,
  edgeExists,
  edgeIsHighway,
  edgePressure,
  edgeSpeedTilesPerSec,
  emptyGraph,
  nodesWithEdges,
  parseNodeKey,
  pickNext,
  summarizeTraffic,
  trolleyLineLengths,
  trolleyTargetCount,
  vehicleTargetCount,
  type NodeKey,
  type RoadGraph,
} from './roadGraph';

const CAR_WIDTH = 0.26;
const CAR_HEIGHT = 0.11;
const CAR_DEPTH = 0.46;
const CABIN_HEIGHT = 0.09;
const CAR_CLEARANCE = 0.03;
const LANE_OFFSET = 0.10;

const TROLLEY_WIDTH = 0.28;
const TROLLEY_HEIGHT = 0.14;
const TROLLEY_DEPTH = 0.86;
const TROLLEY_CABIN_HEIGHT = 0.10;

const CAR_COLORS: ReadonlyArray<Color3> = [
  new Color3(0.22, 0.42, 0.88),
  new Color3(0.88, 0.28, 0.18),
  new Color3(0.92, 0.86, 0.28),
  new Color3(0.12, 0.12, 0.14),
];

interface Actor {
  readonly kind: 'car' | 'trolley';
  from: NodeKey;
  to: NodeKey;
  t: number;
  speed: number;
  lane: number;
  root: TransformNode;
}

/**
 * Instanced cars (and trolleys on running lines) that lerp along a
 * render-only road graph. Busy edges slow cars down; highways let them go
 * faster; trolleys keep their own pace on the rails. Vehicles ride the deck
 * height, so they climb hills and cross bridges instead of sampling the
 * lake bed. Sim state is never written.
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
  private readonly _decks = new Map<NodeKey, number>();
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
    this._cacheDecks(map);
    this._rehome(this._cars, this._graph);
    this._rehome(this._trolleys, this._trolleyGraph);
    this.syncDensity(map);
  }

  /** Re-read deck heights after the ground under some roads was re-graded. */
  refreshDecks(map: CityMap): void {
    this._map = map;
    this._cacheDecks(map);
  }

  syncDensity(map: CityMap): void {
    this._map = map;
    const summary = summarizeTraffic(map);
    const carTarget = vehicleTargetCount(summary.totalPressure, summary.roadTileCount);
    const trolleyTarget = trolleyTargetCount(trolleyLineLengths(map));
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
    this._rehome(pool, graph);
  }

  /**
   * Put stranded vehicles back on the graph: their edge was removed, or they
   * were parked while the graph had no edges and it has some again.
   */
  private _rehome(pool: Actor[], graph: RoadGraph): void {
    for (const actor of pool) {
      if (actor.root.isEnabled() && edgeExists(graph, actor.from, actor.to)) continue;
      const ok = this._placeOnGraph(graph, actor);
      actor.root.setEnabled(ok);
    }
  }

  private _cacheDecks(map: CityMap): void {
    this._decks.clear();
    const heights = this._heights;
    if (!heights) return;
    for (const [key, node] of this._graph.nodes) {
      this._decks.set(key, deckBaseHeight(map, heights, node.x, node.y));
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
    body.isVisible = true;
    cabin.isVisible = true;
    body.isPickable = false;
    cabin.isPickable = false;
    body.receiveShadows = true;
    cabin.receiveShadows = true;
    const actor: Actor = {
      kind: 'car',
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
    body.isVisible = true;
    cabin.isVisible = true;
    body.isPickable = false;
    cabin.isPickable = false;
    body.receiveShadows = true;
    cabin.receiveShadows = true;
    const actor: Actor = {
      kind: 'trolley',
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
    actor.speed = this._speedFor(actor);
    actor.root.setEnabled(true);
    this._pose(actor);
    return true;
  }

  /** Trolleys keep their own pace on the rails; cars slow in traffic. */
  private _speedFor(actor: Actor): number {
    if (actor.kind === 'trolley') return BASE_TROLLEY_SPEED;
    if (!this._map) return BASE_CAR_SPEED;
    return edgeSpeedTilesPerSec(
      edgePressure(this._map, actor.from, actor.to),
      BASE_CAR_SPEED,
      edgeIsHighway(this._map, actor.from, actor.to),
    );
  }

  private _stepActors(pool: Actor[], graph: RoadGraph, dt: number): void {
    const moving: Actor[] = [];
    for (const actor of pool) {
      if (!actor.root.isEnabled()) continue;
      if (!edgeExists(graph, actor.from, actor.to)) {
        if (!this._placeOnGraph(graph, actor)) {
          actor.root.setEnabled(false);
        }
        continue;
      }
      moving.push(actor);
    }
    // Queue behind the vehicle ahead instead of driving through it.
    const nextT = advanceWithGaps(moving, moving.map((a) => (a.speed * dt) / TILE_SIZE));
    moving.forEach((actor, i) => {
      actor.t = nextT[i];
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
        actor.speed = this._speedFor(actor);
      }
      this._pose(actor);
    });
  }

  private _pose(actor: Actor): void {
    const from = parseNodeKey(actor.from);
    const to = parseNodeKey(actor.to);
    const fx = from.x * TILE_SIZE + TILE_SIZE / 2;
    const fz = from.y * TILE_SIZE + TILE_SIZE / 2;
    const tx = to.x * TILE_SIZE + TILE_SIZE / 2;
    const tz = to.y * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - fx;
    const dz = tz - fz;
    const x = fx + dx * actor.t;
    const z = fz + dz * actor.t;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * LANE_OFFSET * actor.lane;
    const oz = (dx / len) * LANE_OFFSET * actor.lane;

    const map = this._map;
    const fromTile = map?.getTile(from.x, from.y);
    const toTile = map?.getTile(to.x, to.y);
    const thickA = fromTile ? roadProfile(fromTile.roadType).thickness : 0.055;
    const thickB = toTile ? roadProfile(toTile.roadType).thickness : thickA;
    const thickness = thickA + (thickB - thickA) * actor.t;

    // Ride the deck the road renderer built: straight from centre to centre.
    const deckFrom = this._decks.get(actor.from) ?? this._heights?.tileCenter(from.x, from.y) ?? 0;
    const deckTo = this._decks.get(actor.to) ?? this._heights?.tileCenter(to.x, to.y) ?? deckFrom;
    const deck = edgeDeckHeight(deckFrom, deckTo, actor.t);
    const y = deck + ROAD_DECK_LIFT + thickness + CAR_HEIGHT / 2 + CAR_CLEARANCE;
    const pitch = -Math.atan2(deckTo - deckFrom, len);

    actor.root.position = new Vector3(x + ox, y, z + oz);
    actor.root.rotation = new Vector3(pitch, Math.atan2(dx, dz), 0);
  }
}
