import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

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

  /** Forward a tile interaction to the currently active tool. */
  applyToTile(coord: TileCoord, sim: CitySim): void {
    this._activeTool.apply(coord, sim);
  }
}
