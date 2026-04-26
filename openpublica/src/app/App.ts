import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { TilePicker } from '../render/TilePicker';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { CitySim } from '../sim/CitySim';
import { MAP_SIZE } from '../data/constants';
import { InspectTool } from '../tools/InspectTool';
import { RoadTool } from '../tools/RoadTool';
import {
  createResidentialLowBrush,
  createCommercialLowBrush,
  createIndustrialLightBrush,
} from '../tools/ZoneBrushTool';
import { BulldozeTool } from '../tools/BulldozeTool';
import { ToolController } from '../tools/ToolController';
import { Toolbar } from '../ui/Toolbar';

/**
 * Top-level application coordinator.
 * Wires the simulation, renderer, tools, and UI together.
 */
export class App {
  constructor() {
    const canvas    = document.getElementById('game-canvas');
    const toolbarEl = document.getElementById('toolbar');
    const statusEl  = document.getElementById('status-bar');

    if (!(canvas instanceof HTMLCanvasElement) || !toolbarEl || !statusEl) {
      throw new Error('Required DOM elements not found: #game-canvas, #toolbar, #status-bar');
    }

    // ── Simulation (no Babylon dependency) ──────────────────────────────────
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE);

    // ── Tools ────────────────────────────────────────────────────────────────
    const inspectTool     = new InspectTool();
    const roadTool        = new RoadTool();
    const residentialTool = createResidentialLowBrush();
    const commercialTool  = createCommercialLowBrush();
    const industrialTool  = createIndustrialLightBrush();
    const bulldozeTool    = new BulldozeTool();

    const allTools = [
      inspectTool,
      roadTool,
      residentialTool,
      commercialTool,
      industrialTool,
      bulldozeTool,
    ];

    const toolController = new ToolController(inspectTool);
    allTools.slice(1).forEach((t) => toolController.register(t));

    // ── Babylon.js renderer ──────────────────────────────────────────────────
    const { scene, engine } = createScene(canvas);

    const terrain   = new TerrainRenderer(scene);
    terrain.buildCityGrid(sim.map);

    const buildings = new BuildingRenderer(scene);
    const highlight = new HighlightRenderer(scene);
    const picker    = new TilePicker(scene);

    // ── Renderer reacts to tile mutations via ToolController callback ─────────
    toolController.onTileChanged((coord) => {
      const tile = sim.getTile(coord.x, coord.y);
      if (tile) {
        terrain.updateCityTile(tile);
        // If the tile no longer has a building (e.g. bulldozed), remove its mesh.
        if (tile.buildingId === null) {
          buildings.removeBuilding(coord.x, coord.y);
        }
      }
    });

    // ── Growth system updates renderer when buildings appear ─────────────────
    sim.onGrowth = (changed) => {
      for (const coord of changed) {
        const tile = sim.getTile(coord.x, coord.y);
        if (tile) {
          terrain.updateCityTile(tile);
          if (tile.buildingId !== null) {
            const instance = sim.growth.buildings.get(`${coord.x},${coord.y}`);
            if (instance) {
              buildings.addBuilding(instance, tile.zoneType);
            }
          }
        }
      }
    };

    // ── Advance the simulation clock every rendered frame ────────────────────
    scene.onBeforeRenderObservable.add(() => {
      sim.tick(engine.getDeltaTime() / 1000);
    });

    // ── Wire interactions ────────────────────────────────────────────────────
    picker.onPick((coord) => {
      toolController.applyToTile(coord, sim);
      highlight.show(coord);

      const tile    = sim.getTile(coord.x, coord.y);
      const pickData = buildings.selectBuilding(coord.x, coord.y);

      let info = `Tile (${coord.x}, ${coord.y})  ·  Tool: ${toolController.activeTool.label}` +
        `  ·  $${sim.stats.money.toLocaleString()}` +
        `  ·  Pop: ${sim.stats.population}  Jobs: ${sim.stats.jobs}`;

      if (pickData) {
        info += `  ·  Building: ${pickData.buildingId}`;
      } else if (tile) {
        info += `  ·  zone=${tile.zoneType} road=${tile.roadType}`;
      }

      statusEl.textContent = info;
    });

    picker.onDragEnd(() => toolController.resetDrag());

    // ── Toolbar UI ───────────────────────────────────────────────────────────
    const toolbar = new Toolbar(toolbarEl, toolController);
    toolbar.build(allTools);
  }
}
