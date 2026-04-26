// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { CityMap } from './CityMap';
import { CityTile, RoadType, ZoneType } from './CityTile';
import { SimulationClock } from './SimulationClock';

/** Aggregate statistics for the city, updated each tick. */
export interface CityStats {
  population:        number;
  jobs:              number;
  money:             number;
  residentialDemand: number;
  commercialDemand:  number;
  industrialDemand:  number;
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
  readonly map:   CityMap;
  readonly clock: SimulationClock;
  readonly stats: CityStats;

  private constructor(map: CityMap) {
    this.map   = map;
    this.clock = new SimulationClock();
    this.stats = {
      population:        0,
      jobs:              0,
      money:             10_000,
      residentialDemand: 0,
      commercialDemand:  0,
      industrialDemand:  0,
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
    }
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

  /** Advance the simulation by deltaSeconds. Full growth simulation is a future concern. */
  tick(deltaSeconds: number): void {
    this.clock.tick(deltaSeconds);
  }
}

/** Convenience wrapper around {@link CitySim.createCity}. */
export function createCity(width: number, height: number): CitySim {
  return CitySim.createCity(width, height);
}

export { RoadType, ZoneType, TerrainType } from './CityTile';
