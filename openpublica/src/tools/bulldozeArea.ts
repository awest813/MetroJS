// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { BULLDOZE_COST } from './BulldozeTool';
import { zoneAreaTiles } from './zoneArea';

/**
 * Bulldoze areas: press to anchor, drag a rectangle, release to clear it.
 * The preview shows what would come down before anything does, and Esc
 * cancels, so a slip of the mouse cannot raze a street of houses unseen.
 */

/** What release would do to one tile of the rectangle. */
export type ClearVerdict =
  /** A building comes down, and its lot's zoning with it. */
  | 'building'
  /** A road on land is torn up. */
  | 'road'
  /** A bridge span is taken out; the water stays. */
  | 'bridge'
  /** An empty zoned lot is unzoned. */
  | 'zone'
  /** Nothing here to clear. */
  | 'empty'
  /** Would be cleared, but the money runs out first. */
  | 'funds';

export interface ClearTile {
  readonly x: number;
  readonly y: number;
  readonly verdict: ClearVerdict;
}

export interface ClearPlan {
  readonly tiles: readonly ClearTile[];
  /** The tiles release clears, in the order it clears them. */
  readonly lots: readonly TileCoord[];
  readonly cost: number;
  readonly buildings: number;
  /** Civic buildings among them, by kind ("power plant"), one entry each. */
  readonly services: readonly string[];
  readonly roads: number;
  readonly bridges: number;
  readonly zones: number;
  /** Tiles left standing because the money ran out. */
  readonly blocked: number;
}

/** A civic building's kind in a sentence: "Small Power Plant" → "power plant". */
function serviceKind(name: string): string {
  return name.replace(/^Small\s+/i, '').toLowerCase();
}

/**
 * Dry-run a bulldoze rectangle in the order release clears it, at
 * {@link BULLDOZE_COST} a tile, the treasury running down as it goes.
 */
export function planBulldozeArea(anchor: TileCoord, target: TileCoord, sim: CitySim): ClearPlan {
  let money = sim.stats.money;
  const tiles: ClearTile[] = [];
  const lots: TileCoord[] = [];
  const services: string[] = [];
  let buildings = 0;
  let roads = 0;
  let bridges = 0;
  let zones = 0;
  let blocked = 0;
  for (const { x, y } of zoneAreaTiles(anchor, target)) {
    const tile = sim.getTile(x, y);
    if (!tile) continue;
    let verdict: ClearVerdict;
    if (tile.buildingId !== null) verdict = 'building';
    else if (tile.roadType !== RoadType.None) verdict = tile.terrain === TerrainType.Water ? 'bridge' : 'road';
    else if (tile.zoneType !== ZoneType.None) verdict = 'zone';
    else verdict = 'empty';
    if (verdict !== 'empty' && money < BULLDOZE_COST) {
      tiles.push({ x, y, verdict: 'funds' });
      blocked += 1;
      continue;
    }
    tiles.push({ x, y, verdict });
    if (verdict === 'empty') continue;
    money -= BULLDOZE_COST;
    lots.push({ x, y });
    if (verdict === 'building') {
      buildings += 1;
      const def = sim.growth.defs.get(tile.buildingId!);
      if (def?.isService) services.push(serviceKind(def.name));
    } else if (verdict === 'road') {
      roads += 1;
    } else if (verdict === 'bridge') {
      bridges += 1;
    } else {
      zones += 1;
    }
  }
  return { tiles, lots, cost: lots.length * BULLDOZE_COST, buildings, services, roads, bridges, zones, blocked };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "a power plant", "2 parks": each civic kind once, in the order met. */
function serviceItems(services: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const kind of services) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return Array.from(counts, ([kind, n]) => (n === 1 ? `a ${kind}` : plural(n, kind)));
}

/** What the plan clears, as list items: "5 buildings", "a park", "3 road tiles". */
function clearedItems(plan: ClearPlan): string[] {
  const items: string[] = [];
  const grown = plan.buildings - plan.services.length;
  if (grown > 0) items.push(plural(grown, 'building'));
  items.push(...serviceItems(plan.services));
  if (plan.roads > 0) items.push(plural(plan.roads, 'road tile'));
  if (plan.bridges > 0) items.push(plural(plan.bridges, 'bridge span'));
  if (plan.zones > 0) items.push(plural(plan.zones, 'zoned lot'));
  return items;
}

/** Status line while dragging: what comes down, the cost, and what the money leaves standing. */
export function formatBulldozePlan(label: string, plan: ClearPlan): string {
  const name = label.replace(/^[^\w]+/, '').trim() || label;
  const items = clearedItems(plan);
  const parts: string[] = [];
  parts.push(items.length > 0
    ? `${name}: ${items.join(', ')} · $${plan.cost.toLocaleString()}`
    : `${name}: nothing to clear here`);
  if (plan.blocked > 0) parts.push(`${plan.blocked} left standing (not enough money)`);
  parts.push('release to clear · Esc cancels · Shift paints freehand');
  return parts.join(' · ');
}

/** Status line after release. */
export function formatBulldozeResult(spent: number, plan: ClearPlan): string {
  const items = clearedItems(plan);
  const list = items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? 'nothing';
  const short = plan.blocked > 0 ? ' Ran out of money partway.' : '';
  return `Bulldozed ${list} for $${Math.round(spent).toLocaleString()}.${short}`;
}
