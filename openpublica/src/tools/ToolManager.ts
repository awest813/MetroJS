import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { GameMap } from '../sim/GameMap';

/** Manages which tool is currently active and routes tile clicks to it. */
export class ToolManager {
  private _activeTool: Tool;
  private readonly _tools = new Map<string, Tool>();

  constructor(defaultTool: Tool) {
    this._activeTool = defaultTool;
    this.register(defaultTool);
  }

  register(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  setActiveTool(name: string): void {
    const t = this._tools.get(name);
    if (t) this._activeTool = t;
  }

  get activeTool(): Tool {
    return this._activeTool;
  }

  /** Forward a tile click to the currently active tool. */
  applyToTile(coord: TileCoord, map: GameMap): void {
    this._activeTool.onTileClick(coord, map);
  }
}
