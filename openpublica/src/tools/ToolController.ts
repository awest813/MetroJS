// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTilesChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { TerrainType } from '../sim/CityTile';
import { isRoadTool } from './RoadTool';

export type ToolApplyResult = 'applied' | 'unchanged' | 'repeat';

/** Dollars and gaps from the pointer stroke that just ended. */
export interface StrokeSummary {
  spent: number;
  applied: number;
  /** Road tiles laid over water as bridge spans. */
  bridged: number;
  /** Water tiles skipped because a bridge there would turn or branch. */
  blockedByBridge: number;
  /** Road tiles skipped because the treasury ran dry mid-stroke. */
  blockedByFunds: number;
}

/**
 * Manages the active player tool and routes tile interactions to it.
 *
 * Responsibilities:
 * - Track which tool is active.
 * - Deduplicate drag events (do not re-apply to the same tile within one drag).
 * - Fill skipped tiles on stroke tools so a fast road drag stays connected.
 * - Fire the `onTilesChanged` callback with the tiles each call mutated, so
 *   the render layer can refresh without tools touching the renderer directly.
 * - Batch each call's edits so the sim refreshes derived state once.
 */
export class ToolController {
  private _activeTool: Tool;
  private readonly _tools = new Map<string, Tool>();
  private _lastDragCoord: TileCoord | null = null;
  private _onTilesChangedCb: ((coords: readonly TileCoord[]) => void) | undefined;
  private _strokeSpent = 0;
  private _strokeApplied = 0;
  private _strokeBridged = 0;
  private _strokeBridgeBlocked = 0;
  private _strokeFunds = 0;

  constructor(defaultTool: Tool) {
    this._activeTool = defaultTool;
    this.register(defaultTool);
  }

  /** Register a tool so it can be activated by name. */
  register(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  /** Switch the active tool. No-op if `name` is not registered. */
  setActiveTool(name: string): void {
    const t = this._tools.get(name);
    if (t) {
      this._activeTool = t;
      this._clearStroke();
    }
  }

  get activeTool(): Tool {
    return this._activeTool;
  }

  /**
   * Register a callback invoked with the tiles the active tool mutated, once
   * per apply call. The render layer subscribes here to refresh them.
   */
  onTilesChanged(callback: (coords: readonly TileCoord[]) => void): void {
    this._onTilesChangedCb = callback;
  }

  /**
   * Apply the active tool to the tile at `coord`.
   * Deduplicates drag events — the same tile is only processed once per
   * continuous drag stroke (pointer-down → pointer-up).
   * Stroke tools also pave every 4-connected tile the pointer skipped.
   */
  applyToTile(coord: TileCoord, sim: CitySim): ToolApplyResult {
    if (
      this._lastDragCoord &&
      this._lastDragCoord.x === coord.x &&
      this._lastDragCoord.y === coord.y
    ) {
      return 'repeat';
    }

    const tiles =
      this._activeTool.stroke && this._lastDragCoord
        ? strokeTiles(this._lastDragCoord, coord)
        : [coord];
    this._lastDragCoord = coord;
    return this.applyTiles(tiles, sim) > 0 ? 'applied' : 'unchanged';
  }

  /**
   * Apply a tool (the active one by default) to each listed tile, in order, as
   * one edit: the sim refreshes once and `onTilesChanged` fires once. Counts
   * toward the current stroke summary. Returns how many tiles changed.
   */
  applyTiles(tiles: readonly TileCoord[], sim: CitySim, tool: Tool = this._activeTool): number {
    const before = sim.stats.money;
    const changed: TileCoord[] = [];
    sim.batch(() => {
      for (const tile of tiles) {
        const water = sim.getTile(tile.x, tile.y)?.terrain === TerrainType.Water;
        if (tool.apply(tile, sim)) {
          changed.push(tile);
          this._strokeApplied += 1;
          if (water && isRoadTool(tool)) this._strokeBridged += 1;
        } else if (isRoadTool(tool)) {
          const why = tool.blockAt(tile, sim);
          if (why === 'bridge-turn' || why === 'bridge-branch') this._strokeBridgeBlocked += 1;
          else if (why === 'funds') this._strokeFunds += 1;
        }
      }
    });
    this._strokeSpent += Math.max(0, before - sim.stats.money);
    if (changed.length > 0) this._onTilesChangedCb?.(changed);
    return changed.length;
  }

  /**
   * Reset drag-deduplication state.
   * Call this when the player releases the pointer (pointer-up) so that
   * clicking the same tile again starts a new stroke.
   */
  resetDrag(): StrokeSummary {
    const summary: StrokeSummary = {
      spent: this._strokeSpent,
      applied: this._strokeApplied,
      bridged: this._strokeBridged,
      blockedByBridge: this._strokeBridgeBlocked,
      blockedByFunds: this._strokeFunds,
    };
    this._clearStroke();
    return summary;
  }

  private _clearStroke(): void {
    this._lastDragCoord = null;
    this._strokeSpent = 0;
    this._strokeApplied = 0;
    this._strokeBridged = 0;
    this._strokeBridgeBlocked = 0;
    this._strokeFunds = 0;
  }
}

/**
 * 4-connected tiles from `from` to `to`, excluding `from`.
 * Cardinal steps only — road graphs have no diagonal edges, so a diagonal
 * Bresenham line would still leave cars with nowhere to drive.
 */
export function strokeTiles(from: TileCoord, to: TileCoord): TileCoord[] {
  const tiles: TileCoord[] = [];
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    const dx = to.x - x;
    const dy = to.y - y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      x += Math.sign(dx);
    } else {
      y += Math.sign(dy);
    }
    tiles.push({ x, y });
  }
  return tiles;
}
