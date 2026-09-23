// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CityMap } from '../sim/CityMap';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { ROAD_STEPS, isLandRoad } from '../sim/roadConnections';
import { ROAD_COST } from './RoadTool';
import type { ZoneBrushTool } from './ZoneBrushTool';

/**
 * Zone areas: press to anchor, drag a rectangle, release to zone it.
 * A lot only grows beside a street, so a block deeper than two lots leaves
 * its middle empty for good; the area can lay its own streets first.
 */

/** Tiles of the rectangle spanned by `anchor` and `target`, row by row. */
export function zoneAreaTiles(anchor: TileCoord, target: TileCoord): TileCoord[] {
  const x0 = Math.min(anchor.x, target.x);
  const x1 = Math.max(anchor.x, target.x);
  const y0 = Math.min(anchor.y, target.y);
  const y1 = Math.max(anchor.y, target.y);
  const out: TileCoord[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out.push({ x, y });
  }
  return out;
}

/** Street every third line: two lots deep on each side, like a plat. */
const STREET_PITCH = 3;
/** Areas thinner than this are zoned as drawn; a street would eat half of them. */
const MIN_STREET_SPAN = 3;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function rectOf(anchor: TileCoord, target: TileCoord): Rect {
  return {
    x0: Math.min(anchor.x, target.x),
    y0: Math.min(anchor.y, target.y),
    x1: Math.max(anchor.x, target.x),
    y1: Math.max(anchor.y, target.y),
  };
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Dry, empty, road-free: a new street may go here. */
function canPave(map: CityMap, x: number, y: number): boolean {
  const tile = map.getTile(x, y);
  return !!tile &&
    tile.terrain !== TerrainType.Water &&
    tile.roadType === RoadType.None &&
    tile.buildingId === null;
}

/** A lot the area would zone: dry, no road, no building. */
function isOpenLot(map: CityMap, x: number, y: number): boolean {
  return canPave(map, x, y);
}

interface LayoutScore {
  readonly served: number;
  readonly unserved: number;
  readonly paved: number;
  readonly doubled: number;
}

/** Lots with and without a street beside them once `streets` are paved. */
function scoreLayout(map: CityMap, rect: Rect, streets: ReadonlySet<string>): LayoutScore {
  let served = 0;
  let unserved = 0;
  let doubled = 0;
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (streets.has(key(x, y)) || !isOpenLot(map, x, y)) continue;
      let sides = 0;
      for (const [dx, dy] of ROAD_STEPS) {
        if (streets.has(key(x + dx, y + dy)) || isLandRoad(map.getTile(x + dx, y + dy))) sides += 1;
      }
      if (sides === 0) unserved += 1;
      else served += 1;
      if (sides >= 2) doubled += 1;
    }
  }
  return { served, unserved, paved: streets.size, doubled };
}

/** Fewer stranded lots, then more on a street, fewer new streets, fewer corner-wasting lots. */
function better(a: LayoutScore, b: LayoutScore): boolean {
  if (a.unserved !== b.unserved) return a.unserved < b.unserved;
  if (a.served !== b.served) return a.served > b.served;
  if (a.paved !== b.paved) return a.paved < b.paved;
  return a.doubled < b.doubled;
}

/**
 * Lots newly on a street per street tile laid. Below this the streets mostly
 * eat lots that already had one (an existing grid): leave the area alone.
 */
const MIN_LOTS_PER_STREET_TILE = 0.5;

/** Land-road tiles reachable from an existing road, walking over roads and `streets`. */
function joinedToNetwork(map: CityMap, streets: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [];
  map.forEach((tile) => {
    if (isLandRoad(tile)) {
      seen.add(key(tile.x, tile.y));
      queue.push([tile.x, tile.y]);
    }
  });
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of ROAD_STEPS) {
      const k = key(x + dx, y + dy);
      if (!seen.has(k) && streets.has(k)) {
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  return seen;
}

/**
 * Planned streets that reach an existing road. Water or buildings can cut a
 * line into pieces; a piece nobody can drive to is dropped. With no road
 * nearby at all, the largest piece stays so the area still gets a network.
 */
function connectedStreets(map: CityMap, streets: readonly TileCoord[]): TileCoord[] {
  const set = new Set(streets.map((t) => key(t.x, t.y)));
  const joined = joinedToNetwork(map, set);
  const reached = streets.filter((t) => joined.has(key(t.x, t.y)));
  if (reached.length > 0) return reached;
  let largest: TileCoord[] = [];
  const seen = new Set<string>();
  for (const start of streets) {
    if (seen.has(key(start.x, start.y))) continue;
    const piece: TileCoord[] = [];
    const stack = [start];
    seen.add(key(start.x, start.y));
    while (stack.length > 0) {
      const t = stack.pop()!;
      piece.push(t);
      for (const [dx, dy] of ROAD_STEPS) {
        const k = key(t.x + dx, t.y + dy);
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push({ x: t.x + dx, y: t.y + dy });
        }
      }
    }
    if (piece.length > largest.length) largest = piece;
  }
  return largest;
}

/**
 * Streets that give every lot in the area a frontage, or none when the lots
 * already have one. Lines run along the long side every third row; a spine
 * down one short side ties them to each other and, where it can, to the
 * existing roads. Never bridges, never through buildings.
 */
export function autoStreetLayout(map: CityMap, anchor: TileCoord, target: TileCoord): TileCoord[] {
  const rect = rectOf(anchor, target);
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  if (Math.min(w, h) < MIN_STREET_SPAN) return [];
  const alongX = w >= h;
  const lines = alongX ? h : w;

  const lineTiles = (i: number): TileCoord[] => {
    const out: TileCoord[] = [];
    if (alongX) for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, y: rect.y0 + i });
    else for (let y = rect.y0; y <= rect.y1; y++) out.push({ x: rect.x0 + i, y });
    return out;
  };
  const spineTiles = (atStart: boolean): TileCoord[] => {
    const out: TileCoord[] = [];
    if (alongX) {
      const x = atStart ? rect.x0 : rect.x1;
      for (let y = rect.y0; y <= rect.y1; y++) out.push({ x, y });
    } else {
      const y = atStart ? rect.y0 : rect.y1;
      for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, y });
    }
    return out;
  };
  /** Existing land roads just outside a spine, along it and past its ends. */
  const spineContacts = (atStart: boolean): number => {
    let n = 0;
    const [ox, oy] = alongX ? [atStart ? -1 : 1, 0] : [0, atStart ? -1 : 1];
    const tiles = spineTiles(atStart);
    for (const t of tiles) if (isLandRoad(map.getTile(t.x + ox, t.y + oy))) n += 1;
    const first = tiles[0];
    const last = tiles[tiles.length - 1];
    const [ex, ey] = alongX ? [0, 1] : [1, 0];
    if (isLandRoad(map.getTile(first.x - ex, first.y - ey))) n += 1;
    if (isLandRoad(map.getTile(last.x + ex, last.y + ey))) n += 1;
    return n;
  };

  const paveable = (tiles: TileCoord[]): TileCoord[] => tiles.filter((t) => canPave(map, t.x, t.y));

  const bare = scoreLayout(map, rect, new Set());
  if (bare.unserved === 0) return [];
  let best: TileCoord[] = [];
  let bestScore: LayoutScore | null = null;

  for (let offset = 0; offset < STREET_PITCH; offset++) {
    const streets: TileCoord[] = [];
    for (let i = offset; i < lines; i += STREET_PITCH) streets.push(...paveable(lineTiles(i)));
    if (streets.length === 0) continue;
    let set = new Set(streets.map((t) => key(t.x, t.y)));
    const joined = joinedToNetwork(map, set);
    if (streets.some((t) => !joined.has(key(t.x, t.y)))) {
      const atStart = spineContacts(true) >= spineContacts(false);
      for (const t of paveable(spineTiles(atStart))) {
        if (!set.has(key(t.x, t.y))) streets.push(t);
      }
    }
    const kept = connectedStreets(map, streets);
    if (kept.length === 0) continue;
    set = new Set(kept.map((t) => key(t.x, t.y)));
    const score = scoreLayout(map, rect, set);
    if (score.served - bare.served < MIN_LOTS_PER_STREET_TILE * score.paved) continue;
    if (!bestScore || better(score, bestScore)) {
      best = kept;
      bestScore = score;
    }
  }
  return best;
}

/** What release would do to one tile of the area. */
export type AreaVerdict =
  /** Zoned, beside a street: it can grow. */
  | 'zone'
  /** Zoned, but no street beside it yet: it waits. */
  | 'noStreet'
  /** A new street the area lays so its lots can grow. */
  | 'street'
  /** Zone cleared (Dezone). */
  | 'clear'
  /** Already this zone. */
  | 'keep'
  /** Left alone: a building is in the way or the money ran out. */
  | 'blocked';

export interface AreaTile {
  readonly x: number;
  readonly y: number;
  readonly verdict: AreaVerdict;
  readonly cost: number;
  readonly reason?: 'building' | 'funds';
}

export interface AreaPlan {
  readonly tiles: readonly AreaTile[];
  /** Streets to pave first, in order. */
  readonly streets: readonly TileCoord[];
  /** Lots to zone (or clear) after, in order. */
  readonly lots: readonly TileCoord[];
  readonly cost: number;
  readonly noStreet: number;
  readonly blocked: readonly AreaTile[];
  /** Streets would help here: the lots lack frontage and the area is deep enough. */
  readonly streetsHelp: boolean;
}

/**
 * Dry-run the area in release order: streets first, then lots row by row,
 * spending as it goes. Roads and water inside the area are left as they are.
 */
export function planZoneArea(
  tool: ZoneBrushTool,
  anchor: TileCoord,
  target: TileCoord,
  sim: CitySim,
  withStreets: boolean,
): AreaPlan {
  const map = sim.map;
  const zone = tool.zoneType;
  const layout = zone === ZoneType.None ? [] : autoStreetLayout(map, anchor, target);
  const streets = withStreets ? layout : [];
  const streetSet = new Set(streets.map((t) => key(t.x, t.y)));
  let money = sim.stats.money;
  let cost = 0;
  let noStreet = 0;
  const tiles: AreaTile[] = [];
  const blocked: AreaTile[] = [];
  const pavedStreets: TileCoord[] = [];
  const lots: TileCoord[] = [];
  const block = (x: number, y: number, reason: 'building' | 'funds'): void => {
    const t: AreaTile = { x, y, verdict: 'blocked', cost: 0, reason };
    tiles.push(t);
    blocked.push(t);
  };

  const streetPrice = ROAD_COST[RoadType.Street];
  for (const t of streets) {
    if (streetPrice > money) {
      block(t.x, t.y, 'funds');
      streetSet.delete(key(t.x, t.y));
      continue;
    }
    money -= streetPrice;
    cost += streetPrice;
    pavedStreets.push(t);
    tiles.push({ x: t.x, y: t.y, verdict: 'street', cost: streetPrice });
  }

  const lotPrice = tool.cost;
  for (const { x, y } of zoneAreaTiles(anchor, target)) {
    if (streetSet.has(key(x, y))) continue;
    const tile = map.getTile(x, y);
    if (!tile || tile.terrain === TerrainType.Water || tile.roadType !== RoadType.None) continue;
    if (tile.zoneType === zone) {
      if (zone !== ZoneType.None) tiles.push({ x, y, verdict: 'keep', cost: 0 });
      continue;
    }
    if (tile.buildingId !== null) {
      block(x, y, 'building');
      continue;
    }
    if (lotPrice > money) {
      block(x, y, 'funds');
      continue;
    }
    money -= lotPrice;
    cost += lotPrice;
    lots.push({ x, y });
    if (zone === ZoneType.None) {
      tiles.push({ x, y, verdict: 'clear', cost: lotPrice });
      continue;
    }
    const fronted = ROAD_STEPS.some(([dx, dy]) =>
      streetSet.has(key(x + dx, y + dy)) || isLandRoad(map.getTile(x + dx, y + dy)));
    if (!fronted) noStreet += 1;
    tiles.push({ x, y, verdict: fronted ? 'zone' : 'noStreet', cost: lotPrice });
  }

  return {
    tiles,
    streets: pavedStreets,
    lots,
    cost,
    noStreet,
    blocked,
    streetsHelp: layout.length > 0,
  };
}

/** Status line while dragging: lots, streets, cost, and what will wait or be skipped. */
export function formatAreaPlan(label: string, plan: AreaPlan, withStreets: boolean, dezone: boolean): string {
  const name = label.replace(/^[^\w]+/, '').trim() || label;
  const lots = plan.lots.length;
  const parts: string[] = [];
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (dezone) {
    parts.push(lots > 0 ? `${name}: ${plural(lots, 'lot')} cleared` : `${name}: nothing zoned here`);
  } else if (lots === 0 && plan.streets.length === 0) {
    parts.push(`${name}: nothing new to zone here`);
  } else {
    const streets = plan.streets.length > 0 ? ` + ${plural(plan.streets.length, 'street tile')}` : '';
    parts.push(`${name}: ${plural(lots, 'lot')}${streets} · $${plan.cost.toLocaleString()}`);
  }
  if (plan.noStreet > 0) parts.push(`${plan.noStreet} without a street won't grow yet`);
  if (plan.blocked.length > 0) {
    const reasons = Array.from(new Set(plan.blocked.map((t) =>
      t.reason === 'funds' ? 'not enough money' : 'buildings in the way')));
    parts.push(`${plan.blocked.length} skipped (${reasons.join(', ')})`);
  }
  const hints = [dezone ? 'release to clear' : 'release to zone'];
  if (!dezone && plan.streetsHelp) hints.push(withStreets ? 'S: no streets' : 'S: lay streets');
  hints.push('Esc cancels', 'Shift paints freehand');
  parts.push(hints.join(' · '));
  return parts.join(' · ');
}

/** Status line after release. */
export function formatAreaResult(label: string, spent: number, plan: AreaPlan, dezone: boolean): string {
  const name = label.replace(/^[^\w]+/, '').trim() || label;
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (dezone) return `${name}: ${plural(plan.lots.length, 'lot')} cleared.`;
  const streets = plan.streets.length > 0 ? ` and ${plural(plan.streets.length, 'street tile')}` : '';
  const wait = plan.noStreet > 0 ? ` ${plural(plan.noStreet, 'lot')} wait for a street.` : '';
  return `${name}: ${plural(plan.lots.length, 'lot')}${streets} for $${spent.toLocaleString()}.${wait}`;
}
