import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { PowerOverlayRenderer } from '../render/PowerOverlayRenderer';
import { LandValueOverlayRenderer } from '../render/LandValueOverlayRenderer';
import { TrafficOverlayRenderer } from '../render/TrafficOverlayRenderer';
import { WalkabilityOverlayRenderer } from '../render/WalkabilityOverlayRenderer';
import { TransitOverlayRenderer } from '../render/TransitOverlayRenderer';
import { TrafficVehicleRenderer } from '../render/TrafficVehicleRenderer';
import { RoadRenderer } from '../render/RoadRenderer';
import { VegetationRenderer } from '../render/VegetationRenderer';
import { SmokeRenderer } from '../render/SmokeRenderer';
import { TilePicker } from '../render/TilePicker';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { WaterRenderer } from '../render/WaterRenderer';
import { CitySim } from '../sim/CitySim';
import { generateTerrain } from '../sim/TerrainGenerator';
import { HeightField } from '../sim/HeightField';
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
import { CameraController } from '../render/CameraController';
import { Toolbar } from '../ui/Toolbar';
import { OverlayBar } from '../ui/OverlayBar';
import { CityMenu } from '../ui/CityMenu';
import { CameraBar } from '../ui/CameraBar';
import { CityHUD } from '../ui/CityHUD';
import { BudgetPanel } from '../ui/BudgetPanel';
import { formatInspectStatus } from '../ui/inspectStatus';
import { SaveSystem } from '../save/SaveSystem';
import { SpeedBar, type SimSpeed } from '../ui/SpeedBar';
import { explainToolFailure } from '../tools/toolFeedback';
import { formatGrowthHint } from '../sim/zoneGrowthHints';

/**
 * Top-level application coordinator.
 * Wires the simulation, renderer, tools, and UI together.
 */
export class App {
  constructor() {
    const canvas     = document.getElementById('game-canvas');
    const toolbarEl  = document.getElementById('toolbar');
    const overlayEl  = document.getElementById('overlay-bar');
    const cityMenuEl = document.getElementById('city-menu');
    const statusEl   = document.getElementById('status-bar');
    const hudEl      = document.getElementById('city-hud');
    const budgetEl   = document.getElementById('budget-panel');
    const cameraEl   = document.getElementById('camera-bar');

    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !toolbarEl || !overlayEl || !cityMenuEl ||
      !statusEl || !hudEl || !budgetEl || !cameraEl
    ) {
      throw new Error(
        'Required DOM elements not found: #game-canvas, #toolbar, #overlay-bar, #city-menu, #status-bar, #city-hud, #budget-panel, #camera-bar',
      );
    }

    // ── Simulation (no Babylon dependency) ──────────────────────────────────
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE);
    generateTerrain(sim.map);
    let heights = HeightField.fromMap(sim.map);

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
    const { scene, engine, camera, shadowGenerator } = createScene(canvas);
    const cameraController = new CameraController(canvas, camera);

    const terrain      = new TerrainRenderer(scene, shadowGenerator);
    terrain.buildCityGrid(sim.map, heights);
    new WaterRenderer(scene);

    const buildings    = new BuildingRenderer(scene, shadowGenerator);
    buildings.setHeightField(heights);
    const powerOverlay = new PowerOverlayRenderer(scene);
    powerOverlay.build(sim.map, heights);
    const landValueOverlay = new LandValueOverlayRenderer(scene);
    landValueOverlay.build(sim.map, heights);
    const trafficOverlay = new TrafficOverlayRenderer(scene);
    trafficOverlay.build(sim.map, heights);
    const walkabilityOverlay = new WalkabilityOverlayRenderer(scene);
    walkabilityOverlay.build(sim.map, heights);
    const transitOverlay = new TransitOverlayRenderer(scene);
    transitOverlay.build(sim.map, heights);
    const trafficVehicles = new TrafficVehicleRenderer(scene, shadowGenerator);
    trafficVehicles.rebuildGraph(sim.map, heights);
    const roads = new RoadRenderer(scene, shadowGenerator);
    roads.rebuild(sim.map, heights);
    const vegetation = new VegetationRenderer(scene, shadowGenerator);
    vegetation.rebuild(sim.map, heights);
    const smoke = new SmokeRenderer(scene);
    smoke.rebuild(sim.map, heights);

    const highlight = new HighlightRenderer(scene);
    const picker    = new TilePicker(scene, cameraController);

    // ── Helper: refresh building warning states and power overlay ────────────
    const refreshPowerVisuals = () => {
      sim.map.forEach((tile) => {
        buildings.updatePowerState(tile.x, tile.y, tile.powered);
      });
      powerOverlay.refresh(sim.map);
    };

    // ── Helper: rebuild all renderers from current sim state (used after load) ─
    const rebuildAllRenderers = () => {
      heights = HeightField.fromMap(sim.map);
      buildings.setHeightField(heights);
      terrain.buildCityGrid(sim.map, heights);
      powerOverlay.build(sim.map, heights);
      landValueOverlay.build(sim.map, heights);
      trafficOverlay.build(sim.map, heights);
      walkabilityOverlay.build(sim.map, heights);
      transitOverlay.build(sim.map, heights);
      roads.rebuild(sim.map, heights);
      vegetation.setHeightField(heights);
      vegetation.rebuild(sim.map, heights);
      smoke.rebuild(sim.map, heights);

      sim.map.forEach((tile) => buildings.removeBuilding(tile.x, tile.y));
      for (const instance of sim.growth.buildings.values()) {
        const tile = sim.getTile(instance.x, instance.y);
        if (tile) buildings.addBuilding(instance, tile.zoneType);
      }

      refreshPowerVisuals();
      trafficVehicles.rebuildGraph(sim.map, heights);
    };

    // ── Renderer reacts to tile mutations via ToolController callback ─────────
    toolController.onTileChanged((coord) => {
      const tile = sim.getTile(coord.x, coord.y);
      if (tile) {
        terrain.updateCityTile(tile);
        roads.updateAround(sim.map, coord);
        vegetation.updateAround(sim.map, coord);
        trafficVehicles.rebuildGraph(sim.map, heights);
        if (tile.buildingId === 'small_power_plant' || tile.buildingId === null) {
          smoke.rebuild(sim.map, heights);
        }
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
      trafficVehicles.syncDensity(sim.map);
      vegetation.refreshStreets(sim.map);
    };

    // ── Walkability system fires monthly when scores are recalculated ─────────
    sim.onWalkabilityChanged = () => {
      if (walkabilityOverlay.isVisible) walkabilityOverlay.refresh(sim.map);
    };

    // ── Transit system fires monthly when access scores are recalculated ──────
    sim.onTransitChanged = () => {
      if (transitOverlay.isVisible) transitOverlay.refresh(sim.map);
    };

    let simSpeed: SimSpeed = 2;

    // ── Wire interactions ────────────────────────────────────────────────────
    picker.onDragEnd(() => toolController.resetDrag());

    // ── Toolbar UI ───────────────────────────────────────────────────────────
    const toolbar = new Toolbar(toolbarEl, toolController);
    toolbar.build(allTools);

    new CameraBar(cameraEl, cameraController);
    new SpeedBar(cameraEl, simSpeed, (next) => {
      simSpeed = next;
      if (next === 0) statusEl.textContent = 'Paused. P resumes. ] speeds up.';
    });

    new OverlayBar(overlayEl, [
      {
        id: 'power-overlay-btn',
        label: 'Power',
        title: 'Powered vs unpowered tiles',
        getOn: () => powerOverlay.isVisible,
        setOn: (next) => {
          powerOverlay.setVisible(next);
          if (next) refreshPowerVisuals();
        },
      },
      {
        id: 'lv-overlay-btn',
        label: 'Value',
        title: 'Land value',
        getOn: () => landValueOverlay.isVisible,
        setOn: (next) => {
          landValueOverlay.setVisible(next);
          if (next) landValueOverlay.refresh(sim.map);
        },
      },
      {
        id: 'traffic-overlay-btn',
        label: 'Traffic',
        title: 'Traffic pressure',
        getOn: () => trafficOverlay.isVisible,
        setOn: (next) => {
          trafficOverlay.setVisible(next);
          if (next) trafficOverlay.refresh(sim.map);
        },
      },
      {
        id: 'walkability-overlay-btn',
        label: 'Walk',
        title: 'Walkability',
        getOn: () => walkabilityOverlay.isVisible,
        setOn: (next) => {
          walkabilityOverlay.setVisible(next);
          if (next) walkabilityOverlay.refresh(sim.map);
        },
      },
      {
        id: 'transit-overlay-btn',
        label: 'Transit',
        title: 'Transit access',
        getOn: () => transitOverlay.isVisible,
        setOn: (next) => {
          transitOverlay.setVisible(next);
          if (next) transitOverlay.refresh(sim.map);
        },
      },
    ]);

    const hud = new CityHUD(hudEl);
    hud.update(sim.stats, sim.clock);

    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000;
      if (simSpeed > 0) {
        sim.tick(dt * simSpeed);
        trafficVehicles.update(dt);
      }
      hud.update(sim.stats, sim.clock);
    });

    const budgetPanel = new BudgetPanel(budgetEl);
    budgetPanel.update(sim.stats);
    budgetPanel.onTaxChange((res, com, ind) => {
      sim.stats.resTaxRate = res;
      sim.stats.comTaxRate = com;
      sim.stats.indTaxRate = ind;
    });

    picker.onPick((coord) => {
      const applied = toolController.applyToTile(coord, sim);
      highlight.show(coord, heights);
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);

      const tile     = sim.getTile(coord.x, coord.y);
      const pickData = buildings.selectBuilding(coord.x, coord.y);
      const tool     = toolController.activeTool;

      if (!applied && tool.name !== 'inspect') {
        statusEl.textContent = explainToolFailure(tool.name, coord, sim);
        return;
      }

      const hint = tile ? formatGrowthHint(tile, sim.map, sim.stats) : null;
      statusEl.textContent = formatInspectStatus(
        tool.label,
        tile ?? undefined,
        pickData?.buildingId ?? null,
        hint,
      );
    });

    new CityMenu(cityMenuEl, {
      onSave: () => {
        SaveSystem.save(sim);
        statusEl.textContent = 'City saved.';
      },
      onLoad: () => {
        const ok = SaveSystem.load(sim);
        if (ok) {
          rebuildAllRenderers();
          hud.update(sim.stats, sim.clock);
          budgetPanel.update(sim.stats);
          budgetPanel.syncTaxSliders(sim.stats);
          statusEl.textContent = 'City loaded.';
        } else {
          statusEl.textContent = 'No save found.';
        }
      },
      onNewCity: () => {
        SaveSystem.deleteSave();
        window.location.reload();
      },
    });

    // ── Periodic HUD refresh (every second) ──────────────────────────────────
    setInterval(() => {
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);
    }, 1000);
  }
}
