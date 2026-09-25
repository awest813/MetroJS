// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CityMap } from '../sim/CityMap';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { ROAD_STEPS, bridgeProblem, isLandRoad } from '../sim/roadConnections';
import { groveStrengths, isWooded } from '../sim/woods';
import { formatSmogReach, smogReach, type SmogReach } from '../sim/smogReach';
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

/**
 * A new street may go here and the road tool will build it: paveable, and not
 * joining a bridge span from the side (bridges take no side streets).
 */
function canPaveStreet(map: CityMap, x: number, y: number): boolean {
  return canPave(map, x, y) && bridgeProblem(map, x, y) === null;
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
 * Drop dead-end tails inside the area: a planned street with only one road
 * beside it whose lots all front another street too (a spine running on past
 * the last line). The tile goes back to being a lot on that street.
 */
function pruneTails(map: CityMap, rect: Rect, streets: readonly TileCoord[]): TileCoord[] {
  const set = new Set(streets.map((t) => key(t.x, t.y)));
  const roadAt = (x: number, y: number): boolean => set.has(key(x, y)) || isLandRoad(map.getTile(x, y));
  const inRect = (x: number, y: number): boolean => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
  const frontages = (x: number, y: number): number => ROAD_STEPS.filter(([dx, dy]) => roadAt(x + dx, y + dy)).length;
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const t of streets) {
      const k = key(t.x, t.y);
      if (!set.has(k) || !inRect(t.x, t.y) || frontages(t.x, t.y) !== 1) continue;
      const lotsKeepAStreet = ROAD_STEPS.every(([dx, dy]) => {
        const x = t.x + dx;
        const y = t.y + dy;
        return roadAt(x, y) || !inRect(x, y) || !isOpenLot(map, x, y) || frontages(x, y) >= 2;
      });
      if (!lotsKeepAStreet) continue;
      set.delete(k);
      pruned = true;
    }
  }
  return streets.filter((t) => set.has(key(t.x, t.y)));
}

/** Longest run of street a planned grid lays beyond its area to reach a road. */
const MAX_STUB = 4;

/**
 * Lines at least this long are tied to a road at both ends, so each block is
 * a loop rather than a dead-end comb: cars and service trucks can go round,
 * and trips from the far lots spread both ways.
 */
export const LOOP_MIN_LINE = 8;

/** Longest run of street a line's far end lays past the area to tie into a road. */
const MAX_TIE = 2;

/**
 * Lines longer than this get a cross street through the middle (one per this
 * many tiles), so the inner lines of a wide district meet halfway along
 * instead of only at its spines: patrols, commutes, and trucks stop going
 * the long way round.
 */
export const CROSS_STREET_SPACING = 9;

/** Where cross streets go along a line of `length` tiles (0-based offsets from its start). */
export function crossStreetOffsets(length: number): number[] {
  const count = Math.floor((length - 1) / CROSS_STREET_SPACING);
  const out: number[] = [];
  for (let k = 1; k <= count; k++) out.push(Math.round(k * (length - 1) / (count + 1)));
  return out;
}

/**
 * The shortest straight run of new street, out from the edge of the area,
 * that joins a planned street to an existing land road: at most
 * {@link MAX_STUB} tiles, never over water or through a building. Empty when
 * no road is that close.
 */
function stubToNetwork(map: CityMap, rect: Rect, streets: readonly TileCoord[]): TileCoord[] {
  let best: TileCoord[] | null = null;
  for (const t of streets) {
    for (const [dx, dy] of ROAD_STEPS) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (nx >= rect.x0 && nx <= rect.x1 && ny >= rect.y0 && ny <= rect.y1) continue;
      const run: TileCoord[] = [];
      for (let step = 1; step <= MAX_STUB + 1; step++) {
        const x = t.x + dx * step;
        const y = t.y + dy * step;
        if (isLandRoad(map.getTile(x, y))) {
          if (run.length > 0 && (!best || run.length < best.length)) best = run;
          break;
        }
        if (step > MAX_STUB || !canPaveStreet(map, x, y)) break;
        run.push({ x, y });
      }
    }
  }
  return best ?? [];
}

/**
 * Streets that give every lot in the area a frontage, or none when the lots
 * already have one. Lines run along the long side every third row; a spine
 * down one short side ties them to each other and, where it can, to the
 * existing roads. A grid that would still be an island lays a short stub to
 * a road a few tiles off. Lines of {@link LOOP_MIN_LINE} or more are tied at
 * their other end too, by a short run to a road just past the area or a
 * second spine, so the blocks close into loops (dropped if that would pave
 * more than the lots it serves allow). Two or more lines longer than
 * {@link CROSS_STREET_SPACING} also get cross streets through the middle. A
 * spine's dead-end tail past the last line is left as lots. Never bridges,
 * never through buildings.
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

  const paveable = (tiles: TileCoord[]): TileCoord[] => tiles.filter((t) => canPaveStreet(map, t.x, t.y));
  /** A street across the lines, `offset` tiles along them from the area's start. */
  const crossTiles = (offset: number): TileCoord[] => {
    const out: TileCoord[] = [];
    if (alongX) for (let y = rect.y0; y <= rect.y1; y++) out.push({ x: rect.x0 + offset, y });
    else for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, y: rect.y0 + offset });
    return out;
  };

  const bare = scoreLayout(map, rect, new Set());
  if (bare.unserved === 0) return [];
  let best: TileCoord[] = [];
  let bestScore: LayoutScore | null = null;

  const lineLength = alongX ? w : h;
  /** The line's end tile on one short side, and the step out of the area past it. */
  const lineEnd = (i: number, atStart: boolean): { end: TileCoord; dx: number; dy: number } => {
    const tiles = lineTiles(i);
    const end = atStart ? tiles[0] : tiles[tiles.length - 1];
    const out = atStart ? -1 : 1;
    return alongX ? { end, dx: out, dy: 0 } : { end, dx: 0, dy: out };
  };
  /**
   * Streets that tie each line's end on one side to a road: nothing where it
   * already meets one, a run of up to {@link MAX_TIE} tiles to a road just
   * past the area, or else a spine down that side.
   */
  const tieSide = (lineIds: readonly number[], atStart: boolean, planned: ReadonlySet<string>): TileCoord[] => {
    const roadAt = (x: number, y: number): boolean => planned.has(key(x, y)) || isLandRoad(map.getTile(x, y));
    const runs: TileCoord[] = [];
    let spine = false;
    for (const i of lineIds) {
      const { end, dx, dy } = lineEnd(i, atStart);
      if (!planned.has(key(end.x, end.y)) || roadAt(end.x + dx, end.y + dy)) continue;
      const run: TileCoord[] = [];
      let tied = false;
      for (let step = 1; step <= MAX_TIE + 1; step++) {
        const x = end.x + dx * step;
        const y = end.y + dy * step;
        if (roadAt(x, y)) {
          tied = true;
          break;
        }
        if (step > MAX_TIE || !canPaveStreet(map, x, y)) break;
        run.push({ x, y });
      }
      if (tied) runs.push(...run);
      else spine = true;
    }
    if (!spine) return runs;
    return paveable(spineTiles(atStart)).filter((t) => !planned.has(key(t.x, t.y)));
  };
  /** The candidate kept and scored, or null when it strands every street or paves too much. */
  const judge = (streets: TileCoord[]): { kept: TileCoord[]; score: LayoutScore } | null => {
    const kept = pruneTails(map, rect, connectedStreets(map, streets));
    if (kept.length === 0) return null;
    const score = scoreLayout(map, rect, new Set(kept.map((t) => key(t.x, t.y))));
    if (score.served - bare.served < MIN_LOTS_PER_STREET_TILE * score.paved) return null;
    return { kept, score };
  };

  for (let offset = 0; offset < STREET_PITCH; offset++) {
    const streets: TileCoord[] = [];
    const lineIds: number[] = [];
    for (let i = offset; i < lines; i += STREET_PITCH) {
      const tiles = paveable(lineTiles(i));
      if (tiles.length > 0) lineIds.push(i);
      streets.push(...tiles);
    }
    if (streets.length === 0) continue;
    let set = new Set(streets.map((t) => key(t.x, t.y)));
    let joined = joinedToNetwork(map, set);
    let spineAt: boolean | null = null;
    if (streets.some((t) => !joined.has(key(t.x, t.y)))) {
      spineAt = spineContacts(true) >= spineContacts(false);
      for (const t of paveable(spineTiles(spineAt))) {
        if (!set.has(key(t.x, t.y))) streets.push(t);
      }
      joined = joinedToNetwork(map, new Set(streets.map((t) => key(t.x, t.y))));
    }
    if (!streets.some((t) => joined.has(key(t.x, t.y)))) streets.push(...stubToNetwork(map, rect, streets));
    let candidate = judge(streets);
    if (!candidate) continue;

    if (lineLength >= LOOP_MIN_LINE) {
      const looped = [...streets];
      set = new Set(looped.map((t) => key(t.x, t.y)));
      for (const atStart of [true, false]) {
        if (spineAt === atStart) continue;
        for (const t of tieSide(lineIds, atStart, set)) {
          set.add(key(t.x, t.y));
          looped.push(t);
        }
      }
      const closed = looped.length > streets.length ? judge(looped) : null;
      if (closed && closed.score.unserved <= candidate.score.unserved) candidate = closed;
    }

    // Cross streets tie two or more long lines together halfway along.
    const offsets = lineIds.length >= 2 ? crossStreetOffsets(lineLength) : [];
    if (offsets.length > 0) {
      const crossed = [...candidate.kept];
      const planned = new Set(crossed.map((t) => key(t.x, t.y)));
      for (const offset of offsets) {
        for (const t of paveable(crossTiles(offset))) {
          if (planned.has(key(t.x, t.y))) continue;
          planned.add(key(t.x, t.y));
          crossed.push(t);
        }
      }
      const withCross = crossed.length > candidate.kept.length ? judge(crossed) : null;
      if (withCross && withCross.score.unserved <= candidate.score.unserved) candidate = withCross;
    }

    if (!bestScore || better(candidate.score, bestScore)) {
      best = candidate.kept;
      bestScore = candidate.score;
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
  /** Wooded tiles the new streets and zones would clear. */
  readonly woods: number;
  /** For a factory area: the homes and shops its first factories' smog would reach. */
  readonly smog?: SmogReach;
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
    woods: _woodedAmong(sim, [...pavedStreets, ...lots]),
    ...(zone === ZoneType.Industrial ? { smog: _factorySmog(sim, lots) } : {}),
  };
}

/** The smog the area's first factories (the smallest that grow) would spread onto homes and shops. */
function _factorySmog(sim: CitySim, lots: readonly TileCoord[]): SmogReach {
  let first: { pollutionOutput?: number; pollutionRadius?: number; population: number; jobs: number } | undefined;
  for (const def of sim.growth.defs.values()) {
    if (def.zoneType !== ZoneType.Industrial || def.isService) continue;
    if (!first || def.population + def.jobs < first.population + first.jobs) first = def;
  }
  return smogReach(
    sim.map,
    lots,
    first?.pollutionOutput ?? 0,
    first?.pollutionRadius ?? 0,
    new Set(lots.map((t) => key(t.x, t.y))),
  );
}

function _woodedAmong(sim: CitySim, tiles: readonly TileCoord[]): number {
  const map = sim.map;
  const strengths = groveStrengths(sim.terrainSeed, map.width, map.height);
  let n = 0;
  for (const t of tiles) {
    const tile = map.getTile(t.x, t.y);
    if (tile && isWooded(tile, strengths, map.width)) n += 1;
  }
  return n;
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
  if (!dezone && plan.woods > 0) parts.push(`clears woods on ${plan.woods} tile${plan.woods === 1 ? '' : 's'}`);
  const smog = plan.smog ? formatSmogReach(plan.smog, "its factories'") : null;
  if (smog) parts.push(smog);
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
