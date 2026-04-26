// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

/**
 * Represents a single building placed on a specific tile.
 * Stored in a registry keyed by tile coordinate string ("x,y").
 */
export interface BuildingInstance {
  /** References BuildingDef.id to look up stats. */
  readonly defId:      string;
  /** Tile column where the building sits. */
  readonly x:          number;
  /** Tile row where the building sits. */
  readonly y:          number;
}
