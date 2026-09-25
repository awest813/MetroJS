// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { CityMap } from './CityMap';
import { RoadType, ZoneType, TerrainType, type CityTile } from './CityTile';
import { SimulationClock } from './SimulationClock';
import { ZoneGrowthSystem } from './ZoneGrowthSystem';
import { PowerSystem } from './PowerSystem';
import { LandValueSystem } from './LandValueSystem';
import { TrafficPressureSystem } from './TrafficPressureSystem';
import { WalkabilitySystem } from './WalkabilitySystem';
import { TransitSystem } from './TransitSystem';
import { PollutionSystem } from './PollutionSystem';
import { PopulationDensitySystem } from './PopulationDensitySystem';
import { PoliceCoverageSystem } from './PoliceCoverageSystem';
import { FireCoverageSystem } from './FireCoverageSystem';
import { WaterCoverageSystem } from './WaterCoverageSystem';
import { CrimeSystem } from './CrimeSystem';
import { EvaluationSystem, type RatingParts } from './EvaluationSystem';
import { tileKey } from './ZoneGrowthSystem';
import { STARTER_RESIDENTIAL_DEMAND } from './zoneGrowthHints';
import { STARTING_MONEY, tallyBudget, type BudgetLevers, type BudgetTally } from './EconomySystem';
import { PowerRoom } from './powerRoom';
import {
  BOND_AMOUNT,
  MAX_BONDS,
  ROAD_FUNDING_MAX,
  ROAD_FUNDING_MIN,
  SAFETY_FUNDING_MAX,
  SAFETY_FUNDING_MIN,
  clampFunding,
  newBond,
  roadWearFactor,
} from './budgetLevers';
import { WEATHER_EFFECTS, weatherFor, weatherLabel, weatherOfKind, type Weather, type WeatherKind } from './weather';
import { DEFAULT_TERRAIN_SEED } from './TerrainGenerator';
import { composeHappiness, type HappinessParts } from './happiness';
import { bridgeProblem, type BridgeProblem } from './roadConnections';
import { milestoneReady, nextMilestone, type Milestone } from './milestones';
import { isTierUpgrade } from './serviceTiers';
import { civicBonuses, isUnlocked, type CivicBonuses } from './civic';
import {
  BAILOUT_OFFER_MONTHS,
  BAILOUT_TAX_RATE,
  BAILOUT_TERM_MONTHS,
  COUNCIL_CUT_MONTHS,
  biggestCosts,
  type CouncilEvent,
} from './bankruptcy';

/** Why a road cannot be laid on a tile at the sim layer (tools add cost/upgrade rules). */
export type RoadPlacementBlock = 'off-map' | 'building' | BridgeProblem;

/** Aggregate statistics for the city, updated each tick. */
export interface CityStats {
  population:        number;
  /**
   * Residents counted while their building has no power.
   * Equal to `population` when the whole city is dark, and 0 when every home is powered.
   */
  darkPopulation:    number;
  jobs:              number;
  /**
   * Jobs in shops and the shop half of mixed use (part of `jobs`). Set by the
   * census; commercial demand compares it with the population.
   */
  shopJobs?:         number;
  money:             number;
  residentialDemand: number;
  commercialDemand:  number;
  industrialDemand:  number;
  /** Residential tax rate, 0–20 (percentage). Default 9. */
  resTaxRate:        number;
  /** Commercial tax rate, 0–20 (percentage). Default 9. */
  comTaxRate:        number;
  /** Industrial tax rate, 0–20 (percentage). Default 9. */
  indTaxRate:        number;
  /** Net income collected last simulated month. */
  monthlyIncome:     number;
  /** Expenses paid last simulated month. */
  monthlyExpenses:   number;
  /** Operating cost of service buildings at the current layout (not last billed). */
  serviceExpenses:   number;
  /** Tax take the next billed month would collect at current pop/jobs/rates. */
  projectedIncome:   number;
  /** Upkeep the next billed month would charge at current roads and civic. */
  projectedExpenses: number;
  /** True whenever the city treasury is negative. */
  bankruptcyWarning: boolean;
  /**
   * City-wide happiness [0–100]. Composed from extreme traffic, walkability,
   * transit access, and (on monthly ticks) crime — never stacked by placement.
   * Below 80 it turns part of the housing demand away (see happinessDraw).
   */
  happiness: number;
  /** What made this month's happiness, for the HUD (not saved: recomposed on load). */
  happinessParts?: HappinessParts;
  /**
   * City-wide walkability score [0–100].  Average walkability across all
   * zoned tiles, computed by WalkabilitySystem each month.
   * Higher values mean residents can reach destinations on foot.
   */
  walkability: number;
  /**
   * City-wide transit access score [0–100].  Average transit access across
   * all zoned tiles, computed by TransitSystem each month.
   * Higher values mean residents live near trolley corridors.
   */
  transitAccess: number;
  /**
   * City-wide pollution [0–100]. Mean pollution on developed tiles (zone,
   * building, or road), including clean lots at 0.
   */
  pollutionAverage: number;
  /**
   * City-wide crime score [0–100]. Average crime across occupied (density > 0)
   * tiles, computed by CrimeSystem each month.
   */
  crimeAverage: number;
  /**
   * Mean fire coverage [0–100] on occupied (density > 0) tiles.
   * Computed by FireCoverageSystem. Zero when nobody lives in the city yet.
   */
  fireAverage: number;
  /**
   * Percent of zoned tiles that are watered [0–100].
   */
  waterAverage: number;
  /** Capacity of every plant feeding a street network (residents plus jobs it can carry). */
  powerSupply: number;
  /** Load drawn by the lots those networks serve. */
  powerLoad: number;
  /** Buildings a power network reaches but cannot serve: its plants are at capacity. */
  powerShort: number;
  /**
   * Buildings that would have grown last month but were held back because
   * their power grid had no room (see `PowerRoom`). Optional: 0 when absent.
   */
  powerHeld?: number;
  /** Capacity of every powered tower feeding water mains. */
  waterSupply: number;
  /** Load drawn by the lots the mains serve. */
  waterLoad: number;
  /** Buildings the mains reach but cannot serve: the towers run dry. */
  waterShort: number;
  /**
   * City rating [0–100] from EvaluationSystem: size, happiness, services and
   * budget, less smog, high taxes, no plant and debt. (Saved as `approval`.)
   */
  approval: number;
  /** What made the rating, for the HUD (not saved: recomputed on load). */
  ratingParts?: RatingParts;
  /**
   * Top city-wide advisory, or empty when nothing is wrong enough to flag.
   */
  advisory: string;
  /** Where the advisory's trouble is, when it has a place (the HUD jumps there). */
  advisoryAt?: { x: number; y: number } | null;
  /** Milestones reached (sim/milestones.ts): 0 a hamlet, 1 Village … 4 Capital. */
  milestones?: number;
  /** Month-ends in a row the treasury has been in debt (sim/bankruptcy.ts). */
  debtMonths?: number;
  /** The council holds police, fire, and road funding at the minimum until the debt is paid. */
  councilCuts?: boolean;
  /** The state has offered a bailout; the player must take it or start a new city. */
  bailoutOffered?: boolean;
  /** Months left of a bailout's terms: every tax held at 12%, and a rating penalty. */
  bailoutMonths?: number;
  /** Bailouts taken so far. */
  bailouts?: number;
  /** What the working civic buildings add (sim/civic.ts); recomputed, not saved. */
  civic?: CivicBonuses;
  /** A test city's goal (scenarios/goals.ts): which, from which month, and how it stands. */
  scenario?: ScenarioState;
}

/** A scenario's progress, kept with the city so a save keeps it. */
export interface ScenarioState {
  readonly id: string;
  /** The month it started (`clock.monthsPassed`). */
  readonly start: number;
  status: 'active' | 'won' | 'lost';
}

/**
 * Top-level simulation facade.
 *
 * Owns the CityMap and SimulationClock; exposes the public API described in
 * the OpenPublica sim spec.  No Babylon.js or DOM dependencies.
 *
 * @example
 *   const sim = CitySim.createCity(64, 64);
 *   sim.placeRoad(10, 10, RoadType.Street);
 *   sim.tick(1);
 */
export class CitySim {
  readonly map:          CityMap;
  readonly clock:        SimulationClock;
  readonly stats:        CityStats;
  readonly growth:       ZoneGrowthSystem;
  readonly power:        PowerSystem;
  readonly landValue:    LandValueSystem;
  readonly pollution:    PollutionSystem;
  readonly density:      PopulationDensitySystem;
  readonly police:       PoliceCoverageSystem;
  readonly fire:         FireCoverageSystem;
  readonly water:        WaterCoverageSystem;
  readonly crime:        CrimeSystem;
  readonly evaluation:   EvaluationSystem;
  readonly traffic:      TrafficPressureSystem;
  readonly walkability:  WalkabilitySystem;
  readonly transit:      TransitSystem;
  private _terrainSeed = 0;

  /**
   * Seed used to paint lakes, hills, and woods. Persisted so load rebuilds the
   * same land; land value reads the woods from it.
   */
  get terrainSeed(): number {
    return this._terrainSeed;
  }

  set terrainSeed(seed: number) {
    this._terrainSeed = seed;
    if (this.landValue) this.landValue.woodsSeed = seed;
    this._weatherMonth = -1; // the weather follows the seed
  }

  /** This month's weather: fixed by the map seed and the month. */
  get weather(): Weather {
    this._syncWeather();
    return this._weather;
  }

  /** Next month's weather, for forecasts. */
  get nextWeather(): Weather {
    const month = this.clock.monthsPassed + 1;
    return this._pinnedWeather ? weatherOfKind(this._pinnedWeather, month) : weatherFor(this._terrainSeed, month);
  }

  /**
   * The latest budget projection at today's layout and weather: each tax's
   * take and each upkeep line (not the last bill; see `stats.monthlyIncome`).
   */
  budget!: BudgetTally;

  /**
   * Called after each monthly growth tick with the list of tiles that received a
   * new building.  Wire this up in App.ts to refresh the renderer.
   */
  onGrowth: ((changed: ReadonlyArray<{ x: number; y: number }>) => void) | null = null;

  /**
   * Called after power coverage is recalculated — either on a monthly tick or
   * immediately after a service building is placed.  Wire this up in App.ts to
   * refresh the power overlay and building warning states.
   */
  onPowerChanged: (() => void) | null = null;

  /**
   * Called after land value is recalculated — on a monthly tick or immediately
   * after a park is placed.  Wire this up in App.ts to refresh the land value
   * overlay.
   */
  onLandValueChanged: (() => void) | null = null;

  /**
   * Called after traffic pressure is recalculated each month.
   * Wire this up in App.ts to refresh the traffic overlay and decorative cars.
   */
  onTrafficChanged: (() => void) | null = null;

  /**
   * Called after walkability is recalculated each month.
   * Wire this up in App.ts to refresh the walkability overlay.
   */
  onWalkabilityChanged: (() => void) | null = null;

  /**
   * Called after transit access is recalculated each month.
   * Wire this up in App.ts to refresh the transit overlay.
   */
  onTransitChanged: (() => void) | null = null;

  /**
   * Called after density, police, fire, water coverage, and crime are recalculated.
   */
  onCrimeChanged: (() => void) | null = null;

  /**
   * Called after a monthly pass so HUD/budget can refresh without polling.
   */
  onMonth: (() => void) | null = null;

  /** Called when a new month brings new weather (and on load). */
  onWeatherChanged: (() => void) | null = null;

  /** Called at a month's end when the city reaches a milestone (its grant already paid). */
  onMilestone: ((milestone: Milestone) => void) | null = null;

  /** Called at a month's end when the council cuts funding, or the state offers a bailout. */
  onCouncil: ((event: CouncilEvent) => void) | null = null;

  private _weather!: Weather;
  /** The month whose weather effects are on the systems, or -1. */
  private _weatherMonth = -1;
  /** Weather pinned for testing (`?weather=`), or null for the seasons' own. */
  private _pinnedWeather: WeatherKind | null = null;

  /** Nesting depth of {@link batch}; edits inside defer their refresh. */
  private _batchDepth = 0;
  /** True while a month's end is evaluated: the advisory on show is held (see EvaluationSystem). */
  private _steadyAdvice = false;
  /** An edit inside a batch is waiting for its refresh. */
  private _pendingRefresh = false;

  private constructor(map: CityMap, terrainSeed: number) {
    this.map          = map;
    this.terrainSeed  = terrainSeed;
    this.clock        = new SimulationClock();
    this.power        = new PowerSystem();
    this.pollution    = new PollutionSystem();
    this.density      = new PopulationDensitySystem();
    this.police       = new PoliceCoverageSystem();
    this.fire         = new FireCoverageSystem();
    this.water        = new WaterCoverageSystem();
    this.crime        = new CrimeSystem();
    this.evaluation   = new EvaluationSystem();
    this.landValue    = new LandValueSystem();
    this.landValue.woodsSeed = terrainSeed;
    this.traffic      = new TrafficPressureSystem();
    this.walkability  = new WalkabilitySystem();
    this.transit      = new TransitSystem();
    this.growth       = new ZoneGrowthSystem(this.power, this.pollution, this.landValue, this.traffic, this.walkability, this.transit);
    this.stats  = {
      population:        0,
      darkPopulation:    0,
      jobs:              0,
      money:             STARTING_MONEY,
      residentialDemand: STARTER_RESIDENTIAL_DEMAND,
      commercialDemand:  0,
      industrialDemand:  20, // industrial starts with a modest positive demand
      resTaxRate:        9,
      comTaxRate:        9,
      indTaxRate:        9,
      monthlyIncome:     0,
      monthlyExpenses:   0,
      serviceExpenses:   0,
      projectedIncome:   0,
      projectedExpenses: 0,
      bankruptcyWarning: false,
      happiness:         100,
      walkability:       0,
      transitAccess:     0,
      pollutionAverage:  0,
      crimeAverage:      0,
      fireAverage:       0,
      waterAverage:      0,
      powerSupply:       0,
      powerLoad:         0,
      powerShort:        0,
      waterSupply:       0,
      waterLoad:         0,
      waterShort:        0,
      approval:          100,
      advisory:          '',
      milestones:        0,
    };
    this._syncWeather();
    this.previewEconomy();
    this.evaluate();
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  /** Create a new city of the given tile dimensions. */
  static createCity(width: number, height: number, terrainSeed: number = DEFAULT_TERRAIN_SEED): CitySim {
    return new CitySim(new CityMap(width, height), terrainSeed);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Returns the tile at (x, y), or undefined if out of bounds. */
  getTile(x: number, y: number): CityTile | undefined {
    return this.map.getTile(x, y);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** True when the tile exists and is not water. */
  isBuildable(x: number, y: number): boolean {
    const tile = this.map.getTile(x, y);
    return !!tile && tile.terrain !== TerrainType.Water;
  }

  /**
   * Assign a zone type to the tile at (x, y).
   * No-op if out of bounds, water, occupied by a building, or (when zoning) a road.
   */
  setZone(x: number, y: number, zoneType: ZoneType): void {
    const tile = this.map.getTile(x, y);
    if (!tile || tile.terrain === TerrainType.Water) return;
    if (tile.buildingId !== null) return;
    if (zoneType !== ZoneType.None && tile.roadType !== RoadType.None) return;
    tile.zoneType = zoneType;
    this._afterEdit();
  }

  /**
   * Why a road cannot go on (x, y), or null when it can.
   * Water is allowed: a road over water is a bridge, and bridges run straight
   * (no turns, junctions, or side streets over the water).
   */
  roadPlacementBlock(x: number, y: number): RoadPlacementBlock | null {
    const tile = this.map.getTile(x, y);
    if (!tile) return 'off-map';
    if (tile.buildingId !== null) return 'building';
    return bridgeProblem(this.map, x, y);
  }

  /**
   * Place a road on the tile at (x, y). A road on water is a bridge span.
   * No-op (returns false) when {@link roadPlacementBlock} names a reason.
   * Paving an empty lot clears the zone — a street is not a housing plat.
   */
  placeRoad(x: number, y: number, roadType: RoadType): boolean {
    if (this.roadPlacementBlock(x, y) !== null) return false;
    const tile = this.map.getTile(x, y)!;
    tile.roadType = roadType;
    tile.zoneType = ZoneType.None;
    this._afterEdit();
    return true;
  }

  /** Clear the road, zone, and building from the tile at (x, y). No-op if out of bounds. */
  bulldoze(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;
    this.growth.removeAt(x, y);
    tile.clearOccupancy();
    this._afterEdit();
  }

  /** Whether the city has a building of this def. */
  hasBuilding(defId: string): boolean {
    for (const instance of this.growth.buildings.values()) if (instance.defId === defId) return true;
    return false;
  }

  /** True when {@link placeServiceBuilding} would succeed here right now. */
  canPlaceServiceBuilding(x: number, y: number, defId: string, cost: number): boolean {
    return this._serviceLot(x, y, defId) !== null && this.canAfford(cost);
  }

  /**
   * Place a service building (e.g. a power plant) on the tile at (x, y).
   *
   * - Deducts `cost` from the treasury; fails silently if insufficient funds.
   * - On a lot holding the same service's small tier (a pump, a fire hall, a
   *   police post), replaces it: the tool charges only the difference.
   * - Registers the building in the growth system's buildings registry.
   * - Immediately recalculates power coverage so the overlay updates at once.
   *
   * Returns `true` if the building was placed successfully.
   */
  placeServiceBuilding(x: number, y: number, defId: string, cost: number): boolean {
    const tile = this._serviceLot(x, y, defId);
    if (!tile) return false;

    if (!this.deductMoney(cost)) return false;

    // Civic buildings occupy the lot; they are not a zoned plat underneath.
    tile.zoneType = ZoneType.None;
    tile.buildingId = defId;
    this.growth.buildings.set(tileKey(x, y), { defId, x, y });

    this._afterEdit();
    return true;
  }

  /**
   * The dry, empty, road-free lot a known service building can go on, or
   * null. A lot holding the same service's small tier can take the full one.
   */
  private _serviceLot(x: number, y: number, defId: string): CityTile | null {
    const tile = this.map.getTile(x, y);
    if (!tile || tile.terrain === TerrainType.Water) return null;
    if (tile.buildingId !== null && !isTierUpgrade(tile.buildingId, defId)) return null;
    if (tile.roadType !== RoadType.None) return null;
    const def = this.growth.defs.get(defId);
    if (!def) return null;
    // Late civic buildings wait for their milestone, and some are one per city.
    if (!isUnlocked(defId, this.stats.milestones ?? 0)) return null;
    if (def.unique && this.hasBuilding(defId)) return null;
    return tile;
  }

  /**
   * Recompute power, traffic, pollution, coverage, crime, land value, and
   * civic upkeep from the current buildings. Does not advance the clock or
   * run economy/growth.
   *
   * Call after load so restored tiles are not left unpowered. Placement and
   * bulldoze use the same path so coverage discs and HUD averages stay honest.
   *
   * Pollution and happiness run after traffic, and land value runs after water,
   * so a paved street is not a silent, clean road until the next month.
   */
  refreshDerivedState(opts?: {
    applyCrimeHappiness?: boolean;
    notify?: boolean;
    includeMonthlyOverlays?: boolean;
  }): void {
    const applyCrimeHappiness = opts?.applyCrimeHappiness ?? false;
    const notify = opts?.notify ?? true;
    const includeMonthlyOverlays = opts?.includeMonthlyOverlays ?? false;

    if (this._syncWeather() && notify && this.onWeatherChanged) this.onWeatherChanged();
    this.power.tick(this.map, this.growth.buildings, this.growth.defs);

    if (includeMonthlyOverlays) {
      this.growth.recomputeCensus(this.stats, this.map);
    }

    this._syncPublishedState(applyCrimeHappiness, notify);

    if (!notify) return;
    if (this.onPowerChanged) this.onPowerChanged();
    if (this.onLandValueChanged) this.onLandValueChanged();
    this._notifyTrafficOverlays();
  }

  /**
   * Run several edits and refresh derived state once at the end, instead of
   * once per tile: a 400-lot zone paints in one pass. Every refresh recomputes
   * from the map, so the result matches refreshing after each edit.
   */
  batch<T>(edits: () => T): T {
    this._batchDepth += 1;
    try {
      return edits();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0 && this._pendingRefresh) {
        this._pendingRefresh = false;
        this._refreshAfterEdit();
      }
    }
  }

  /** Every edit can move power: roads carry it, lots draw it, plants feed it. */
  private _afterEdit(): void {
    if (this._batchDepth === 0) this._refreshAfterEdit();
    else this._pendingRefresh = true;
  }

  private _refreshAfterEdit(): void {
    this.refreshDerivedState({ applyCrimeHappiness: true, notify: true });
  }

  /**
   * One snapshot of derived map state.
   * Traffic first, then the smog and happiness that read it; coverage (police,
   * fire, water) before land value, which counts fire and water; land value
   * before crime, which reads it, so crime sees the values the player is about
   * to see.
   *
   * `trafficFresh` skips traffic, walk, and transit when they already ran on
   * the current roads and buildings (a month's last step runs them), which
   * saves the costliest part of a month-end frame.
   */
  private _syncPublishedState(applyCrimeHappiness: boolean, notify: boolean, trafficFresh = false): void {
    if (!trafficFresh) this._refreshTrafficLayers();
    this.pollution.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this._refreshCoverage();
    this.landValue.tick(this.map, this.growth.buildings, this.growth.defs);
    this._refreshCrimeAndHappiness(applyCrimeHappiness, notify);
    this.previewEconomy();
    this.evaluate();
  }

  /** Pressure, walk, and transit from the current buildings and road network. */
  private _refreshTrafficLayers(): void {
    this.traffic.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.walkability.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.transit.tick(this.map, this.stats);
  }

  private _notifyTrafficOverlays(): void {
    if (this.onTrafficChanged) this.onTrafficChanged();
    if (this.onWalkabilityChanged) this.onWalkabilityChanged();
    if (this.onTransitChanged) this.onTransitChanged();
  }

  private _refreshCityHealth(applyCrimeHappiness: boolean, notify = true): void {
    this._refreshCoverage();
    this._refreshCrimeAndHappiness(applyCrimeHappiness, notify);
    this.evaluate();
  }

  /** Density, then the police, fire, and water coverage laid over it. */
  private _refreshCoverage(): void {
    this.density.tick(this.map, this.growth.buildings, this.growth.defs);
    const safety = this.growth.economy.safetyFunding;
    this.police.tick(this.map, this.growth.buildings, this.growth.defs, safety);
    this.fire.tick(this.map, this.growth.buildings, this.growth.defs, this.stats, safety);
    this.water.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.stats.civic = civicBonuses(this.map, this.growth.buildings, this.growth.defs);
  }

  /** Crime from density, land value, and police; then happiness, which crime costs. */
  private _refreshCrimeAndHappiness(applyCrimeHappiness: boolean, notify: boolean): void {
    this.crime.tick(this.map, this.stats);
    if (applyCrimeHappiness) composeHappiness(this.map, this.stats, true);
    if (notify && this.onCrimeChanged) this.onCrimeChanged();
  }

  /**
   * Recalculate mayor approval and the top advisory from current map/stats.
   * Safe to call after tax changes or placement; does not advance the clock.
   */
  evaluate(): void {
    this.stats.powerSupply = this.power.summary.supply;
    this.stats.powerLoad = this.power.summary.load;
    this.stats.powerShort = this.power.summary.shortBuildings;
    this.stats.waterSupply = this.water.summary.supply;
    this.stats.waterLoad = this.water.summary.load;
    this.stats.waterShort = this.water.summary.shortBuildings;
    const now = WEATHER_EFFECTS[this.weather.kind];
    const next = this.nextWeather;
    const ahead = WEATHER_EFFECTS[next.kind];
    this.evaluation.tick(this.map, this.growth.buildings, this.growth.defs, this.stats, {
      label: weatherLabel(next.kind),
      powerLoadRatio: ahead.powerLoad / now.powerLoad,
      waterLoadRatio: ahead.waterLoad / now.waterLoad,
    }, this.budget ? { perTaxPoint: this.budget.perTaxPoint, costs: biggestCosts(this.budget) } : undefined, this.clock.monthsPassed, this._steadyAdvice);
  }

  /**
   * Refresh civic upkeep and next-month projection from the current layout.
   * Does not overwrite last-billed income/expenses or charge the treasury.
   */
  previewEconomy(): void {
    this._syncWeather();
    const tally = tallyBudget(
      this.map, this.growth.buildings, this.growth.defs, this.stats, this.growth.economy.roadUpkeepFactor,
      this.growth.economy,
    );
    this.budget = tally;
    this.stats.serviceExpenses = tally.serviceExpenses;
    this.stats.projectedIncome = tally.income;
    this.stats.projectedExpenses = tally.expenses;
  }

  /**
   * True when the empty zoned lot at (x, y) is on a power grid with no room
   * for even the smallest building its zone grows, so its growth waits for
   * another plant (see `PowerRoom`).
   */
  gridFullAt(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile || tile.zoneType === ZoneType.None || tile.buildingId !== null) return false;
    const room = new PowerRoom(this.power.grid, this.map, this.power.loadFactor);
    return !room.fits(tile, this.growth.smallestLoad(tile.zoneType));
  }

  /** The budget levers beyond taxes: police and fire funding, road funding, and bonds. */
  get levers(): BudgetLevers {
    return this.growth.economy;
  }

  /**
   * Fund police and fire at this percent (50–120, in tens): their upkeep and
   * their reach scale together.
   */
  setSafetyFunding(percent: number): void {
    // While the council holds funding at the minimum, it stays there.
    const max = this.stats.councilCuts ? SAFETY_FUNDING_MIN : SAFETY_FUNDING_MAX;
    this.growth.economy.safetyFunding = clampFunding(percent, SAFETY_FUNDING_MIN, max);
    this.refreshDerivedState({ notify: true });
  }

  /**
   * Fund road upkeep at this percent (50–100, in tens): cheaper, but worn
   * roads carry less, so traffic reads heavier.
   */
  setRoadFunding(percent: number): void {
    const max = this.stats.councilCuts ? ROAD_FUNDING_MIN : ROAD_FUNDING_MAX;
    this.growth.economy.roadFunding = clampFunding(percent, ROAD_FUNDING_MIN, max);
    this.traffic.roadWear = roadWearFactor(this.growth.economy.roadFunding);
    this.refreshDerivedState({ notify: true });
  }

  /**
   * Set the three tax rates (percent, 0–20). While a bailout's terms run,
   * every tax stays at {@link BAILOUT_TAX_RATE}. Returns false when held.
   */
  setTaxes(res: number, com: number, ind: number): boolean {
    const held = (this.stats.bailoutMonths ?? 0) > 0;
    const rate = (r: number): number => (held ? BAILOUT_TAX_RATE : Math.max(0, Math.min(20, Math.round(r))));
    this.stats.resTaxRate = rate(res);
    this.stats.comTaxRate = rate(com);
    this.stats.indTaxRate = rate(ind);
    this.previewEconomy();
    this.evaluate();
    return !held;
  }

  /**
   * Take the state's bailout, once offered after two years in debt: the debt
   * and the bonds are cleared, the council's cuts are lifted, and every tax
   * is held at {@link BAILOUT_TAX_RATE} for {@link BAILOUT_TERM_MONTHS} months,
   * with a rating penalty while it is. False when nothing is on offer.
   */
  acceptBailout(): boolean {
    const s = this.stats;
    if (!s.bailoutOffered) return false;
    s.money = Math.max(0, s.money);
    this.growth.economy.bonds.splice(0);
    s.bankruptcyWarning = false;
    s.debtMonths = 0;
    s.councilCuts = false;
    s.bailoutOffered = false;
    s.bailoutMonths = BAILOUT_TERM_MONTHS;
    s.bailouts = (s.bailouts ?? 0) + 1;
    s.resTaxRate = BAILOUT_TAX_RATE;
    s.comTaxRate = BAILOUT_TAX_RATE;
    s.indTaxRate = BAILOUT_TAX_RATE;
    this.previewEconomy();
    this.evaluate();
    return true;
  }

  /**
   * At a month's end, before the month's advice and rating: count months in
   * debt, cut funding after a year of it, offer a bailout after two, and run
   * down a bailout's terms. Returns what happened this month, if anything.
   */
  private _councilMonth(): CouncilEvent | null {
    const s = this.stats;
    if ((s.bailoutMonths ?? 0) > 0) {
      s.bailoutMonths = s.bailoutMonths! - 1;
      if (s.bailoutMonths > 0) {
        s.resTaxRate = BAILOUT_TAX_RATE;
        s.comTaxRate = BAILOUT_TAX_RATE;
        s.indTaxRate = BAILOUT_TAX_RATE;
      }
    }
    if (s.money >= 0) {
      s.debtMonths = 0;
      s.councilCuts = false;
      return null;
    }
    s.debtMonths = (s.debtMonths ?? 0) + 1;
    let event: CouncilEvent | null = null;
    if (s.debtMonths >= COUNCIL_CUT_MONTHS && !s.councilCuts) {
      s.councilCuts = true;
      const economy = this.growth.economy;
      economy.safetyFunding = SAFETY_FUNDING_MIN;
      economy.roadFunding = ROAD_FUNDING_MIN;
      this.traffic.roadWear = roadWearFactor(economy.roadFunding);
      event = 'cuts';
    }
    if (s.debtMonths >= BAILOUT_OFFER_MONTHS && !s.bailoutOffered) {
      s.bailoutOffered = true;
      event = 'bailout';
    }
    return event;
  }

  /**
   * Borrow {@link BOND_AMOUNT} now, repaid with interest over the bond's
   * term. False when the city already carries {@link MAX_BONDS}.
   */
  issueBond(): boolean {
    const bonds = this.growth.economy.bonds;
    if (bonds.length >= MAX_BONDS) return false;
    bonds.push(newBond());
    this.stats.money += BOND_AMOUNT;
    this.stats.bankruptcyWarning = this.stats.money < 0;
    this.previewEconomy();
    this.evaluate();
    return true;
  }

  /** Put saved levers back (a load); derived state is refreshed by the caller. */
  restoreLevers(levers: Partial<BudgetLevers>): void {
    const economy = this.growth.economy;
    economy.safetyFunding = clampFunding(levers.safetyFunding ?? 100, SAFETY_FUNDING_MIN, SAFETY_FUNDING_MAX);
    economy.roadFunding = clampFunding(levers.roadFunding ?? 100, ROAD_FUNDING_MIN, ROAD_FUNDING_MAX);
    economy.bonds.splice(0, economy.bonds.length, ...(levers.bonds ?? [])
      .filter((b) => b.owed > 0 && b.payment > 0)
      .slice(0, MAX_BONDS)
      .map((b) => ({ owed: b.owed, payment: b.payment })));
    this.traffic.roadWear = roadWearFactor(economy.roadFunding);
  }

  /**
   * Pin every month to one kind of weather, effects and all (a testing aid:
   * `?weather=snow`), or pass null to return to the seasons.
   */
  pinWeather(kind: WeatherKind | null): void {
    this._pinnedWeather = kind;
    this._weatherMonth = -1;
    this.refreshDerivedState({ notify: true });
  }

  /** Put the current month's weather effects on the systems. True when they changed. */
  private _syncWeather(): boolean {
    return this._applyWeather(this.clock.monthsPassed);
  }

  private _applyWeather(monthIndex: number): boolean {
    if (monthIndex === this._weatherMonth) return false;
    this._weatherMonth = monthIndex;
    this._weather = this._pinnedWeather
      ? weatherOfKind(this._pinnedWeather, monthIndex)
      : weatherFor(this._terrainSeed, monthIndex);
    const effects = WEATHER_EFFECTS[this._weather.kind];
    this.power.loadFactor = effects.powerLoad;
    this.water.loadFactor = effects.waterLoad;
    this.pollution.weatherFactor = effects.smog;
    this.growth.economy.roadUpkeepFactor = effects.roadUpkeep;
    return true;
  }

  // ── Economy ───────────────────────────────────────────────────────────────

  /** Returns true if the city treasury has at least `amount`. */
  canAfford(amount: number): boolean {
    return this.stats.money >= amount;
  }

  /**
   * Deducts `amount` from the city treasury.
   * Does nothing (and returns false) when funds are insufficient.
   */
  deductMoney(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    this.stats.money -= amount;
    return true;
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  /**
   * When the city meets its next milestone, count it and pay its grant.
   * {@link tick} calls it at each month's end, so a city passes one a month
   * and each gets its own banner. Returns the milestone reached, if any.
   */
  reachMilestone(): Milestone | null {
    const reached = this.stats.milestones ?? 0;
    const next = nextMilestone(reached);
    if (!next || !milestoneReady(this.stats, next)) return null;
    this.stats.milestones = reached + 1;
    this.stats.money += next.grant;
    this.stats.bankruptcyWarning = this.stats.money < 0;
    // The grant can lift the budget part of the rating.
    this._steadyAdvice = true;
    try {
      this.evaluate();
    } finally {
      this._steadyAdvice = false;
    }
    return next;
  }

  // ── Time ──────────────────────────────────────────────────────────────────

  /** Advance the simulation by deltaSeconds, running growth once per simulated month. */
  tick(deltaSeconds: number): void {
    const changedTiles: Array<{ x: number; y: number }> = [];
    this._syncWeather();
    const weatherBefore = this._weather;
    const startMonth = this.clock.monthsPassed;
    let monthsDone = 0;
    const month = this.growth.tick(
      deltaSeconds,
      this.map,
      this.stats,
      changedTiles,
      () => {
        // The next month's weather holds while it runs (catch-up runs several).
        monthsDone += 1;
        this._applyWeather(startMonth + monthsDone);
        this._steadyAdvice = true;
        try {
          this._refreshCityHealth(true);
        } finally {
          this._steadyAdvice = false;
        }
      },
    );
    this.clock.tick(month.clockAdvance);
    this._syncWeather();

    if (changedTiles.length > 0 && this.onGrowth) {
      this.onGrowth(changedTiles);
    }

    if (month.monthsRun === 0) return;

    // Buildings that left or shrank at month end draw no power, which can
    // light others: the HUD, census, and Power map must match what a reload
    // of this city would compute.
    this.power.tick(this.map, this.growth.buildings, this.growth.defs);
    this.growth.recomputeCensus(this.stats, this.map);
    // Debt, the council, and a bailout's terms, before this month's advice and rating.
    const council = this._councilMonth();
    // Growth used last month's smog. Publish this month's traffic before the
    // HUD: the month ended by routing it on this layout, and only power and the
    // census (which traffic does not read) have run since.
    this._steadyAdvice = true;
    try {
      this._syncPublishedState(true, true, true);
    } finally {
      this._steadyAdvice = false;
    }
    const reached = this.reachMilestone();
    const w = this._weather;
    const newWeather = w.kind !== weatherBefore.kind || w.temperature !== weatherBefore.temperature;
    if (newWeather && this.onWeatherChanged) this.onWeatherChanged();
    if (reached && this.onMilestone) this.onMilestone(reached);
    if (council && this.onCouncil) this.onCouncil(council);
    if (this.onMonth) this.onMonth();
    if (this.onPowerChanged) this.onPowerChanged();
    if (this.onLandValueChanged) this.onLandValueChanged();
    if (this.onTrafficChanged) this.onTrafficChanged();
    if (this.onWalkabilityChanged) this.onWalkabilityChanged();
    if (this.onTransitChanged) this.onTransitChanged();
  }
}

/** Convenience wrapper around {@link CitySim.createCity}. */
export function createCity(width: number, height: number, terrainSeed?: number): CitySim {
  return CitySim.createCity(width, height, terrainSeed);
}

export { RoadType, ZoneType, TerrainType } from './CityTile';
