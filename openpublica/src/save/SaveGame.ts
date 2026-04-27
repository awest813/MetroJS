// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

/** Current save-file format version. Increment whenever the schema changes. */
export const SAVE_VERSION = 1;

/** Serialised tile — only the fields needed to restore sim state; no computed data. */
export interface SavedTile {
  x:          number;
  y:          number;
  terrain:    number;
  roadType:   number;
  zoneType:   number;
  buildingId: string | null;
}

/** Serialised building instance. */
export interface SavedBuilding {
  defId: string;
  x:     number;
  y:     number;
}

/** Serialised snapshot of CityStats. */
export interface SavedStats {
  population:        number;
  jobs:              number;
  money:             number;
  residentialDemand: number;
  commercialDemand:  number;
  industrialDemand:  number;
  resTaxRate:        number;
  comTaxRate:        number;
  indTaxRate:        number;
  monthlyIncome:     number;
  monthlyExpenses:   number;
  bankruptcyWarning: boolean;
  happiness:         number;
  walkability:       number;
  transitAccess:     number;
  pollutionAverage:  number;
}

/** Top-level save-game document stored in localStorage. */
export interface SaveGame {
  /** Schema version — used by the migration system. */
  version:           number;
  mapWidth:          number;
  mapHeight:         number;
  /** SimulationClock total seconds elapsed at save time. */
  clockTotalSeconds: number;
  stats:             SavedStats;
  tiles:             SavedTile[];
  buildings:         SavedBuilding[];
}
