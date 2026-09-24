// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType } from '../sim/CityTile';
import { bridgeProblem } from '../sim/roadConnections';
import { roadPaveCost, type RoadTool, type RoadToolBlock } from './RoadTool';

/**
 * Road lines: press to set an anchor, drag to preview, release to build.
 * The path runs along the longer axis first, then turns once, so a drag
 * never lays the staircase a freehand stroke leaves on diagonals.
 */

/** Tiles from `anchor` to `target` inclusive: the dominant axis, then one turn. */
export function roadLinePath(anchor: TileCoord, target: TileCoord): TileCoord[] {
  const out: TileCoord[] = [{ x: anchor.x, y: anchor.y }];
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const xFirst = Math.abs(dx) >= Math.abs(dy);
  let x = anchor.x;
  let y = anchor.y;
  const walkX = (): void => {
    while (x !== target.x) {
      x += Math.sign(dx);
      out.push({ x, y });
    }
  };
  const walkY = (): void => {
    while (y !== target.y) {
      y += Math.sign(dy);
      out.push({ x, y });
    }
  };
  if (xFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
  return out;
}

/** What release would do to one tile of the line. */
export type LineVerdict =
  /** New road on dry land. */
  | 'build'
  /** New road over water. */
  | 'bridge'
  /** A street upgraded to this tool's road type, for the difference in price. */
  | 'upgrade'
  /** Already road; the line passes through (an intersection) at no cost. */
  | 'keep'
  /** Left alone, for the given reason. */
  | 'blocked';

export interface PlannedTile {
  readonly x: number;
  readonly y: number;
  readonly verdict: LineVerdict;
  readonly cost: number;
  readonly reason?: RoadToolBlock;
}

export interface LinePlan {
  readonly tiles: readonly PlannedTile[];
  readonly cost: number;
  readonly built: number;
  readonly bridges: number;
  readonly blocked: readonly PlannedTile[];
}

/**
 * Dry-run the line in order, as release will build it: earlier tiles count as
 * road for the bridge rules, and the treasury runs down as it goes.
 */
export function planRoadLine(tool: RoadTool, path: readonly TileCoord[], sim: CitySim): LinePlan {
  const planned = new Set<string>();
  const isPlanned = (x: number, y: number): boolean => planned.has(`${x},${y}`);
  let money = sim.stats.money;
  let cost = 0;
  let built = 0;
  let bridges = 0;
  const tiles: PlannedTile[] = [];
  const blocked: PlannedTile[] = [];
  const block = (x: number, y: number, reason: RoadToolBlock): void => {
    const tile: PlannedTile = { x, y, verdict: 'blocked', cost: 0, reason };
    tiles.push(tile);
    blocked.push(tile);
  };

  for (const { x, y } of path) {
    const tile = sim.getTile(x, y);
    if (!tile) continue;
    if (tile.buildingId !== null) {
      block(x, y, 'building');
      continue;
    }
    const existing = tile.roadType;
    if (existing === tool.roadType || (existing !== RoadType.None && existing !== RoadType.Street)) {
      tiles.push({ x, y, verdict: 'keep', cost: 0 });
      continue;
    }
    const problem = bridgeProblem(sim.map, x, y, isPlanned);
    if (problem) {
      block(x, y, problem);
      continue;
    }
    const water = tile.terrain === TerrainType.Water;
    const price = roadPaveCost(tool.roadType, existing, water);
    if (price > money) {
      block(x, y, 'funds');
      continue;
    }
    money -= price;
    cost += price;
    built += 1;
    if (water) bridges += 1;
    planned.add(`${x},${y}`);
    const verdict: LineVerdict = existing === RoadType.Street ? 'upgrade' : water ? 'bridge' : 'build';
    tiles.push({ x, y, verdict, cost: price });
  }
  return { tiles, cost, built, bridges, blocked };
}

const BLOCK_NOTE: Partial<Record<RoadToolBlock, string>> = {
  building: 'a building is in the way',
  'bridge-turn': 'bridges run straight',
  'bridge-branch': 'nothing joins a bridge from the side',
  funds: 'not enough money',
};

/** Status line while dragging: tiles, cost, bridges, and what will be skipped. */
export function formatLinePlan(label: string, plan: LinePlan): string {
  const name = label.replace(/^[^\w]+/, '').trim() || label;
  const parts: string[] = [];
  if (plan.built === 0) {
    parts.push(`${name}: nothing new to build here`);
  } else {
    const bridges = plan.bridges > 0 ? `, ${plan.bridges} bridge${plan.bridges === 1 ? '' : 's'}` : '';
    parts.push(`${name}: ${plan.built} tile${plan.built === 1 ? '' : 's'}${bridges} · $${plan.cost.toLocaleString()}`);
  }
  if (plan.blocked.length > 0) {
    const reasons = Array.from(new Set(plan.blocked.map((t) => BLOCK_NOTE[t.reason!] ?? 'blocked')));
    parts.push(`${plan.blocked.length} skipped (${reasons.join(', ')})`);
  }
  parts.push('release to build · Esc cancels · Shift paints freehand');
  return parts.join(' · ');
}
