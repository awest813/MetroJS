import { createScene } from '../render/SceneSetup';
import type { OverlayMode } from '../render/overlayColors';
import { CitySim } from '../sim/CitySim';
import { RoadType } from '../sim/CityTile';
import { generateTerrain } from '../sim/TerrainGenerator';
import { HeightField } from '../sim/HeightField';
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
import { CameraBar } from '../ui/CameraBar';
import { CityHUD } from '../ui/CityHUD';
import { BudgetPanel } from '../ui/BudgetPanel';
import { formatInspectStatus } from '../ui/inspectStatus';
import { SpeedBar, type SimSpeed } from '../ui/SpeedBar';
import { LookPanel } from '../ui/LookPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { readStoredQuality, readStoredSun, type QualityLevel } from '../ui/settingsStore';
import { AudioBus } from '../audio/AudioBus';
import { BANKRUPT_VOICE, FAIL_VOICE, GROWTH_VOICE, sfxForTool } from '../audio/voices';
import { explainToolFailure } from '../tools/toolFeedback';
import { formatGrowthHint } from '../sim/zoneGrowthHints';
import { applyDaylight } from '../render/daylight';
import { CityView } from './CityView';
import { mountCityMenu } from './cityFile';

/**
 * Top-level application coordinator.
 * Wires the simulation, CityView, tools, and UI together.
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

    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE);
    generateTerrain(sim.map);
    const heights = HeightField.fromMap(sim.map);

    const audio = new AudioBus();
    const unlockAudio = (): void => {
      audio.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });

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

    const { scene, engine, camera, sun, fill, shadowGenerator, sky } = createScene(canvas);
    applyDaylight({ scene, sun, fill, sky }, readStoredSun());
    const cameraController = new CameraController(canvas, camera);
    const view = new CityView(scene, cameraController, shadowGenerator, sim, heights);

    const applyQuality = (level: QualityLevel): void => {
      scene.shadowsEnabled = level === 'high';
      view.applyQuality(level, sim);
    };
    applyQuality(readStoredQuality());

    toolController.onTileChanged((coord) => view.syncPaintedTile(sim, coord));

    sim.onGrowth = (changed) => {
      if (view.syncGrowth(sim, changed)) audio.play(GROWTH_VOICE, 'growth');
    };
    sim.onPowerChanged = () => view.refreshPowerVisuals(sim);
    sim.onLandValueChanged = () => view.overlay.refresh(sim.map);
    sim.onTrafficChanged = () => {
      view.overlay.refresh(sim.map);
      view.traffic.syncDensity(sim.map);
      view.vegetation.refreshStreets(sim.map);
    };
    sim.onWalkabilityChanged = () => view.overlay.refresh(sim.map);
    sim.onTransitChanged = () => view.overlay.refresh(sim.map);
    sim.onCrimeChanged = () => view.overlay.refresh(sim.map);

    let simSpeed: SimSpeed = 2;

    const look = new LookPanel(lookEl, () => cameraController.resetView());
    const redrawLook = (): void => {
      look.minimap.setMarker(camera.target.x, camera.target.z);
      look.redraw(sim.map);
    };
    view.onRedraw = redrawLook;
    redrawLook();

    look.minimap.onJump((x, y) => {
      cameraController.lookAtTile(x, y, view.heights.tileCenter(x, y));
      view.highlight.show({ x, y }, view.heights);
      redrawLook();
    });

    cameraController.onModeChange(() => redrawLook());
    view.picker.onDragEnd(() => toolController.resetDrag());

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
      getOn: () => view.overlay.isMode(mode),
      setOn: (next: boolean) => {
        if (next) {
          view.overlay.setMode(mode, sim.map);
        } else if (view.overlay.isMode(mode)) {
          view.overlay.setMode(null);
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
        view.traffic.update(dt);
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

    view.picker.onPick((coord, via) => {
      const result = toolController.applyToTile(coord, sim);
      view.highlight.show(coord, view.heights);
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);

      const tile     = sim.getTile(coord.x, coord.y);
      const pickData = view.buildings.selectBuilding(coord.x, coord.y);
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

    mountCityMenu(cityMenuEl, { sim, view, hud, budget: budgetPanel, statusEl });
    new SettingsPanel(settingsEl, {
      audio,
      onSun: (day) => applyDaylight({ scene, sun, fill, sky }, day),
      onQuality: applyQuality,
    });

    setInterval(() => {
      hud.update(sim.stats, sim.clock);
      budgetPanel.update(sim.stats);
      syncAmbient();
      redrawLook();
    }, 1000);
  }
}
