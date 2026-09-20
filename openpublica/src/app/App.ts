import { createScene } from '../render/SceneSetup';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { OverlayRenderer } from '../render/OverlayRenderer';
import type { OverlayMode } from '../render/overlayColors';
import { TrafficVehicleRenderer } from '../render/TrafficVehicleRenderer';
import { RoadRenderer } from '../render/RoadRenderer';
import { VegetationRenderer } from '../render/VegetationRenderer';
import { SmokeRenderer } from '../render/SmokeRenderer';
import { TilePicker } from '../render/TilePicker';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { WaterRenderer } from '../render/WaterRenderer';
import { CitySim } from '../sim/CitySim';
import { RoadType } from '../sim/CityTile';
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
  createClearZoneBrush,
} from '../tools/ZoneBrushTool';
import { BulldozeTool } from '../tools/BulldozeTool';
import { PlacePowerPlantTool } from '../tools/PlacePowerPlantTool';
import { PlaceParkTool } from '../tools/PlaceParkTool';
import { PlacePoliceStationTool } from '../tools/PlacePoliceStationTool';
import { PlaceFireStationTool } from '../tools/PlaceFireStationTool';
import { PlaceWaterTowerTool } from '../tools/PlaceWaterTowerTool';
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
import { LookPanel } from '../ui/LookPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { readStoredQuality, readStoredSun, type QualityLevel } from '../ui/settingsStore';
import { AudioBus } from '../audio/AudioBus';
import { BANKRUPT_VOICE, FAIL_VOICE, GROWTH_VOICE, sfxForTool } from '../audio/voices';
import { explainToolFailure } from '../tools/toolFeedback';
import { formatGrowthHint } from '../sim/zoneGrowthHints';
import { applyDaylight } from '../render/daylight';

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
    const settingsEl = document.getElementById('settings-panel');
    const statusEl   = document.getElementById('status-bar');
    const hudEl      = document.getElementById('city-hud');
    const budgetEl   = document.getElementById('budget-panel');
    const cameraEl   = document.getElementById('camera-bar');
    const lookEl     = document.getElementById('look-panel');

    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !toolbarEl || !overlayEl || !cityMenuEl || !settingsEl ||
      !statusEl || !hudEl || !budgetEl || !cameraEl || !lookEl
    ) {
      throw new Error(
        'Required DOM elements not found: #game-canvas, #toolbar, #overlay-bar, #city-menu, #settings-panel, #status-bar, #city-hud, #budget-panel, #camera-bar, #look-panel',
      );
    }

    // ── Simulation (no Babylon dependency) ──────────────────────────────────
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE);
    generateTerrain(sim.map);
    let heights = HeightField.fromMap(sim.map);

    // ── Audio (Web Audio only; silent until a pointer/key gesture) ──────────
    const audio = new AudioBus();
    const unlockAudio = (): void => {
      audio.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });

    // ── Tools ────────────────────────────────────────────────────────────────
    const inspectTool       = new InspectTool();
    const roadTool          = new RoadTool();
    const highwayTool       = new RoadTool(RoadType.Highway);
    const residentialTool   = createResidentialLowBrush();
    const commercialTool    = createCommercialLowBrush();
    const industrialTool    = createIndustrialLightBrush();
    const mixedUseTool      = createMixedUseBrush();
    const clearZoneTool     = createClearZoneBrush();
    const bulldozeTool      = new BulldozeTool();
    const powerPlantTool    = new PlacePowerPlantTool();
    const parkTool          = new PlaceParkTool();
    const policeTool        = new PlacePoliceStationTool();
    const fireTool          = new PlaceFireStationTool();
    const waterTool         = new PlaceWaterTowerTool();
    const trolleyAvenueTool = new TrolleyAvenueTool();

    const allTools = [
      inspectTool,
      roadTool,
      highwayTool,
      residentialTool,
      commercialTool,
      industrialTool,
      mixedUseTool,
      clearZoneTool,
      bulldozeTool,
      powerPlantTool,
      parkTool,
      policeTool,
      fireTool,
      waterTool,
      trolleyAvenueTool,
    ];

    const toolController = new ToolController(inspectTool);
    allTools.slice(1).forEach((t) => toolController.register(t));

    // ── Babylon.js renderer ──────────────────────────────────────────────────
    const { scene, engine, camera, sun, fill, shadowGenerator } = createScene(canvas);
    applyDaylight({ scene, sun, fill }, readStoredSun());
    const cameraController = new CameraController(canvas, camera);

    const terrain      = new TerrainRenderer(scene, shadowGenerator);
    terrain.buildCityGrid(sim.map, heights);
    new WaterRenderer(scene);

    const buildings    = new BuildingRenderer(scene, shadowGenerator);
    buildings.setHeightField(heights);
    const overlay = new OverlayRenderer(scene);
    overlay.build(sim.map, heights);
    const trafficVehicles = new TrafficVehicleRenderer(scene, shadowGenerator);
    trafficVehicles.rebuildGraph(sim.map, heights);
    const roads = new RoadRenderer(scene, shadowGenerator);
    roads.rebuild(sim.map, heights);
    const vegetation = new VegetationRenderer(scene, shadowGenerator);
    vegetation.rebuild(sim.map, heights);
    const smoke = new SmokeRenderer(scene);
    smoke.rebuild(sim.map, heights);

    const applyQuality = (level: QualityLevel): void => {
      const high = level === 'high';
      scene.shadowsEnabled = high;
      smoke.setEnabled(high);
      if (vegetation.setStreetTrees(high)) {
        vegetation.rebuild(sim.map, heights);
      }
    };
    applyQuality(readStoredQuality());

    const highlight = new HighlightRenderer(scene);
    const picker    = new TilePicker(scene, cameraController);

    // ── Helper: refresh building warning states and power overlay ────────────
    const refreshPowerVisuals = () => {
      sim.map.forEach((tile) => {
        buildings.updatePowerState(tile.x, tile.y, tile.powered);
      });
      overlay.refresh(sim.map);
    };

    // ── Helper: rebuild all renderers from current sim state (used after load) ─
    const rebuildAllRenderers = () => {
      heights = HeightField.fromMap(sim.map);
      buildings.setHeightField(heights);
      terrain.buildCityGrid(sim.map, heights);
      overlay.rebuild(sim.map, heights);
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
      redrawLook();
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
        redrawLook();
      }
    });

    // ── Growth system updates renderer when buildings appear ─────────────────
    sim.onGrowth = (changed) => {
      let grew = false;
      for (const coord of changed) {
        const tile = sim.getTile(coord.x, coord.y);
        if (!tile) continue;
        terrain.updateCityTile(tile);
        if (tile.buildingId !== null) {
          const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
          if (instance) {
            buildings.addBuilding(instance, tile.zoneType);
            grew = true;
          }
        } else {
          buildings.removeBuilding(coord.x, coord.y);
        }
      }
      if (grew) audio.play(GROWTH_VOICE, 'growth');
      if (changed.length > 0) redrawLook();
    };

    // ── Power system fires when coverage changes (monthly or on placement) ───
    sim.onPowerChanged = () => {
      refreshPowerVisuals();
    };

    // ── Land value system fires when values change (monthly or on park placement)
    sim.onLandValueChanged = () => {
      overlay.refresh(sim.map);
    };

    // ── Traffic system fires monthly when pressure is recalculated ────────────
    sim.onTrafficChanged = () => {
      overlay.refresh(sim.map);
      trafficVehicles.syncDensity(sim.map);
      vegetation.refreshStreets(sim.map);
    };

    // ── Walkability system fires monthly when scores are recalculated ─────────
    sim.onWalkabilityChanged = () => {
      overlay.refresh(sim.map);
    };

    // ── Transit system fires monthly when access scores are recalculated ──────
    sim.onTransitChanged = () => {
      overlay.refresh(sim.map);
    };

    sim.onCrimeChanged = () => {
      overlay.refresh(sim.map);
    };

    let simSpeed: SimSpeed = 2;

    const look = new LookPanel(lookEl, () => cameraController.resetView());
    const redrawLook = (): void => {
      look.minimap.setMarker(camera.target.x, camera.target.z);
      look.redraw(sim.map);
    };
    redrawLook();

    look.minimap.onJump((x, y) => {
      cameraController.lookAtTile(x, y, heights.tileCenter(x, y));
      highlight.show({ x, y }, heights);
      redrawLook();
    });

    cameraController.onModeChange(() => redrawLook());

    picker.onDragEnd(() => toolController.resetDrag());

    // ── Toolbar UI ───────────────────────────────────────────────────────────
    const toolbar = new Toolbar(toolbarEl, toolController);
    toolbar.build(allTools);

    new CameraBar(cameraEl, cameraController);
    new SpeedBar(cameraEl, simSpeed, (next) => {
      simSpeed = next;
      if (next === 0) statusEl.textContent = 'Paused. P resumes. ] speeds up.';
    });

    const overlaySpec = (
      id: string,
      label: string,
      title: string,
      mode: OverlayMode,
    ) => ({
      id,
      label,
      title,
      getOn: () => overlay.isMode(mode),
      setOn: (next: boolean) => {
        if (next) {
          overlay.setMode(mode, sim.map);
        } else if (overlay.isMode(mode)) {
          overlay.setMode(null);
        }
      },
    });

    new OverlayBar(overlayEl, [
      overlaySpec('power-overlay-btn', 'Power', 'Powered vs unpowered tiles', 'power'),
      overlaySpec('lv-overlay-btn', 'Value', 'Land value', 'landValue'),
      overlaySpec('traffic-overlay-btn', 'Traffic', 'Traffic pressure', 'traffic'),
      overlaySpec('walkability-overlay-btn', 'Walk', 'Walkability', 'walkability'),
      overlaySpec('transit-overlay-btn', 'Transit', 'Transit access', 'transit'),
      overlaySpec('pollution-overlay-btn', 'Smog', 'Pollution haze', 'pollution'),
      overlaySpec('density-overlay-btn', 'Crowd', 'Population density', 'density'),
      overlaySpec('crime-overlay-btn', 'Crime', 'Crime from density minus police', 'crime'),
      overlaySpec('fire-overlay-btn', 'Fire', 'Fire coverage from powered stations', 'fire'),
      overlaySpec('water-overlay-btn', 'Mains', 'Watered lots from powered towers', 'water'),
    ]);

    const hud = new CityHUD(hudEl);
    hud.update(sim.stats, sim.clock);

    let wasBankrupt = sim.stats.bankruptcyWarning;
    const syncAmbient = (): void => {
      const size = (sim.stats.population + sim.stats.jobs) / 3500;
      audio.setAmbientLevel(size);
    };
    syncAmbient();

    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000;
      if (simSpeed > 0) {
        sim.tick(dt * simSpeed);
        trafficVehicles.update(dt);
        if (sim.stats.bankruptcyWarning && !wasBankrupt) {
          audio.play(BANKRUPT_VOICE, 'warn');
        }
        wasBankrupt = sim.stats.bankruptcyWarning;
      }
    });

    const budgetPanel = new BudgetPanel(budgetEl);
    budgetPanel.update(sim.stats);
    budgetPanel.onTaxChange((res, com, ind) => {
      sim.stats.resTaxRate = res;
      sim.stats.comTaxRate = com;
      sim.stats.indTaxRate = ind;
      sim.evaluate();
      hud.update(sim.stats, sim.clock);
    });

    picker.onPick((coord, via) => {
      const result = toolController.applyToTile(coord, sim);
      highlight.show(coord, heights);
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);

      const tile     = sim.getTile(coord.x, coord.y);
      const pickData = buildings.selectBuilding(coord.x, coord.y);
      const tool     = toolController.activeTool;

      if (result === 'repeat') return;

      if (result === 'unchanged' && tool.name !== 'inspect') {
        if (via === 'down') {
          audio.play(FAIL_VOICE, 'fail');
          statusEl.textContent = explainToolFailure(tool.name, coord, sim);
        }
        return;
      }

      const voice = sfxForTool(tool.name);
      if (result === 'applied' && voice) audio.playPaint(voice);

      const hint = tile ? formatGrowthHint(tile, sim.map, sim.stats) : null;
      statusEl.textContent = formatInspectStatus(
        tool.label,
        tile ?? undefined,
        pickData?.buildingId ?? null,
        hint,
      );
    });

    new CityMenu(cityMenuEl, {
      hasSave: SaveSystem.hasSave(),
      onSave: () => {
        SaveSystem.save(sim);
        statusEl.textContent = 'City saved in this browser.';
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
        window.location.reload();
      },
    });
    new SettingsPanel(settingsEl, {
      audio,
      onSun: (day) => applyDaylight({ scene, sun, fill }, day),
      onQuality: applyQuality,
    });

    // ── Periodic HUD refresh (every second) ──────────────────────────────────
    setInterval(() => {
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);
      syncAmbient();
      redrawLook();
    }, 1000);
  }
}
