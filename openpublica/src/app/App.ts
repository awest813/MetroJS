import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { TilePicker } from '../render/TilePicker';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { GameMap } from '../sim/GameMap';
import { InspectTool } from '../tools/InspectTool';
import { RoadTool } from '../tools/RoadTool';
import { ResidentialTool } from '../tools/ResidentialTool';
import { BulldozeTool } from '../tools/BulldozeTool';
import { ToolManager } from '../tools/ToolManager';
import { Toolbar } from '../ui/Toolbar';

/**
 * Top-level application coordinator.
 * Wires the simulation, renderer, tools, and UI together.
 */
export class App {
  constructor() {
    const canvas = document.getElementById('game-canvas');
    const toolbarEl = document.getElementById('toolbar');
    const statusEl = document.getElementById('status-bar');

    if (!(canvas instanceof HTMLCanvasElement) || !toolbarEl || !statusEl) {
      throw new Error('Required DOM elements not found: #game-canvas, #toolbar, #status-bar');
    }

    // ── Simulation (no Babylon dependency) ──────────────────────────────────
    const map = new GameMap();

    // ── Tools ────────────────────────────────────────────────────────────────
    const inspectTool = new InspectTool();
    const roadTool = new RoadTool();
    const residentialTool = new ResidentialTool();
    const bulldozeTool = new BulldozeTool();

    const toolManager = new ToolManager(inspectTool);
    [roadTool, residentialTool, bulldozeTool].forEach((t) => toolManager.register(t));

    // ── Babylon.js renderer ──────────────────────────────────────────────────
    const { scene } = createScene(canvas);

    const terrain = new TerrainRenderer(scene);
    terrain.buildGrid(map);

    const highlight = new HighlightRenderer(scene);
    const picker = new TilePicker(scene);

    // ── Wire interactions ────────────────────────────────────────────────────
    picker.onPick((coord) => {
      toolManager.applyToTile(coord, map);

      const tile = map.getTile(coord.x, coord.y);
      if (tile) terrain.updateTile(tile);

      highlight.show(coord);
      statusEl.textContent =
        `Tile (${coord.x}, ${coord.y})  ·  Tool: ${toolManager.activeTool.label}`;
    });

    // ── Toolbar UI ───────────────────────────────────────────────────────────
    const toolbar = new Toolbar(toolbarEl, toolManager);
    toolbar.build([inspectTool, roadTool, residentialTool, bulldozeTool]);
  }
}
