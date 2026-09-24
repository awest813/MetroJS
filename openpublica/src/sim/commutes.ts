// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import { RoadType } from './CityTile';
import { ROAD_STEPS, isLandRoad } from './roadConnections';
import { HIGHWAY_RESPONSE_STEP } from './roadDispatch';

/**
 * Commutes: a coarse flow of home-to-work trips over the road network.
 *
 * Every road tile knows how far it is to a workplace's street, in road steps
 * (a highway tile is half a step, as police and fire drive it). Each home's
 * commuters enter at its own street and roll downhill toward the jobs,
 * splitting evenly wherever two routes are equally short: a grid shares the
 * flow, the one street out of a district carries all of it, and a highway
 * gathers the traffic of every trip it shortens.
 *
 * Workplaces take commuters in proportion to their jobs. One that draws more
 * than its share is made to look farther away, a few steps a round, so the
 * overflow drives on to jobs with room: a district's commuters fill the shops
 * next door and then cross town to downtown. No per-car routing: a handful of
 * distance searches and passes over the roads, each month.
 */

/** Distance units per street tile, so highway half-steps stay whole numbers. */
const UNITS_PER_STEP = 2;

/** No workplace can be reached from here. */
export const NO_WORK = 0x7fffffff;

/** Rounds of pushing crowded workplaces farther away before the flow is final. */
export const COMMUTE_ROUNDS = 10;

/**
 * Distance units a workplace street moves away per share it is over-full, per
 * round: one twice as crowded as its share looks four tiles farther.
 */
const CROWDING_UNITS = 8;

/** Most a workplace street moves away in one round. */
const MAX_CROWDING_STEP = 32;

export interface Commuter {
  readonly x: number;
  readonly y: number;
  readonly trips: number;
}

export interface Workplace {
  readonly x: number;
  readonly y: number;
  readonly jobs: number;
}

export interface Commutes {
  /** Commute trips over each road tile (index y × width + x), counting where they enter and arrive. */
  readonly flow: Float64Array;
  /** Per commuter, in order: true when a workplace was reachable and its trips were routed. */
  readonly routed: readonly boolean[];
}

function stepUnits(type: RoadType): number {
  return type === RoadType.Highway ? HIGHWAY_RESPONSE_STEP * UNITS_PER_STEP : UNITS_PER_STEP;
}

/** The road network as compact arrays, built once and searched every round. */
interface RoadNet {
  /** Map tile index of each road node. */
  readonly tiles: Int32Array;
  /** Road node at each map tile index, or -1. */
  readonly nodeAt: Int32Array;
  /** Cost in distance units of driving onto each node. */
  readonly step: Int32Array;
  /** Up to four neighbours per node (node × 4 + side), -1 where none. */
  readonly next: Int32Array;
}

function roadNet(map: CityMap): RoadNet {
  const w = map.width;
  const nodeAt = new Int32Array(w * map.height).fill(-1);
  const tiles: number[] = [];
  const steps: number[] = [];
  map.forEach((tile) => {
    if (tile.roadType === RoadType.None) return;
    nodeAt[tile.y * w + tile.x] = tiles.length;
    tiles.push(tile.y * w + tile.x);
    steps.push(stepUnits(tile.roadType));
  });
  const next = new Int32Array(tiles.length * 4).fill(-1);
  tiles.forEach((index, node) => {
    const x = index % w;
    const y = (index - x) / w;
    ROAD_STEPS.forEach(([dx, dy], side) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) return;
      next[node * 4 + side] = nodeAt[ny * w + nx];
    });
  });
  return { tiles: Int32Array.from(tiles), nodeAt, step: Int32Array.from(steps), next };
}

/**
 * Distance from every road node to the nearest workplace street, where a
 * workplace street starts at its crowding offset (0 when it has room), and
 * the nodes in the order they were settled (nearest first). Dial's algorithm
 * from every workplace street at once; a route costs the tiles it drives onto.
 */
function searchNet(net: RoadNet, offsets: ReadonlyMap<number, number>): { dist: Int32Array; order: number[] } {
  const dist = new Int32Array(net.tiles.length).fill(NO_WORK);
  const order: number[] = [];
  const buckets: number[][] = [];
  for (const [node, offset] of offsets) {
    dist[node] = offset;
    (buckets[offset] ??= []).push(node);
  }
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (const node of bucket) {
      if (dist[node] !== cost) continue;
      order.push(node);
      // Driving from a neighbour onto this node costs this node's step.
      const onto = cost + net.step[node];
      for (let side = 0; side < 4; side++) {
        const n = net.next[node * 4 + side];
        if (n < 0 || onto >= dist[n]) continue;
        dist[n] = onto;
        (buckets[onto] ??= []).push(n);
      }
    }
  }
  return { dist, order };
}

/**
 * For every map tile, the distance to the nearest workplace street (given as
 * map tile index → crowding offset), or {@link NO_WORK} off the roads or out
 * of reach.
 */
export function distancesToWork(map: CityMap, offsets: ReadonlyMap<number, number>): Int32Array {
  const net = roadNet(map);
  const byNode = new Map<number, number>();
  for (const [index, offset] of offsets) {
    const node = net.nodeAt[index];
    if (node >= 0) byNode.set(node, offset);
  }
  const { dist } = searchNet(net, byNode);
  const out = new Int32Array(net.nodeAt.length).fill(NO_WORK);
  net.tiles.forEach((index, node) => { out[index] = dist[node]; });
  return out;
}

/** Road nodes of the land roads beside a lot (its driveways). */
function driveways(map: CityMap, net: RoadNet, x: number, y: number): number[] {
  const out: number[] = [];
  for (const [dx, dy] of ROAD_STEPS) {
    const tile = map.getTile(x + dx, y + dy);
    if (isLandRoad(tile)) out.push(net.nodeAt[tile!.y * map.width + tile!.x]);
  }
  return out;
}

/**
 * Roll the trips entering at each node downhill to work, farthest first so
 * every node has all its inflow before it passes it on. A workplace street
 * that is its own nearest workplace (distance equal to its offset) keeps what
 * reaches it; every other node passes its flow on, split evenly between the
 * next nodes on equally short routes.
 */
function roll(
  net: RoadNet,
  dist: Int32Array,
  order: readonly number[],
  offsets: ReadonlyMap<number, number>,
  entering: Float64Array,
): Float64Array {
  const flow = Float64Array.from(entering);
  const downhill: number[] = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const node = order[k];
    const f = flow[node];
    if (f <= 0 || offsets.get(node) === dist[node]) continue;
    downhill.length = 0;
    for (let side = 0; side < 4; side++) {
      const n = net.next[node * 4 + side];
      if (n >= 0 && dist[n] !== NO_WORK && dist[n] + net.step[n] === dist[node]) downhill.push(n);
    }
    if (downhill.length === 0) continue;
    const share = f / downhill.length;
    for (const n of downhill) flow[n] += share;
  }
  return flow;
}

/**
 * Route every home's commuters to work. Each workplace's jobs are shared
 * between the streets beside its lot; a street's fair share of the commuters
 * is its share of all the jobs.
 */
export function routeCommutes(
  map: CityMap,
  homes: readonly Commuter[],
  workplaces: readonly Workplace[],
  rounds = COMMUTE_ROUNDS,
): Commutes {
  const net = roadNet(map);
  const jobsAt = new Map<number, number>();
  for (const place of workplaces) {
    const streets = driveways(map, net, place.x, place.y);
    for (const node of streets) jobsAt.set(node, (jobsAt.get(node) ?? 0) + place.jobs / streets.length);
  }
  const offsets = new Map<number, number>();
  for (const node of jobsAt.keys()) offsets.set(node, 0);
  const homeStreets = homes.map((home) => driveways(map, net, home.x, home.y));

  let totalJobs = 0;
  for (const jobs of jobsAt.values()) totalJobs += jobs;
  let totalTrips = 0;
  for (const home of homes) totalTrips += home.trips;

  let nodeFlow: Float64Array = new Float64Array(net.tiles.length);
  let routed: boolean[] = homes.map(() => false);
  const lastRound = Math.max(1, rounds) - 1;
  for (let round = 0; round <= lastRound; round++) {
    const { dist, order } = searchNet(net, offsets);
    const entering = new Float64Array(net.tiles.length);
    routed = homes.map((home, i) => {
      // Leave by the street nearest to work.
      let entry = -1;
      for (const node of homeStreets[i]) {
        if (dist[node] !== NO_WORK && (entry < 0 || dist[node] < dist[entry])) entry = node;
      }
      if (entry < 0) return false;
      entering[entry] += home.trips;
      return true;
    });
    nodeFlow = roll(net, dist, order, offsets, entering);
    if (round === lastRound || totalJobs <= 0) break;

    // Crowded workplace streets look farther away next round.
    let moved = false;
    for (const [node, jobs] of jobsAt) {
      if (dist[node] !== offsets.get(node)) continue;
      const fair = totalTrips * jobs / totalJobs;
      const over = nodeFlow[node] / Math.max(fair, 1e-9) - 1;
      if (over <= 0) continue;
      const step = Math.min(MAX_CROWDING_STEP, Math.ceil(CROWDING_UNITS * over));
      offsets.set(node, offsets.get(node)! + step);
      moved = true;
    }
    if (!moved) break;
  }

  const flow = new Float64Array(net.nodeAt.length);
  net.tiles.forEach((index, node) => { flow[index] = nodeFlow[node]; });
  return { flow, routed };
}
