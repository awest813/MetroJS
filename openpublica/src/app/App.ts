import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { PowerOverlayRenderer } from '../render/PowerOverlayRenderer';
import { TilePicker } from '../render/TilePicker';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { CitySim } from '../sim/CitySim';
import { tileKey } from '../sim/ZoneGrowthSystem';
import { MAP_SIZE } from '../data/constants';
import { InspectTool } from '../tools/InspectTool';
import { RoadTool } from '../tools/RoadTool';
import {
  createResidentialLowBrush,
  createCommercialLowBrush,
  createIndustrialLightBrush,
} from '../tools/ZoneBrushTool';
import { BulldozeTool } from '../tools/BulldozeTool';
import { PlacePowerPlantTool } from '../tools/PlacePowerPlantTool';
import { ToolController } from '../tools/ToolController';
import { Toolbar } from '../ui/Toolbar';
import { CityHUD } from '../ui/CityHUD';
import { BudgetPanel } from '../ui/BudgetPanel';

/**
 * Top-level application coordinator.
 * Wires the simulation, renderer, tools, and UI together.
 */
export class App {
  constructor() {
    const canvas    = document.getElementById('game-canvas');
    const toolbarEl = document.getElementById('toolbar');
    const statusEl  = document.getElementById('status-bar');
    const hudEl     = document.getElementById('city-hud');
    const budgetEl  = document.getElementById('budget-panel');

    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !toolbarEl || !statusEl || !hudEl || !budgetEl
    ) {
      throw new Error(
        'Required DOM elements not found: #game-canvas, #toolbar, #status-bar, #city-hud, #budget-panel',
      );
    }

    // ── Simulation (no Babylon dependency) ──────────────────────────────────
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE);

    // ── Tools ────────────────────────────────────────────────────────────────
    const inspectTool       = new InspectTool();
    const roadTool          = new RoadTool();
    const residentialTool   = createResidentialLowBrush();
    const commercialTool    = createCommercialLowBrush();
    const industrialTool    = createIndustrialLightBrush();
    const bulldozeTool      = new BulldozeTool();
    const powerPlantTool    = new PlacePowerPlantTool();

    const allTools = [
      inspectTool,
      roadTool,
      residentialTool,
      commercialTool,
      industrialTool,
      bulldozeTool,
      powerPlantTool,
    ];

    const toolController = new ToolController(inspectTool);
    allTools.slice(1).forEach((t) => toolController.register(t));

    // ── Babylon.js renderer ──────────────────────────────────────────────────
    const { scene, engine } = createScene(canvas);

    const terrain      = new TerrainRenderer(scene);
    terrain.buildCityGrid(sim.map);

    const buildings    = new BuildingRenderer(scene);
    const powerOverlay = new PowerOverlayRenderer(scene);
    powerOverlay.build(sim.map);

    const highlight = new HighlightRenderer(scene);
    const picker    = new TilePicker(scene);

    // ── Helper: refresh building warning states and power overlay ────────────
    const refreshPowerVisuals = () => {
      sim.map.forEach((tile) => {
        buildings.updatePowerState(tile.x, tile.y, tile.powered);
      });
      powerOverlay.refresh(sim.map);
    };

    // ── Renderer reacts to tile mutations via ToolController callback ─────────
    toolController.onTileChanged((coord) => {
      const tile = sim.getTile(coord.x, coord.y);
      if (tile) {
        terrain.updateCityTile(tile);
        if (tile.buildingId === null) {
          buildings.removeBuilding(coord.x, coord.y);
        } else {
          // Service building placed — add its mesh and refresh power visuals.
          const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
          if (instance) {
            buildings.addBuilding(instance, tile.zoneType);
          }
          refreshPowerVisuals();
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
            const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
            if (instance) {
              buildings.addBuilding(instance, tile.zoneType);
            }
          }
        }
      }
    };

    // ── Power system fires when coverage changes (monthly or on placement) ───
    sim.onPowerChanged = () => {
      refreshPowerVisuals();
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

    // Power overlay toggle button (separate from the tool buttons).
    const overlayBtn = document.createElement('button');
    overlayBtn.id          = 'power-overlay-btn';
    overlayBtn.textContent = '🔌 Power Overlay: OFF';
    overlayBtn.addEventListener('click', () => {
      const next = !powerOverlay.isVisible;
      powerOverlay.setVisible(next);
      overlayBtn.textContent = `🔌 Power Overlay: ${next ? 'ON' : 'OFF'}`;
      overlayBtn.classList.toggle('active', next);
      if (next) refreshPowerVisuals();
    });
    toolbarEl.appendChild(overlayBtn);

    // ── City HUD ─────────────────────────────────────────────────────────────
    const hud = new CityHUD(hudEl);
    hud.update(sim.stats, sim.clock);

    // ── Budget panel ─────────────────────────────────────────────────────────
    const budgetPanel = new BudgetPanel(budgetEl);
    budgetPanel.update(sim.stats);
    budgetPanel.onTaxChange((res, com, ind) => {
      sim.stats.resTaxRate = res;
      sim.stats.comTaxRate = com;
      sim.stats.indTaxRate = ind;
    });

    // ── Periodic HUD refresh (every second) ──────────────────────────────────
    setInterval(() => {
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);
    }, 1000);
  }
}

