import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { PowerOverlayRenderer } from '../render/PowerOverlayRenderer';
import { LandValueOverlayRenderer } from '../render/LandValueOverlayRenderer';
import { TrafficOverlayRenderer } from '../render/TrafficOverlayRenderer';
import { WalkabilityOverlayRenderer } from '../render/WalkabilityOverlayRenderer';
import { TransitOverlayRenderer } from '../render/TransitOverlayRenderer';
import { DecorativeCarRenderer } from '../render/DecorativeCarRenderer';
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
  createMixedUseBrush,
} from '../tools/ZoneBrushTool';
import { BulldozeTool } from '../tools/BulldozeTool';
import { PlacePowerPlantTool } from '../tools/PlacePowerPlantTool';
import { PlaceParkTool } from '../tools/PlaceParkTool';
import { TrolleyAvenueTool } from '../tools/TrolleyAvenueTool';
import { ToolController } from '../tools/ToolController';
import { Toolbar } from '../ui/Toolbar';
import { CityHUD } from '../ui/CityHUD';
import { BudgetPanel } from '../ui/BudgetPanel';
import { SaveSystem } from '../save/SaveSystem';

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
    const mixedUseTool      = createMixedUseBrush();
    const bulldozeTool      = new BulldozeTool();
    const powerPlantTool    = new PlacePowerPlantTool();
    const parkTool          = new PlaceParkTool();
    const trolleyAvenueTool = new TrolleyAvenueTool();

    const allTools = [
      inspectTool,
      roadTool,
      residentialTool,
      commercialTool,
      industrialTool,
      mixedUseTool,
      bulldozeTool,
      powerPlantTool,
      parkTool,
      trolleyAvenueTool,
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
    const landValueOverlay = new LandValueOverlayRenderer(scene);
    landValueOverlay.build(sim.map);
    const trafficOverlay = new TrafficOverlayRenderer(scene);
    trafficOverlay.build(sim.map);
    const walkabilityOverlay = new WalkabilityOverlayRenderer(scene);
    walkabilityOverlay.build(sim.map);
    const transitOverlay = new TransitOverlayRenderer(scene);
    transitOverlay.build(sim.map);
    const decorativeCars = new DecorativeCarRenderer(scene);

    const highlight = new HighlightRenderer(scene);
    const picker    = new TilePicker(scene);

    // ── Helper: refresh building warning states and power overlay ────────────
    const refreshPowerVisuals = () => {
      sim.map.forEach((tile) => {
        buildings.updatePowerState(tile.x, tile.y, tile.powered);
      });
      powerOverlay.refresh(sim.map);
    };

    // ── Helper: rebuild all renderers from current sim state (used after load) ─
    const rebuildAllRenderers = () => {
      // Rebuild terrain mesh (disposes old mesh internally).
      terrain.buildCityGrid(sim.map);

      // Remove all existing building meshes then re-add from restored sim state.
      sim.map.forEach((tile) => buildings.removeBuilding(tile.x, tile.y));
      for (const instance of sim.growth.buildings.values()) {
        const tile = sim.getTile(instance.x, instance.y);
        if (tile) buildings.addBuilding(instance, tile.zoneType);
      }

      // Refresh power visuals (coverage data may have changed).
      refreshPowerVisuals();

      // Refresh all overlay renderers from fresh tile data.
      landValueOverlay.refresh(sim.map);
      trafficOverlay.refresh(sim.map);
      walkabilityOverlay.refresh(sim.map);
      transitOverlay.refresh(sim.map);
      decorativeCars.refresh(sim.map);
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

    // ── Land value system fires when values change (monthly or on park placement)
    sim.onLandValueChanged = () => {
      if (landValueOverlay.isVisible) landValueOverlay.refresh(sim.map);
    };

    // ── Traffic system fires monthly when pressure is recalculated ────────────
    sim.onTrafficChanged = () => {
      if (trafficOverlay.isVisible) trafficOverlay.refresh(sim.map);
      decorativeCars.refresh(sim.map);
    };

    // ── Walkability system fires monthly when scores are recalculated ─────────
    sim.onWalkabilityChanged = () => {
      if (walkabilityOverlay.isVisible) walkabilityOverlay.refresh(sim.map);
    };

    // ── Transit system fires monthly when access scores are recalculated ──────
    sim.onTransitChanged = () => {
      if (transitOverlay.isVisible) transitOverlay.refresh(sim.map);
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
        info += `  ·  zone=${tile.zoneType} road=${tile.roadType} lv=${tile.landValue}`;
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

    // Land value overlay toggle button.
    const lvOverlayBtn = document.createElement('button');
    lvOverlayBtn.id          = 'lv-overlay-btn';
    lvOverlayBtn.textContent = '🏡 Land Value: OFF';
    lvOverlayBtn.addEventListener('click', () => {
      const next = !landValueOverlay.isVisible;
      landValueOverlay.setVisible(next);
      lvOverlayBtn.textContent = `🏡 Land Value: ${next ? 'ON' : 'OFF'}`;
      lvOverlayBtn.classList.toggle('active', next);
      if (next) landValueOverlay.refresh(sim.map);
    });
    toolbarEl.appendChild(lvOverlayBtn);

    // Traffic overlay toggle button.
    const trafficOverlayBtn = document.createElement('button');
    trafficOverlayBtn.id          = 'traffic-overlay-btn';
    trafficOverlayBtn.textContent = '🚗 Traffic: OFF';
    trafficOverlayBtn.addEventListener('click', () => {
      const next = !trafficOverlay.isVisible;
      trafficOverlay.setVisible(next);
      trafficOverlayBtn.textContent = `🚗 Traffic: ${next ? 'ON' : 'OFF'}`;
      trafficOverlayBtn.classList.toggle('active', next);
      if (next) trafficOverlay.refresh(sim.map);
    });
    toolbarEl.appendChild(trafficOverlayBtn);

    // Walkability overlay toggle button.
    const walkOverlayBtn = document.createElement('button');
    walkOverlayBtn.id          = 'walkability-overlay-btn';
    walkOverlayBtn.textContent = '🚶 Walkability: OFF';
    walkOverlayBtn.addEventListener('click', () => {
      const next = !walkabilityOverlay.isVisible;
      walkabilityOverlay.setVisible(next);
      walkOverlayBtn.textContent = `🚶 Walkability: ${next ? 'ON' : 'OFF'}`;
      walkOverlayBtn.classList.toggle('active', next);
      if (next) walkabilityOverlay.refresh(sim.map);
    });
    toolbarEl.appendChild(walkOverlayBtn);

    // Transit overlay toggle button.
    const transitOverlayBtn = document.createElement('button');
    transitOverlayBtn.id          = 'transit-overlay-btn';
    transitOverlayBtn.textContent = '🚃 Transit: OFF';
    transitOverlayBtn.addEventListener('click', () => {
      const next = !transitOverlay.isVisible;
      transitOverlay.setVisible(next);
      transitOverlayBtn.textContent = `🚃 Transit: ${next ? 'ON' : 'OFF'}`;
      transitOverlayBtn.classList.toggle('active', next);
      if (next) transitOverlay.refresh(sim.map);
    });
    toolbarEl.appendChild(transitOverlayBtn);

    // ── Save / Load / New City buttons ───────────────────────────────────────
    const saveBtn = document.createElement('button');
    saveBtn.id          = 'save-btn';
    saveBtn.textContent = '💾 Save';
    saveBtn.addEventListener('click', () => {
      SaveSystem.save(sim);
      statusEl.textContent = 'City saved.';
    });
    toolbarEl.appendChild(saveBtn);

    const loadBtn = document.createElement('button');
    loadBtn.id          = 'load-btn';
    loadBtn.textContent = '📂 Load';
    loadBtn.addEventListener('click', () => {
      const ok = SaveSystem.load(sim);
      if (ok) {
        rebuildAllRenderers();
        hud.update(sim.stats, sim.clock);
        budgetPanel.update(sim.stats);
        statusEl.textContent = 'City loaded.';
      } else {
        statusEl.textContent = 'No save found.';
      }
    });
    toolbarEl.appendChild(loadBtn);

    const newCityBtn = document.createElement('button');
    newCityBtn.id          = 'new-city-btn';
    newCityBtn.textContent = '🌱 New City';
    newCityBtn.addEventListener('click', () => {
      if (!confirm('Start a new city? Unsaved progress will be lost.')) return;
      SaveSystem.deleteSave();
      window.location.reload();
    });
    toolbarEl.appendChild(newCityBtn);

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
