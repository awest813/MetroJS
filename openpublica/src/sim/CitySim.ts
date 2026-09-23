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
import { EvaluationSystem } from './EvaluationSystem';
import { tileKey } from './ZoneGrowthSystem';
import { STARTER_RESIDENTIAL_DEMAND } from './zoneGrowthHints';
import { tallyBudget } from './EconomySystem';
import { DEFAULT_TERRAIN_SEED } from './TerrainGenerator';
import { composeHappiness } from './happiness';
import { bridgeProblem, type BridgeProblem } from './roadConnections';

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
   */
  happiness: number;
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
  /**
   * Mayor approval [0–100] from EvaluationSystem. Starts at 100.
   */
  approval: number;
  /**
   * Top city-wide advisory, or empty when nothing is wrong enough to flag.
   */
  advisory: string;
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
  /**
   * Seed used to paint lakes/hills. Persisted so load rebuilds the same heightfield.
   */
  terrainSeed: number;

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

  /** Nesting depth of {@link batch}; edits inside defer their refresh. */
  private _batchDepth = 0;
  /** Strongest refresh an edit asked for while batched. */
  private _pendingRefresh: 'none' | 'network' | 'full' = 'none';

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
    this.traffic      = new TrafficPressureSystem();
    this.walkability  = new WalkabilitySystem();
    this.transit      = new TransitSystem();
    this.growth       = new ZoneGrowthSystem(this.power, this.pollution, this.landValue, this.traffic, this.walkability, this.transit);
    this.stats  = {
      population:        0,
      darkPopulation:    0,
      jobs:              0,
      money:             10_000,
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
      approval:          100,
      advisory:          '',
    };
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
    this._afterEdit('network');
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
    this._afterEdit('network');
    return true;
  }

  /** Clear the road, zone, and building from the tile at (x, y). No-op if out of bounds. */
  bulldoze(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;
    this.growth.removeAt(x, y);
    tile.clearOccupancy();
    this._afterEdit('full');
  }

  /** True when {@link placeServiceBuilding} would succeed here right now. */
  canPlaceServiceBuilding(x: number, y: number, defId: string, cost: number): boolean {
    return this._serviceLot(x, y, defId) !== null && this.canAfford(cost);
  }

  /**
   * Place a service building (e.g. a power plant) on the tile at (x, y).
   *
   * - Deducts `cost` from the treasury; fails silently if insufficient funds.
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

    this._afterEdit('full');
    return true;
  }

  /** The dry, empty, road-free lot a known service building can go on, or null. */
  private _serviceLot(x: number, y: number, defId: string): CityTile | null {
    const tile = this.map.getTile(x, y);
    if (!tile || tile.terrain === TerrainType.Water) return null;
    if (tile.buildingId !== null) return null;
    if (tile.roadType !== RoadType.None) return null;
    if (!this.growth.defs.has(defId)) return null;
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
      if (this._batchDepth === 0) {
        const pending = this._pendingRefresh;
        this._pendingRefresh = 'none';
        if (pending !== 'none') this._refreshAfterEdit(pending);
      }
    }
  }

  /** Zone and road edits refresh the network; buildings also move power. */
  private _afterEdit(kind: 'network' | 'full'): void {
    if (this._batchDepth === 0) {
      this._refreshAfterEdit(kind);
    } else if (kind === 'full' || this._pendingRefresh === 'none') {
      this._pendingRefresh = kind;
    }
  }

  private _refreshAfterEdit(kind: 'network' | 'full'): void {
    if (kind === 'full') this.refreshDerivedState({ applyCrimeHappiness: true, notify: true });
    else this._refreshNetwork();
  }

  /** Traffic, smog, happiness, and land value after zone/road edits. */
  private _refreshNetwork(): void {
    this._syncPublishedState(true, true);
    if (this.onLandValueChanged) this.onLandValueChanged();
    this._notifyTrafficOverlays();
  }

  /**
   * One snapshot of derived map state.
   * Traffic first, then the smog and happiness that read it, then land value
   * (after water) so crime sees the values the player is about to see.
   */
  private _syncPublishedState(applyCrimeHappiness: boolean, notify: boolean): void {
    this._refreshTrafficLayers();
    this.pollution.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.water.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.landValue.tick(this.map, this.growth.buildings, this.growth.defs);
    this._refreshCityHealth(applyCrimeHappiness, notify);
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
    this.density.tick(this.map, this.growth.buildings, this.growth.defs);
    this.police.tick(this.map, this.growth.buildings, this.growth.defs);
    this.fire.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.water.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.crime.tick(this.map, this.stats);
    if (applyCrimeHappiness) composeHappiness(this.map, this.stats, true);
    this.evaluate();
    if (notify && this.onCrimeChanged) this.onCrimeChanged();
  }

  /**
   * Recalculate mayor approval and the top advisory from current map/stats.
   * Safe to call after tax changes or placement; does not advance the clock.
   */
  evaluate(): void {
    this.evaluation.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
  }

  /**
   * Refresh civic upkeep and next-month projection from the current layout.
   * Does not overwrite last-billed income/expenses or charge the treasury.
   */
  previewEconomy(): void {
    const tally = tallyBudget(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.stats.serviceExpenses = tally.serviceExpenses;
    this.stats.projectedIncome = tally.income;
    this.stats.projectedExpenses = tally.expenses;
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

  // ── Time ──────────────────────────────────────────────────────────────────

  /** Advance the simulation by deltaSeconds, running growth once per simulated month. */
  tick(deltaSeconds: number): void {
    const changedTiles: Array<{ x: number; y: number }> = [];
    const month = this.growth.tick(
      deltaSeconds,
      this.map,
      this.stats,
      changedTiles,
      () => this._refreshCityHealth(true),
    );
    this.clock.tick(month.clockAdvance);

    if (changedTiles.length > 0 && this.onGrowth) {
      this.onGrowth(changedTiles);
    }

    if (month.monthsRun === 0) return;

    // Growth used last month's smog. Publish this month's traffic before the HUD.
    this._syncPublishedState(true, true);
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
