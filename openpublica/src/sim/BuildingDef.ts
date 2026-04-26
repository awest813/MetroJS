// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import { ZoneType } from './CityTile';

/**
 * Static definition of a building type loaded from buildings.json.
 * zoneType mirrors the ZoneType enum values (1 = Residential, 2 = Commercial, 3 = Industrial).
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
}
