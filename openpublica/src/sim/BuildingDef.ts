// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { ZoneType } from './CityTile';

/**
 * Static definition of a building type loaded from buildings.json.
 * zoneType mirrors the ZoneType enum values (1 = Residential, 2 = Commercial,
 * 3 = Industrial, 4 = MixedUse).
 */
export interface BuildingDef {
  /** Unique identifier referenced by CityTile.buildingId. */
  readonly id:         string;
  /** Human-readable display name. */
  readonly name:       string;
  /** Zone type this building can grow in (matches ZoneType enum). */
  readonly zoneType:   ZoneType;
  /** Number of residents produced by one instance of this building. */
  readonly population: number;
  /** Number of jobs produced by one instance of this building. */
  readonly jobs:       number;
  /**
   * True for civic / utility buildings (e.g. fire stations, schools) that
   * contribute a monthly operating expense.  Omit or set to false for
   * residential, commercial, and industrial buildings.
   */
  readonly isService?: boolean;
  /**
   * Load this plant can carry: the residents plus jobs of the lots it serves
   * along the streets its lot touches. Omit for buildings that draw power.
   */
  readonly powerCapacity?: number;
  /**
   * Radius (in tiles) within which this building increases land value.
   * Only meaningful for park / green-space service buildings.
   * Omit or set to 0 for non-park buildings.
   */
  readonly parkRadius?: number;
  /**
   * Radius (in tiles) within which this mixed-use building boosts walkability
   * and land value on nearby tiles.
   * Only meaningful for mixed-use buildings.
   * Omit or set to 0 for non-mixed-use buildings.
   */
  readonly walkabilityRadius?: number;
  /**
   * Base pollution emitted by this building each month.
   * PollutionSystem spreads this value radially from the building tile.
   * Omit or set to 0 for non-polluting buildings.
   */
  readonly pollutionOutput?: number;
  /**
   * Radius (in tiles) within which this building's pollution spreads.
   * Only meaningful when pollutionOutput is positive.
   * Omit or set to 0 for non-polluting buildings.
   */
  readonly pollutionRadius?: number;
  /**
   * Police reach in road steps (highways count half). Patrol cars leave by the
   * station's street, so a station needs power and a street to cover anyone.
   */
  readonly policeRadius?: number;
  /**
   * Fire reach in road steps (highways count half), like `policeRadius`.
   * No disaster simulation uses this yet — it is a coverage field for HUD/overlay.
   */
  readonly fireRadius?: number;
  /**
   * Load this tower's mains can carry along the streets its lot touches
   * (residents plus jobs). Only while the tower itself has power. Writes
   * `tile.watered`; does not change growth formulas.
   */
  readonly waterCapacity?: number;
  /**
   * Monthly operating cost while this service building exists.
   * EconomySystem sums these instead of a flat per-service fee.
   */
  readonly monthlyCost?: number;
}
