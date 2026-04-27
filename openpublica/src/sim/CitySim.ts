// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { CityMap } from './CityMap';
import { CityTile, RoadType, ZoneType } from './CityTile';
import { SimulationClock } from './SimulationClock';
import { ZoneGrowthSystem } from './ZoneGrowthSystem';
import { PowerSystem } from './PowerSystem';
import { LandValueSystem } from './LandValueSystem';
import { TrafficPressureSystem } from './TrafficPressureSystem';
import { WalkabilitySystem } from './WalkabilitySystem';
import { TransitSystem } from './TransitSystem';
import { PollutionSystem } from './PollutionSystem';
import { tileKey } from './ZoneGrowthSystem';

/** Aggregate statistics for the city, updated each tick. */
export interface CityStats {
  population:        number;
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
  /** True whenever the city treasury is negative. */
  bankruptcyWarning: boolean;
  /**
   * City-wide happiness [0–100].  Starts at 100 and is reduced by
   * TrafficPressureSystem when many road tiles carry extreme traffic pressure.
   * Boosted by WalkabilitySystem when the city has good pedestrian access.
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
   * City-wide pollution score [0–100]. Average pollution across polluted
   * tiles, computed by PollutionSystem each month.
   */
  pollutionAverage: number;
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
  readonly traffic:      TrafficPressureSystem;
  readonly walkability:  WalkabilitySystem;
  readonly transit:      TransitSystem;

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

  private constructor(map: CityMap) {
    this.map          = map;
    this.clock        = new SimulationClock();
    this.power        = new PowerSystem();
    this.pollution    = new PollutionSystem();
    this.landValue    = new LandValueSystem();
    this.traffic      = new TrafficPressureSystem();
    this.walkability  = new WalkabilitySystem();
    this.transit      = new TransitSystem();
    this.growth       = new ZoneGrowthSystem(this.power, this.pollution, this.landValue, this.traffic, this.walkability, this.transit);
    this.stats  = {
      population:        0,
      jobs:              0,
      money:             10_000,
      residentialDemand: 0,
      commercialDemand:  0,
      industrialDemand:  20, // industrial starts with a modest positive demand
      resTaxRate:        9,
      comTaxRate:        9,
      indTaxRate:        9,
      monthlyIncome:     0,
      monthlyExpenses:   0,
      bankruptcyWarning: false,
      happiness:         100,
      walkability:       0,
      transitAccess:     0,
      pollutionAverage:  0,
    };
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  /** Create a new city of the given tile dimensions. */
  static createCity(width: number, height: number): CitySim {
    return new CitySim(new CityMap(width, height));
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Returns the tile at (x, y), or undefined if out of bounds. */
  getTile(x: number, y: number): CityTile | undefined {
    return this.map.getTile(x, y);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Assign a zone type to the tile at (x, y). No-op if out of bounds. */
  setZone(x: number, y: number, zoneType: ZoneType): void {
    const tile = this.map.getTile(x, y);
    if (tile) tile.zoneType = zoneType;
  }

  /** Place a road on the tile at (x, y). No-op if out of bounds. */
  placeRoad(x: number, y: number, roadType: RoadType): void {
    const tile = this.map.getTile(x, y);
    if (tile) tile.roadType = roadType;
  }

  /** Clear the road, zone, and building from the tile at (x, y). No-op if out of bounds. */
  bulldoze(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (tile) {
      tile.roadType   = RoadType.None;
      tile.zoneType   = ZoneType.None;
      tile.buildingId = null;
      this.growth.removeAt(x, y);
    }
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
    const tile = this.map.getTile(x, y);
    if (!tile) return false;

    if (!this.deductMoney(cost)) {
      console.warn(
        `[PlaceService] Insufficient funds (need $${cost}, have $${this.stats.money})`,
      );
      return false;
    }

    tile.buildingId = defId;
    this.growth.buildings.set(tileKey(x, y), { defId, x, y });

    // Immediately recalculate power so nearby buildings become powered at once.
    this.power.tick(this.map, this.growth.buildings, this.growth.defs);
    if (this.onPowerChanged) this.onPowerChanged();

    // Immediately recalculate land value so park effects are visible at once.
    this.pollution.tick(this.map, this.growth.buildings, this.growth.defs, this.stats);
    this.landValue.tick(this.map, this.growth.buildings, this.growth.defs);
    if (this.onLandValueChanged) this.onLandValueChanged();

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

  // ── Time ──────────────────────────────────────────────────────────────────

  /** Advance the simulation by deltaSeconds, running growth once per simulated month. */
  tick(deltaSeconds: number): void {
    this.clock.tick(deltaSeconds);

    const changedTiles: Array<{ x: number; y: number }> = [];
    const monthTicked = this.growth.tick(deltaSeconds, this.map, this.stats, changedTiles);

    if (changedTiles.length > 0 && this.onGrowth) {
      this.onGrowth(changedTiles);
    }

    // Power is recalculated inside growth.tick() each month; notify listeners.
    if (monthTicked && this.onPowerChanged) {
      this.onPowerChanged();
    }

    // Land value is also recalculated monthly; notify listeners.
    if (monthTicked && this.onLandValueChanged) {
      this.onLandValueChanged();
    }

    // Traffic pressure is recalculated monthly; notify listeners.
    if (monthTicked && this.onTrafficChanged) {
      this.onTrafficChanged();
    }

    // Walkability is recalculated monthly (after traffic); notify listeners.
    if (monthTicked && this.onWalkabilityChanged) {
      this.onWalkabilityChanged();
    }

    // Transit access is recalculated monthly (after walkability); notify listeners.
    if (monthTicked && this.onTransitChanged) {
      this.onTransitChanged();
    }
  }
}

/** Convenience wrapper around {@link CitySim.createCity}. */
export function createCity(width: number, height: number): CitySim {
  return CitySim.createCity(width, height);
}

export { RoadType, ZoneType, TerrainType } from './CityTile';
