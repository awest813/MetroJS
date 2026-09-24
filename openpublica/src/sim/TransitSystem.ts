// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { CityTile } from './CityTile';
import type { CityStats } from './CitySim';
import { ROAD_STEPS, isRoadTile } from './roadConnections';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Radius (in tiles) within which a trolley avenue tile radiates transit access.
 * A value of 5 covers a comfortable walking-to-transit distance.
 */
const TRANSIT_RADIUS = 5;

/**
 * Maximum transit-access score granted to the trolley avenue tile itself.
 * Decays linearly to 0 at TRANSIT_RADIUS.
 */
const TRANSIT_PEAK_SCORE = 40;

/**
 * Share of a road's trips a trolley corridor takes off it at full transit
 * access (100), scaled down with access: riders leave their cars at home in
 * proportion to how busy the road is, so a jammed avenue gets real relief
 * while a quiet one near the line still carries some cars.
 * transitAccess=100 → half the trips; 50 → a quarter; 25 → an eighth.
 */
export const TRANSIT_TRIP_SHARE = 0.5;

/**
 * Connected trolley tiles needed before a trolley runs the line.
 * Shorter stubs are track, not service: they give no transit access, and the
 * renderer spawns no trolley on them.
 */
export const MIN_TROLLEY_LINE_TILES = 4;

// ──────────────────────────────────────────────────────────────────────────────

/**
 * TransitSystem — corridor-based transit simulation.
 *
 * Run once per simulated month, **after** WalkabilitySystem so that all
 * per-tile scores reflect the full monthly picture before effects are applied.
 *
 * ## How it works
 * Every tile of a line of at least {@link MIN_TROLLEY_LINE_TILES} connected
 * tiles (trolley avenue, plus any level crossing carrying it over a street or
 * highway) radiates a transit-access score to all tiles within
 * `TRANSIT_RADIUS`.  The score decays linearly with distance.  Multiple
 * overlapping corridors stack, capped at 100.  A lone stub has no trolley,
 * so it gives no access.
 *
 * ## Effects applied to map / stats
 * - `tile.transitAccess` [0–100] — written for every tile.
 * - `tile.trafficPressure` — reduced on road tiles near trolley corridors by
 *   up to {@link TRANSIT_TRIP_SHARE} of their trips (transit captures
 *   commute trips, easing congestion).
 * - `stats.transitAccess` [0–100] — citywide average across all zoned tiles.
 * Happiness is composed later from this average plus traffic, walk, and crime.
 *
 * ## Design goals
 * - No route editor.
 * - No train scheduling.
 * - No per-rider simulation.
 * - Tile-based, O(trolleyTiles × TRANSIT_RADIUS²) — fast on 128×128 maps.
 */
export class TransitSystem {
  /**
   * Recompute transit access for every tile.
   *
   * @param map   - city tile grid
   * @param stats - city statistics (transitAccess is written)
   */
  tick(map: CityMap, stats: CityStats): void {
    // 1. Reset transit access on every tile.
    map.forEach((tile) => { tile.transitAccess = 0; });

    const r  = TRANSIT_RADIUS;
    const r2 = r * r;

    // 2. Each tile of a running trolley line radiates a transit-access score
    //    to all tiles within TRANSIT_RADIUS.
    for (const line of trolleyLines(map)) {
      if (line.length < MIN_TROLLEY_LINE_TILES) continue;
      for (const trolleyTile of line) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const dist2 = dx * dx + dy * dy;
            if (dist2 > r2) continue;
            const tile = map.getTile(trolleyTile.x + dx, trolleyTile.y + dy);
            if (!tile) continue;
            const dist  = Math.sqrt(dist2);
            const score = Math.round(TRANSIT_PEAK_SCORE * (1 - dist / r));
            tile.transitAccess = Math.min(100, tile.transitAccess + score);
          }
        }
      }
    }

    // 3. On road tiles, transit access takes a share of the trips.
    //    Trolley corridors capture commute trips that would otherwise
    //    be made by car, easing congestion most where it is worst.
    map.forEach((tile) => {
      if (tile.roadType === RoadType.None || tile.transitAccess === 0) return;
      tile.trafficPressure -= transitRelief(tile.trafficPressure, tile.transitAccess);
    });

    // 4. Citywide transit stat — average access across all zoned tiles.
    //    Unzoned tiles are excluded; they are not part of the built city.
    let zonedCount  = 0;
    let accessSum   = 0;
    map.forEach((tile) => {
      if (tile.zoneType !== ZoneType.None) {
        accessSum  += tile.transitAccess;
        zonedCount += 1;
      }
    });
    stats.transitAccess = zonedCount > 0
      ? Math.round(accessSum / zonedCount)
      : 0;
  }
}

/** Traffic pressure a road sheds to transit at this access (0–100). */
export function transitRelief(pressure: number, access: number): number {
  const share = TRANSIT_TRIP_SHARE * Math.min(100, Math.max(0, access)) / 100;
  return Math.floor(Math.max(0, pressure) * share);
}

/** Axis a trolley line's rails run along through a tile. */
export type RailAxis = 'ns' | 'ew';

function isTrolley(map: CityMap, x: number, y: number): boolean {
  return map.getTile(x, y)?.roadType === RoadType.TrolleyAvenue;
}

/** Rails through (x, y) along (dx, dy), with the crossing road running across them. */
function crossesAlong(map: CityMap, x: number, y: number, dx: number, dy: number): boolean {
  for (const side of [1, -1]) {
    const tx = x + dx * side;
    const ty = y + dy * side;
    if (!isTrolley(map, tx, ty)) return false;
    // The trolley tile must run straight at the crossing, not alongside it.
    if (isTrolley(map, tx + dy, ty + dx) || isTrolley(map, tx - dy, ty - dx)) return false;
  }
  return isRoadTile(map, x + dy, y + dx) || isRoadTile(map, x - dy, y - dx);
}

/**
 * Where a trolley line crosses a street or highway at grade: a road tile that
 * is not a trolley avenue, with trolley avenue on both sides along one axis
 * and the crossing road running off across the other. Returns the axis the
 * rails run along, or null.
 *
 * A trolley line dragged over a highway keeps the highway (nothing paints
 * over one), so without crossings every highway would cut the line in two.
 * Rails only cross toward trolley tiles that run straight at the crossing, so
 * a street between two parallel avenues does not become a ladder of crossings,
 * and a lone street tile filling a gap in a line is not a crossing (pave it).
 */
export function levelCrossingAxis(map: CityMap, x: number, y: number): RailAxis | null {
  const tile = map.getTile(x, y);
  if (!tile || tile.roadType === RoadType.None || tile.roadType === RoadType.TrolleyAvenue) return null;
  if (crossesAlong(map, x, y, 0, 1)) return 'ns';
  if (crossesAlong(map, x, y, 1, 0)) return 'ew';
  return null;
}

function carriesRails(map: CityMap, tile: CityTile, axis: RailAxis): boolean {
  if (tile.roadType === RoadType.TrolleyAvenue) return true;
  return levelCrossingAxis(map, tile.x, tile.y) === axis;
}

/**
 * True when rails run from tile `a` into its neighbour `b`: trolley avenue to
 * trolley avenue, or into and out of a level crossing along its axis.
 */
export function railsJoin(map: CityMap, a: CityTile, b: CityTile): boolean {
  const axis: RailAxis = a.x === b.x ? 'ns' : 'ew';
  return carriesRails(map, a, axis) && carriesRails(map, b, axis);
}

/**
 * Connected groups of trolley-avenue tiles (4-neighbour), each one line,
 * including the level crossings that carry a line across a street or highway
 * ({@link levelCrossingAxis}). Streets do not otherwise join two lines —
 * trolleys stay on their rails.
 */
export function trolleyLines(map: CityMap): CityTile[][] {
  const seen = new Set<CityTile>();
  const lines: CityTile[][] = [];
  map.forEach((start) => {
    if (start.roadType !== RoadType.TrolleyAvenue || seen.has(start)) return;
    const line: CityTile[] = [start];
    seen.add(start);
    for (let i = 0; i < line.length; i++) {
      const from = line[i];
      for (const [dx, dy] of ROAD_STEPS) {
        const next = map.getTile(from.x + dx, from.y + dy);
        if (!next || seen.has(next) || !railsJoin(map, from, next)) continue;
        seen.add(next);
        line.push(next);
      }
    }
    lines.push(line);
  });
  return lines;
}
