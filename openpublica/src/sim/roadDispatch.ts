// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';
import { RoadType, TerrainType, ZoneType } from './CityTile';
import { ROAD_STEPS, isLandRoad } from './roadConnections';
import { coverageAtDistance } from './coveragePaint';

/**
 * Police cars and fire trucks leave a station by its street and drive the road
 * network. Response distance is measured in road steps, not a straight line,
 * so a lake or a river without a bridge really does block a station.
 */

/** Road steps a responder spends crossing one highway tile — highways are faster. */
export const HIGHWAY_RESPONSE_STEP = 0.5;

/** Lots a responder can reach on foot from a reached curb (tiles away from the road). */
export const CURB_REACH = 2;

/** Half-step units so highway steps stay integral in the bucket queue. */
const HALF_STEPS_PER_TILE = 2;

const UNREACHED = 0x7fffffff;

function stepCostHalves(type: RoadType): number {
  return type === RoadType.Highway
    ? HIGHWAY_RESPONSE_STEP * HALF_STEPS_PER_TILE
    : HALF_STEPS_PER_TILE;
}

/** True when a station lot at (x, y) touches a street its vehicles can leave by. */
export function stationHasRoad(map: CityMap, x: number, y: number): boolean {
  for (const [dx, dy] of ROAD_STEPS) {
    if (isLandRoad(map.getTile(x + dx, y + dy))) return true;
  }
  return false;
}

/**
 * Response distance (in road steps) from a station lot to every tile it can
 * reach within `reach`. Unreached tiles are `Infinity`. A station without a
 * street reaches nothing — not even its own lot.
 *
 * Roads cost one step per tile (half on highways, bridges included). Lots
 * within {@link CURB_REACH} of a reached land road are covered on foot, one
 * step per tile, without crossing water or other roads.
 */
export function dispatchDistances(
  map: CityMap,
  stationX: number,
  stationY: number,
  reach: number,
): Float64Array {
  const w = map.width;
  const h = map.height;
  const dist = new Float64Array(w * h).fill(Infinity);
  if (reach <= 0 || !map.getTile(stationX, stationY)) return dist;
  if (!stationHasRoad(map, stationX, stationY)) return dist;

  const limit = Math.floor(reach * HALF_STEPS_PER_TILE);
  const best = new Int32Array(w * h).fill(UNREACHED);
  const buckets: number[][] = [];
  const push = (index: number, cost: number): void => {
    if (cost > limit || cost >= best[index]) return;
    best[index] = cost;
    (buckets[cost] ??= []).push(index);
  };

  dist[stationY * w + stationX] = 0;
  for (const [dx, dy] of ROAD_STEPS) {
    const tile = map.getTile(stationX + dx, stationY + dy);
    if (!isLandRoad(tile)) continue;
    push(tile!.y * w + tile!.x, HALF_STEPS_PER_TILE);
  }

  // Dial's algorithm over road tiles: costs are small integers.
  for (let cost = 0; cost <= limit; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (const index of bucket) {
      if (best[index] !== cost) continue;
      const x = index % w;
      const y = (index - x) / w;
      for (const [dx, dy] of ROAD_STEPS) {
        const next = map.getTile(x + dx, y + dy);
        if (!next || next.roadType === RoadType.None) continue;
        push(next.y * w + next.x, cost + stepCostHalves(next.roadType));
      }
    }
  }

  for (let index = 0; index < best.length; index++) {
    const cost = best[index];
    if (cost === UNREACHED) continue;
    const roadDist = cost / HALF_STEPS_PER_TILE;
    if (roadDist < dist[index]) dist[index] = roadDist;
    const x = index % w;
    const y = (index - x) / w;
    if (!isLandRoad(map.getTile(x, y))) continue;
    _walkFromCurb(map, x, y, roadDist, reach, dist);
  }

  return dist;
}

/** Short BFS over dry, road-free lots from one reached curb. */
function _walkFromCurb(
  map: CityMap,
  roadX: number,
  roadY: number,
  roadDist: number,
  reach: number,
  dist: Float64Array,
): void {
  const w = map.width;
  let frontier: CityTile[] = [];
  for (const [dx, dy] of ROAD_STEPS) {
    const lot = map.getTile(roadX + dx, roadY + dy);
    if (lot && _walkable(lot)) frontier.push(lot);
  }
  for (let step = 1; step <= CURB_REACH && frontier.length > 0; step++) {
    const d = roadDist + step;
    if (d > reach) return;
    const next: CityTile[] = [];
    for (const lot of frontier) {
      const index = lot.y * w + lot.x;
      if (d >= dist[index]) continue;
      dist[index] = d;
      for (const [dx, dy] of ROAD_STEPS) {
        const onward = map.getTile(lot.x + dx, lot.y + dy);
        if (onward && _walkable(onward)) next.push(onward);
      }
    }
    frontier = next;
  }
}

function _walkable(tile: CityTile): boolean {
  return tile.roadType === RoadType.None && tile.terrain !== TerrainType.Water;
}

/**
 * Visit each tile a station at (x, y) covers, with its road-network coverage
 * value (100 at the station, falling to 0 at `reach` road steps).
 */
export function forEachDispatchedTile(
  map: CityMap,
  stationX: number,
  stationY: number,
  reach: number,
  visit: (tile: CityTile, coverage: number) => void,
): void {
  const dist = dispatchDistances(map, stationX, stationY, reach);
  const w = map.width;
  for (let index = 0; index < dist.length; index++) {
    const d = dist[index];
    if (!Number.isFinite(d)) continue;
    const coverage = coverageAtDistance(d, reach);
    if (coverage <= 0) continue;
    const x = index % w;
    const tile = map.getTile(x, (index - x) / w);
    if (tile) visit(tile, coverage);
  }
}

/** Zone buildings (houses, shops, factories; not civic lots) a station at (x, y) reaches. */
export function buildingsInReach(map: CityMap, stationX: number, stationY: number, reach: number): number {
  let count = 0;
  forEachDispatchedTile(map, stationX, stationY, reach, (tile) => {
    if (tile.buildingId !== null && tile.zoneType !== ZoneType.None) count += 1;
  });
  return count;
}

/** Tiles a station at (x, y) would cover — for placement previews. */
export function dispatchCoverage(
  map: CityMap,
  stationX: number,
  stationY: number,
  reach: number,
): Array<{ x: number; y: number; coverage: number }> {
  const out: Array<{ x: number; y: number; coverage: number }> = [];
  forEachDispatchedTile(map, stationX, stationY, reach, (tile, coverage) => {
    out.push({ x: tile.x, y: tile.y, coverage });
  });
  return out;
}
