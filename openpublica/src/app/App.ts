import { createScene } from '../render/SceneSetup';
import type { OverlayMode } from '../render/overlayColors';
import { CitySim } from '../sim/CitySim';
import { RoadType, ZoneType } from '../sim/CityTile';
import { generateTerrain } from '../sim/TerrainGenerator';
import { HeightField } from '../sim/HeightField';
import { MAP_SIZE } from '../data/constants';
import { InspectTool } from '../tools/InspectTool';
import { RoadTool, isRoadTool } from '../tools/RoadTool';
import {
  createResidentialLowBrush,
  createCommercialLowBrush,
  createIndustrialLightBrush,
  createMixedUseBrush,
  createClearZoneBrush,
} from '../tools/ZoneBrushTool';
import { BULLDOZE_COST, BulldozeTool } from '../tools/BulldozeTool';
import { TrolleyAvenueTool } from '../tools/TrolleyAvenueTool';
import { ToolController } from '../tools/ToolController';
import { CameraController } from '../render/CameraController';
import { Toolbar } from '../ui/Toolbar';
import { OverlayBar } from '../ui/OverlayBar';
import { CameraBar } from '../ui/CameraBar';
import { CityHUD } from '../ui/CityHUD';
import { MilestoneBanner } from '../ui/MilestoneBanner';
import { PlaceServiceTool } from '../tools/PlaceServiceTool';
import { SERVICE_TIERS, tierOf } from '../sim/serviceTiers';
import { bailoutRecap, budgetHoldNote, milestoneBanner as milestoneBannerText } from '../ui/chromeCopy';
import { BailoutDialog } from '../ui/BailoutDialog';
import { biggestCosts } from '../sim/bankruptcy';
import { isUnlocked } from '../sim/civic';
import { BudgetPanel, formatBonds } from '../ui/BudgetPanel';
import { BOND_AMOUNT } from '../sim/budgetLevers';
import { formatInspectStatus } from '../ui/inspectStatus';
import { SpeedBar, simSecondsForFrame, type SimSpeed } from '../ui/SpeedBar';
import { LookPanel } from '../ui/LookPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import {
  ambientOcclusionActive,
  readStoredAmbientOcclusion,
  readStoredQuality,
  readStoredSun,
  type QualityLevel,
} from '../ui/settingsStore';
import { AudioBus } from '../audio/AudioBus';
import { BANKRUPT_VOICE, FAIL_VOICE, GROWTH_VOICE, MILESTONE_VOICE, sfxForTool } from '../audio/voices';
import { explainToolFailure, formatStrokeStatus } from '../tools/toolFeedback';
import { formatSmogReach, smogReach, type SmogReach } from '../sim/smogReach';
import { formatGrowthHint } from '../sim/zoneGrowthHints';
import { WeatherRenderer } from '../render/WeatherRenderer';
import { AmbientOcclusion } from '../render/AmbientOcclusion';
import { BuildingModels } from '../render/BuildingModels';
import { parseWeatherKind } from '../sim/weather';
import { CityView } from './CityView';
import { mountCityMenu, requestedTestCity, startNewCity } from './cityFile';
import { START_TREASURY, parseNewGame, randomSeed } from '../scenarios/newGame';
import { checkScenario, scenarioLabel, scenarioText, startScenario } from '../scenarios/goals';
import { NewGamePanel } from '../ui/NewGamePanel';
import { BulldozeAreaMode, PlannedDragInput, RoadLineMode, ZoneAreaMode } from './plannedDrag';
import { formatBulldozeResult } from '../tools/bulldozeArea';
import { planRoadLine } from '../tools/roadLine';
import { formatAreaResult } from '../tools/zoneArea';
import {
  createServiceTools,
  formatServiceHint,
  serviceRadius,
  serviceSpecForDef,
  serviceSpecForTool,
  type NetworkInfo,
  type ServiceSpec,
} from '../tools/serviceCatalog';
import { buildingsInReach, stationHasRoad } from '../sim/roadDispatch';
import type { BuildingDef } from '../sim/BuildingDef';
import { groveStrengths, isWooded } from '../sim/woods';
import { levelCrossingAxis } from '../sim/TransitSystem';
import {
  GRID_LINE,
  GRID_SHORT,
  networkReachFrom,
  networkTilesAt,
  type UtilityGrid,
} from '../sim/utilityGrid';

/** Lots a utility network reaches but cannot serve. */
const SHORT_TINT = { r: 0.95, g: 0.25, b: 0.2 };
/** Homes and shops a new plant's smog would reach, and those it would drive out. */
const SMOG_TINT = { r: 0.62, g: 0.52, b: 0.34 };
const SMOG_OUT_TINT = { r: 0.5, g: 0.3, b: 0.12 };

/** The box around every road and building, or null on an empty map. */
function developedBounds(sim: CitySim): { x0: number; y0: number; x1: number; y1: number } | null {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  sim.map.forEach((tile) => {
    if (tile.roadType === RoadType.None && tile.buildingId === null) return;
    if (!box) box = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y };
    else {
      box.x0 = Math.min(box.x0, tile.x);
      box.y0 = Math.min(box.y0, tile.y);
      box.x1 = Math.max(box.x1, tile.x);
      box.y1 = Math.max(box.y1, tile.y);
    }
  });
  return box;
}

/** A new city on map `terrainSeed`. */
function freshCity(terrainSeed: number): CitySim {
  const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE, terrainSeed);
  generateTerrain(sim.map, terrainSeed);
  return sim;
}

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
    const milestoneEl = document.getElementById('milestone-banner');
    const bailoutEl  = document.getElementById('bailout-dialog');
    const newGameEl  = document.getElementById('newgame-panel');

    if (
      !(canvas instanceof HTMLCanvasElement) ||
      !toolbarEl || !overlayEl || !cityMenuEl || !settingsEl ||
      !statusEl || !hudEl || !budgetEl || !cameraEl || !lookEl || !milestoneEl || !bailoutEl || !newGameEl
    ) {
      throw new Error(
        'Required DOM elements not found: #game-canvas, #toolbar, #overlay-bar, #city-menu, #settings-panel, #status-bar, #city-hud, #budget-panel, #camera-bar, #look-panel, #milestone-banner, #bailout-dialog, #newgame-panel',
      );
    }

    // `?city=<id>` opens a scripted test city; otherwise a fresh random map.
    const testCity = requestedTestCity();
    const newGame = parseNewGame(window.location.search);
    const sim = testCity ? testCity.build().sim : freshCity(newGame.seed ?? randomSeed());
    // A test city is a scenario: its goal's clock starts now. A new city
    // starts with the treasury its address names (Normal unless chosen).
    if (testCity) startScenario(sim, testCity.id);
    else if (START_TREASURY[newGame.difficulty] !== sim.stats.money) {
      sim.stats.money = START_TREASURY[newGame.difficulty];
      sim.previewEconomy();
      sim.evaluate();
    }
    const heights = HeightField.fromMap(sim.map, sim.terrainSeed);

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
    const trolleyAvenueTool = new TrolleyAvenueTool();
    const serviceTools      = createServiceTools();

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
      ...serviceTools,
      trolleyAvenueTool,
    ];

    const toolController = new ToolController(inspectTool);
    allTools.slice(1).forEach((t) => toolController.register(t));

    const { scene, engine, camera, sun, fill, shadowGenerator, sky } = createScene(canvas);
    const cameraController = new CameraController(canvas, camera);
    const view = new CityView(scene, cameraController, shadowGenerator, sim, heights);
    // Sky, fog, sun, and shadows follow the Dawn–Dusk slider under the month's weather.
    const weatherView = new WeatherRenderer(
      scene, { scene, sun, fill, sky, shadows: shadowGenerator }, camera, readStoredSun(),
    );
    const pinned = parseWeatherKind(new URLSearchParams(window.location.search).get('weather'));
    if (pinned) sim.pinWeather(pinned);
    weatherView.setWeather(sim.weather, true);
    sim.onWeatherChanged = () => weatherView.setWeather(sim.weather);
    weatherView.onLightning = () => audio.thunder();

    // GLB kits load in the background; each replaces its procedural kit as it
    // arrives (High quality), and a model that fails leaves the kit in place.
    const buildingModels = new BuildingModels(scene, import.meta.env.BASE_URL);
    buildingModels.onReady = (defId) => view.buildings.refreshDef(defId);
    view.buildings.setModels(buildingModels);
    buildingModels.load(sim.growth.defs.values());

    // Opt-in, High only: see AmbientOcclusion and settingsStore.
    const ambientOcclusion = new AmbientOcclusion(scene, camera);
    let quality = readStoredQuality();
    const syncAmbientOcclusion = (): void => {
      ambientOcclusion.setEnabled(ambientOcclusionActive({
        quality,
        wanted: readStoredAmbientOcclusion(),
        supported: AmbientOcclusion.supported,
        mapShown: view.overlay.mode !== null,
      }));
    };
    const applyQuality = (level: QualityLevel): void => {
      quality = level;
      scene.shadowsEnabled = level === 'high';
      view.applyQuality(level, sim);
      weatherView.setEffects(level === 'high');
      syncAmbientOcclusion();
    };
    applyQuality(readStoredQuality());

    toolController.onTilesChanged((coords) => view.syncPaintedTiles(sim, coords));

    sim.onGrowth = (changed) => {
      if (view.syncGrowth(sim, changed)) audio.play(GROWTH_VOICE, 'growth');
    };
    sim.onPowerChanged = () => view.refreshPowerVisuals(sim);
    sim.onLandValueChanged = () => view.overlay.refresh(sim.map);
    sim.onTrafficChanged = () => {
      view.overlay.refresh(sim.map);
      view.traffic.setCommutes(sim.traffic.commutes);
      view.traffic.rebuildGraph(sim.map, view.heights);
      view.vegetation.refreshStreets(sim.map);
    };
    sim.onWalkabilityChanged = () => view.overlay.refresh(sim.map);
    sim.onTransitChanged = () => view.overlay.refresh(sim.map);
    sim.onCrimeChanged = () => view.overlay.refresh(sim.map);

    let simSpeed: SimSpeed = 1;

    const look = new LookPanel(lookEl, () => cameraController.resetView());
    const redrawLook = (): void => {
      look.minimap.setMarker(camera.target.x, camera.target.z);
      look.redraw(sim.map);
    };
    view.onRedraw = redrawLook;
    redrawLook();

    look.minimap.onJump((x, y) => {
      cameraController.lookAtTile(x, y, view.surfaceY(x, y));
      view.highlight.show({ x, y }, view.surface);
      redrawLook();
    });

    cameraController.onModeChange(() => redrawLook());
    const roadLineMode = new RoadLineMode(sim, toolController, (tool, summary, path) => {
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      if (summary.applied === 0) {
        audio.play(FAIL_VOICE, 'fail');
        statusEl.textContent = path.length === 1
          ? explainToolFailure(tool.name, path[0], sim)
          : formatStrokeStatus(tool.label, summary) ?? 'Nothing new to build along that line.';
        return;
      }
      const voice = sfxForTool(tool.name);
      if (voice) audio.playPaint(voice);
      statusEl.textContent = formatStrokeStatus(tool.label, summary) ?? '';
    });
    const zoneAreaMode = new ZoneAreaMode(sim, toolController, (tool, summary, plan, anchor, target) => {
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      if (summary.applied === 0) {
        audio.play(FAIL_VOICE, 'fail');
        statusEl.textContent = anchor.x === target.x && anchor.y === target.y
          ? explainToolFailure(tool.name, anchor, sim)
          : plan.blocked.length > 0
            ? formatStrokeStatus(tool.label, summary) ?? 'Nothing new to zone there.'
            : 'Nothing new to zone there.';
        return;
      }
      const voice = sfxForTool(tool.name);
      if (voice) audio.playPaint(voice);
      statusEl.textContent = formatAreaResult(tool.label, summary.spent, plan, tool.zoneType === ZoneType.None);
    });
    const bulldozeAreaMode = new BulldozeAreaMode(sim, toolController, (tool, summary, plan, anchor, target) => {
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      if (summary.applied === 0) {
        audio.play(FAIL_VOICE, 'fail');
        statusEl.textContent = anchor.x === target.x && anchor.y === target.y
          ? explainToolFailure(tool.name, anchor, sim)
          : plan.blocked > 0
            ? `Not enough money to bulldoze — $${BULLDOZE_COST} a tile.`
            : 'Nothing to clear there.';
        return;
      }
      const voice = sfxForTool(tool.name);
      if (voice) audio.playPaint(voice);
      statusEl.textContent = summary.applied === plan.lots.length
        ? formatBulldozeResult(summary.spent, plan)
        : formatStrokeStatus(tool.label, summary) ?? '';
    });
    const plannedDrag = new PlannedDragInput(
      sim, toolController, view, statusEl, [roadLineMode, zoneAreaMode, bulldozeAreaMode],
    );
    window.addEventListener('keydown', (event) => {
      if (plannedDrag.handleKey(event.key)) event.preventDefault();
    });

    /** What a service just placed needs or does, kept past the spend line on release. */
    let placementNote: string | null = null;
    view.picker.onDragEnd(() => {
      if (!plannedDrag.finish()) {
        const stroke = toolController.resetDrag();
        const line = formatStrokeStatus(toolController.activeTool.label, stroke);
        if (line) {
          const note = placementNote ? ` ${placementNote.charAt(0).toUpperCase()}${placementNote.slice(1)}.` : '';
          statusEl.textContent = `${line}${note}`;
        }
      }
      placementNote = null;
      refreshHover();
    });

    /** The power or water distribution a plant or tower belongs to. */
    const utilityGrid = (def: BuildingDef | undefined): UtilityGrid | null => {
      if (def?.powerCapacity) return sim.power.grid;
      if (def?.waterCapacity) return sim.water.grid;
      return null;
    };
    const networkAt = (def: BuildingDef | undefined, x: number, y: number): NetworkInfo | null => {
      const grid = utilityGrid(def);
      if (!grid) return null;
      const id = grid.networkOf[y * sim.map.width + x];
      return id >= 0 ? grid.networks[id] : null;
    };

    /**
     * Plants and towers: the streets and lots their network feeds (short lots
     * in red), or, while placing one, the streets it would join. Parks show a
     * disc; police and fire the lots their crews reach by road.
     */
    /** What a smoggy building placed at `coord` would do to the homes and shops around it. */
    const smogFrom = (coord: { x: number; y: number }, def: BuildingDef | undefined): SmogReach | null => {
      if (!def?.pollutionOutput || !def.pollutionRadius) return null;
      return smogReach(sim.map, [coord], def.pollutionOutput, def.pollutionRadius, new Set([`${coord.x},${coord.y}`]));
    };
    const smogWarning = (reach: SmogReach | null, radius: number): string | null => {
      const line = reach ? formatSmogReach(reach, 'its') : null;
      return line ? `${line} — place it further from the houses (smog carries ${radius} tiles)` : null;
    };

    const showServiceReach = (coord: { x: number; y: number }, spec: ServiceSpec, placing: boolean): void => {
      const def = sim.growth.defs.get(spec.defId);
      if (spec.coverage === 'power' || spec.coverage === 'water') {
        const grid = placing ? null : utilityGrid(def);
        const tiles = grid
          ? networkTilesAt(sim.map, grid, coord.x, coord.y)
          : [coord, ...networkReachFrom(sim.map, coord.x, coord.y)].map((t) => ({ ...t, state: GRID_LINE }));
        const tints = tiles.map((t) => ({
          x: t.x,
          y: t.y,
          rgb: t.state === GRID_SHORT ? SHORT_TINT : spec.preview,
          alpha: t.state === GRID_LINE ? 0.55 : t.state === GRID_SHORT ? 0.5 : 0.32,
        }));
        // A plant about to go down shows the homes its smog would reach.
        const smog = placing ? smogFrom(coord, def) : null;
        if (smog) {
          for (const t of smog.tiles) {
            tints.push({ x: t.x, y: t.y, rgb: t.drivesOut ? SMOG_OUT_TINT : SMOG_TINT, alpha: t.drivesOut ? 0.62 : 0.4 });
          }
          const warning = smogWarning(smog, def?.pollutionRadius ?? 0);
          statusEl.textContent = warning
            ? `Plant here: ${warning}.`
            : 'Plant here: no homes or shops in its smog.';
        }
        view.previewTints(tints);
        return;
      }
      const radius = serviceRadius(def, sim.levers.safetyFunding);
      if (spec.dispatch) {
        view.previewDispatch(coord.x, coord.y, radius, spec.preview);
      } else {
        view.highlight.showCoverage(coord, radius, spec.preview, view.surface);
      }
    };

    const previewCoverage = (coord: { x: number; y: number } | null): void => {
      const tool = toolController.activeTool;
      const toolSpec = coord ? serviceSpecForTool(tool.name) : undefined;
      if (coord && toolSpec) {
        showServiceReach(coord, toolSpec, true);
        // A full tier over its own small tier upgrades it for the difference.
        const tier = tierOf(toolSpec.defId);
        if (tier && tool instanceof PlaceServiceTool && tool.upgrades(coord, sim)) {
          const { full, small } = SERVICE_TIERS[tier.service];
          statusEl.textContent = `Upgrade the ${small.name} to a ${full.name}: $${tool.costAt(coord, sim).toLocaleString()}, the difference in price.`;
        }
        return;
      }
      if (coord) {
        const hover = sim.getTile(coord.x, coord.y);
        const defId = hover?.buildingId ?? undefined;
        const spec = defId ? serviceSpecForDef(defId) : undefined;
        if (spec) {
          showServiceReach(coord, spec, false);
          return;
        }
      }
      view.highlight.hideCoverage();
    };

    /** Would the active tool refuse this tile? Road tools pass through existing roads. */
    const refuses = (coord: { x: number; y: number }): boolean => {
      const tool = toolController.activeTool;
      if (isRoadTool(tool)) return planRoadLine(tool, [coord], sim).blocked.length > 0;
      return tool.canApply ? !tool.canApply(coord, sim) : false;
    };

    /** Tile under the pointer, from hover or the last pick of a drag. */
    let hoverCoord: { x: number; y: number } | null = null;
    /** Re-tint the cursor when the tool or the map changed under a still pointer. */
    const refreshHover = (): void => {
      if (!hoverCoord || plannedDrag.busy) return;
      view.highlight.show(hoverCoord, view.surface, refuses(hoverCoord));
      previewCoverage(hoverCoord);
    };

    view.picker.onHover((coord) => {
      hoverCoord = coord;
      if (coord) view.highlight.show(coord, view.surface, refuses(coord));
      else view.highlight.hide();
      previewCoverage(coord);
    });

    const toolbar = new Toolbar(toolbarEl, toolController, () => refreshHover());
    toolbar.build(allTools);
    toolbar.select('road');
    /** Late civic buildings show in the rail once a milestone unlocks them. */
    const syncUnlocks = (): void => {
      const reached = sim.stats.milestones ?? 0;
      const shown = (name: string): boolean => {
        const spec = serviceSpecForTool(name);
        return !spec || isUnlocked(spec.defId, reached);
      };
      toolbar.showTools(shown);
      if (!shown(toolController.activeTool.name)) toolbar.select('road');
    };
    syncUnlocks();
    statusEl.textContent = `${sim.stats.advisory} R road · I inspect · P pause.`;

    new CameraBar(cameraEl, cameraController);
    const speedBar = new SpeedBar(cameraEl, simSpeed, (next) => {
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
        syncAmbientOcclusion();
      },
    });

    new OverlayBar(overlayEl, [
      overlaySpec('power-overlay-btn', 'Power', 'Power grid: live streets and powered lots; dark buildings show red', 'power'),
      overlaySpec('lv-overlay-btn', 'Value', 'Land value', 'landValue'),
      overlaySpec('traffic-overlay-btn', 'Traffic', 'Traffic pressure', 'traffic'),
      overlaySpec('walkability-overlay-btn', 'Walk', 'Walkability', 'walkability'),
      overlaySpec('transit-overlay-btn', 'Transit', 'Transit access', 'transit'),
      overlaySpec('pollution-overlay-btn', 'Smog', 'Pollution haze', 'pollution'),
      overlaySpec('density-overlay-btn', 'Crowd', 'Population density', 'density'),
      overlaySpec('crime-overlay-btn', 'Crime', 'Crime from density minus police', 'crime'),
      overlaySpec('fire-overlay-btn', 'Fire', 'Fire coverage from powered stations', 'fire'),
      overlaySpec('water-overlay-btn', 'Mains', 'Water mains along the streets from powered towers, and the lots they water', 'water'),
    ]);

    const hud = new CityHUD(hudEl);
    hud.update(sim.stats, sim.clock, sim);
    // Click an advisory with a place to go and look.
    hud.onAdvisoryJump((x, y) => {
      cameraController.lookAtTile(x, y, view.surfaceY(x, y));
      view.highlight.show({ x, y }, view.surface);
      redrawLook();
    });

    // A city tier reached: a banner, a chord, and the grant already in the HUD.
    const milestoneBanner = new MilestoneBanner(milestoneEl);
    sim.onMilestone = (milestone) => {
      const text = milestoneBannerText(milestone, sim.stats.milestones ?? 0, sim.stats.population);
      milestoneBanner.show(text.title, text.body);
      syncUnlocks();
      audio.play(MILESTONE_VOICE, 'milestone');
    };

    /** Open while a new game's map and treasury are being chosen. */
    let newGamePanel: NewGamePanel | null = null;
    /** A scenario's goal in the HUD. */
    const syncGoal = (): void => hud.setGoal(scenarioLabel(sim), scenarioText(sim)?.body ?? null);
    syncGoal();

    let wasBankrupt = sim.stats.bankruptcyWarning;
    const syncAmbient = (): void => {
      const size = (sim.stats.population + sim.stats.jobs) / 3500;
      audio.setAmbientLevel(size);
    };
    syncAmbient();

    scene.onBeforeRenderObservable.add(() => {
      weatherView.update(engine.getDeltaTime() / 1000);
      audio.setRain(weatherView.look.rain);
      // The city waits while the state's offer stands, and while a new game is being chosen.
      const waiting = sim.stats.bailoutOffered || newGamePanel?.open;
      const step = waiting ? 0 : simSecondsForFrame(engine.getDeltaTime(), simSpeed);
      if (step > 0) {
        sim.tick(step);
        view.traffic.update(step);
        hud.tickClock(sim.clock);
        if (sim.stats.bankruptcyWarning && !wasBankrupt) {
          audio.play(BANKRUPT_VOICE, 'warn');
        }
        wasBankrupt = sim.stats.bankruptcyWarning;
      }
    });

    const budgetPanel = new BudgetPanel(budgetEl);
    budgetPanel.update(sim.stats, sim.budget, sim.levers);
    sim.onMonth = () => {
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      syncAmbient();
      // A scenario's goal: met in time, or the deadline passed.
      const outcome = checkScenario(sim);
      if (outcome) {
        const text = scenarioText(sim)!;
        milestoneBanner.show(text.title, text.body);
        audio.play(outcome === 'won' ? MILESTONE_VOICE : BANKRUPT_VOICE, 'milestone');
      }
      syncGoal();
    };
    budgetPanel.onTaxChange((res, com, ind) => {
      if (!sim.setTaxes(res, com, ind)) {
        statusEl.textContent = budgetHoldNote(sim.stats) ?? '';
        budgetPanel.syncSliders(sim.stats, sim.levers);
      }
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
    });

    // Two years in debt: the state's offer, with the game paused until it is answered.
    const bailoutDialog = new BailoutDialog(bailoutEl, {
      onAccept: () => {
        sim.acceptBailout();
        hud.update(sim.stats, sim.clock, sim);
        budgetPanel.update(sim.stats, sim.budget, sim.levers);
        budgetPanel.syncSliders(sim.stats, sim.levers);
        statusEl.textContent = budgetHoldNote(sim.stats) ?? 'The state cleared the debt.';
        speedBar.setSpeed(1);
      },
      onNewCity: startNewCity,
    });
    const offerBailout = (): void => {
      speedBar.setSpeed(0);
      bailoutDialog.show(bailoutRecap(sim.stats, biggestCosts(sim.budget, 3)));
    };
    // A new game: the map shows behind the panel; re-roll it or pick a treasury, then start.
    if (!testCity && newGame.choosing) {
      newGamePanel = new NewGamePanel(newGameEl, newGame.difficulty, {
        onReroll: (difficulty) => startNewCity(difficulty),
        onStart: (difficulty) => {
          sim.stats.money = START_TREASURY[difficulty];
          sim.stats.bankruptcyWarning = false;
          sim.previewEconomy();
          sim.evaluate();
          hud.update(sim.stats, sim.clock, sim);
          budgetPanel.update(sim.stats, sim.budget, sim.levers);
          // Keep the map and treasury in the address, so a reload rebuilds this city's start.
          const url = new URL(window.location.href);
          url.searchParams.delete('new');
          window.history.replaceState(null, '', url.href);
          statusEl.textContent = `A new city with $${sim.stats.money.toLocaleString()}. ${sim.stats.advisory}`;
        },
      });
      newGamePanel.show();
    }
    sim.onCouncil = (event) => {
      audio.play(BANKRUPT_VOICE, 'warn');
      if (event === 'bailout') offerBailout();
      else statusEl.textContent = sim.stats.advisory;
    };

    budgetPanel.onFundingChange((safety, roads) => {
      if (safety !== sim.levers.safetyFunding) sim.setSafetyFunding(safety);
      if (roads !== sim.levers.roadFunding) sim.setRoadFunding(roads);
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      previewCoverage(hoverCoord);
    });
    budgetPanel.onBorrow(() => {
      if (sim.issueBond()) {
        statusEl.textContent = `Borrowed $${BOND_AMOUNT.toLocaleString()}. ${formatBonds(sim.levers)}; repayments show in Budget.`;
      } else {
        statusEl.textContent = 'At the bond limit — repay one before borrowing again.';
      }
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
    });

    view.picker.onPick((coord, via, mods) => {
      hoverCoord = coord;
      if (plannedDrag.handlePick(coord, via, mods.shift)) {
        view.highlight.show(coord, view.surface, plannedDrag.targetBlocked);
        return;
      }
      // Judge a plant's smog before it goes down (after, it counts its own smog).
      const plantSpec = serviceSpecForTool(toolController.activeTool.name);
      const plantDef = plantSpec ? sim.growth.defs.get(plantSpec.defId) : undefined;
      const smogBefore = via === 'down' && plantDef?.pollutionOutput ? smogFrom(coord, plantDef) : null;
      const result = toolController.applyToTile(coord, sim);
      view.highlight.show(coord, view.surface);
      previewCoverage(coord);
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);

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

      const placing = serviceSpecForTool(tool.name);
      const inspectDef = tile?.buildingId
        ? sim.growth.defs.get(tile.buildingId)
        : placing
          ? sim.growth.defs.get(placing.defId)
          : undefined;
      const stationReach = inspectDef?.policeRadius || inspectDef?.fireRadius
        ? serviceRadius(inspectDef, sim.levers.safetyFunding)
        : 0;
      const serviceHint = formatServiceHint(
        inspectDef,
        tile?.powered ?? false,
        stationHasRoad(sim.map, coord.x, coord.y),
        networkAt(inspectDef, coord.x, coord.y),
        sim.levers.safetyFunding,
        stationReach > 0 ? buildingsInReach(sim.map, coord.x, coord.y, stationReach) : undefined,
      );
      if (placing && result === 'applied') {
        const smog = smogWarning(smogBefore, plantDef?.pollutionRadius ?? 0);
        placementNote = [serviceHint, smog].filter((part): part is string => !!part).join('; ') || null;
      }
      const growthHint = tile
        ? formatGrowthHint(tile, sim.map, sim.stats, {
          gridFull: sim.gridFullAt(tile.x, tile.y),
          outgrownMonths: sim.growth.outgrownMonths(tile.x, tile.y),
        })
        : null;
      const woods = tile && isWooded(tile, groveStrengths(sim.terrainSeed, sim.map.width, sim.map.height), sim.map.width)
        ? 'woods — lots beside them are worth more; zoning or paving clears them'
        : null;
      const crossing = tile && levelCrossingAxis(sim.map, tile.x, tile.y)
        ? 'level crossing — the trolley line runs across this road'
        : null;
      const hint = [serviceHint, growthHint, woods, crossing].filter((part): part is string => Boolean(part)).join(' · ') || null;
      statusEl.textContent = formatInspectStatus(
        tool.label,
        tile ?? undefined,
        pickData?.buildingId ?? null,
        hint,
      );
    });

    mountCityMenu(cityMenuEl, {
      sim,
      view,
      hud,
      budget: budgetPanel,
      statusEl,
      onLoaded: () => {
        weatherView.setWeather(sim.weather, true);
        previewCoverage(null);
        if (sim.stats.bailoutOffered) offerBailout();
        else bailoutDialog.hide();
        syncUnlocks();
        syncGoal();
      },
    });
    if (testCity) {
      view.rebuildAll(sim);
      weatherView.setWeather(sim.weather, true); // snow onto the rebuilt ground at once
      const built = developedBounds(sim);
      if (built) {
        const cx = Math.round((built.x0 + built.x1) / 2);
        const cy = Math.round((built.y0 + built.y1) / 2);
        cameraController.frameArea(built.x0, built.y0, built.x1, built.y1, view.surfaceY(cx, cy));
      }
      hud.update(sim.stats, sim.clock, sim);
      budgetPanel.update(sim.stats, sim.budget, sim.levers);
      budgetPanel.syncSliders(sim.stats, sim.levers);
      statusEl.textContent = `${testCity.summary} New starts a fresh map.`;
    }
    previewCoverage(null);
    new SettingsPanel(settingsEl, {
      audio,
      onSun: (day) => weatherView.setDay(day),
      onQuality: applyQuality,
      onAmbientOcclusion: syncAmbientOcclusion,
      ambientOcclusionSupported: AmbientOcclusion.supported,
    });

    setInterval(() => {
      syncAmbient();
      redrawLook();
    }, 1000);
  }
}
