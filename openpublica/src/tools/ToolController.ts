// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { TerrainType } from '../sim/CityTile';

export type ToolApplyResult = 'applied' | 'unchanged' | 'repeat';

/** Dollars and gaps from the pointer stroke that just ended. */
export interface StrokeSummary {
  spent: number;
  applied: number;
  blockedByWater: number;
}

const ROAD_TOOL_NAMES = new Set(['road', 'highway', 'trolleyAvenue']);

/**
 * Manages the active player tool and routes tile interactions to it.
 *
 * Responsibilities:
 * - Track which tool is active.
 * - Deduplicate drag events (do not re-apply to the same tile within one drag).
 * - Fill skipped tiles on stroke tools so a fast road drag stays connected.
 * - Fire the `onTileChanged` callback when a tile is mutated, so the render
 *   layer can refresh without tools touching the renderer directly.
 */
export class ToolController {
  private _activeTool: Tool;
  private readonly _tools = new Map<string, Tool>();
  private _lastDragCoord: TileCoord | null = null;
  private _onTileChangedCb: ((coord: TileCoord) => void) | undefined;
  private _strokeSpent = 0;
  private _strokeApplied = 0;
  private _strokeWater = 0;

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
   * Register a callback invoked whenever a tile is mutated by the active tool.
   * The render layer subscribes here to refresh the affected tile.
   */
  onTileChanged(callback: (coord: TileCoord) => void): void {
    this._onTileChangedCb = callback;
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

    const before = sim.stats.money;
    let applied = false;
    const roadStroke = ROAD_TOOL_NAMES.has(this._activeTool.name);
    for (const tile of tiles) {
      const mapTile = sim.getTile(tile.x, tile.y);
      const water = mapTile?.terrain === TerrainType.Water;
      if (this._activeTool.apply(tile, sim)) {
        this._onTileChangedCb?.(tile);
        applied = true;
        this._strokeApplied += 1;
      } else if (roadStroke && water) {
        this._strokeWater += 1;
      }
    }
    this._strokeSpent += Math.max(0, before - sim.stats.money);
    return applied ? 'applied' : 'unchanged';
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
      blockedByWater: this._strokeWater,
    };
    this._clearStroke();
    return summary;
  }

  private _clearStroke(): void {
    this._lastDragCoord = null;
    this._strokeSpent = 0;
    this._strokeApplied = 0;
    this._strokeWater = 0;
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
