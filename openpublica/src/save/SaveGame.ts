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
  neglectMonths?: number;
  /** Months its building has outgrown the lot (see ZoneGrowthSystem); omitted when 0. */
  outgrownMonths?: number;
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
  serviceExpenses?:  number;
  projectedIncome?:  number;
  projectedExpenses?: number;
  bankruptcyWarning: boolean;
  happiness:         number;
  walkability:       number;
  transitAccess:     number;
  pollutionAverage:  number;
  crimeAverage:      number;
  fireAverage:       number;
  waterAverage:      number;
  approval:          number;
  advisory:          string;
  /** Buildings the power grid held back last month (the grid-full advisory). */
  powerHeld?:        number;
  /** The advisory on show and the month it came up, so a load holds the same one. */
  advisoryHold?:     { id: string; since: number; message?: string; at?: { x: number; y: number } } | null;
  /** Milestones reached. A save from before milestones counts them from its population. */
  milestones?:       number;
}

/** Serialised budget levers beyond taxes. */
export interface SavedLevers {
  safetyFunding: number;
  roadFunding:   number;
  bonds:         Array<{ owed: number; payment: number }>;
}

/** Top-level save-game document stored in localStorage. */
export interface SaveGame {
  /** Schema version — used by the migration system. */
  version:           number;
  mapWidth:          number;
  mapHeight:         number;
  /** SimulationClock total seconds elapsed at save time. */
  clockTotalSeconds: number;
  /**
   * Seed for lakes and hills. Older saves omit this; load uses the default map seed.
   */
  terrainSeed?:      number;
  /**
   * ZoneGrowthSystem accumulator (intra-month remainder plus pending catch-up).
   * Older saves omit this; load uses clockTotalSeconds % month length.
   */
  monthAccumulator?: number;
  stats:             SavedStats;
  /**
   * Police and fire funding, road funding (percent), and bonds being repaid.
   * Older saves omit this; load uses full funding and no bonds.
   */
  levers?:           SavedLevers;
  tiles:             SavedTile[];
  buildings:         SavedBuilding[];
}
