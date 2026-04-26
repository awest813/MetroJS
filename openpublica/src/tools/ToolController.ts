// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/**
 * Manages the active player tool and routes tile interactions to it.
 *
 * Responsibilities:
 * - Track which tool is active.
 * - Deduplicate drag events (do not re-apply to the same tile within one drag).
 * - Fire the `onTileChanged` callback when a tile is mutated, so the render
 *   layer can refresh without tools touching the renderer directly.
 */
export class ToolController {
  private _activeTool: Tool;
  private readonly _tools = new Map<string, Tool>();
  private _lastDragCoord: TileCoord | null = null;
  private _onTileChangedCb: ((coord: TileCoord) => void) | undefined;

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
      this._lastDragCoord = null; // reset drag state on tool switch
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
   */
  applyToTile(coord: TileCoord, sim: CitySim): void {
    if (
      this._lastDragCoord &&
      this._lastDragCoord.x === coord.x &&
      this._lastDragCoord.y === coord.y
    ) {
      return;
    }
    this._lastDragCoord = coord;

    const changed = this._activeTool.apply(coord, sim);
    if (changed) {
      this._onTileChangedCb?.(coord);
    }
  }

  /**
   * Reset drag-deduplication state.
   * Call this when the player releases the pointer (pointer-up) so that
   * clicking the same tile again starts a new stroke.
   */
  resetDrag(): void {
    this._lastDragCoord = null;
  }
}
