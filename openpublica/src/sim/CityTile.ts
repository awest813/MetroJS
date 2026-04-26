// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

/** Surface type of a tile. */
export enum TerrainType {
  Grass = 0,
  Water = 1,
  Dirt  = 2,
}

/** Road classification placed on a tile. */
export enum RoadType {
  None    = 0,
  Street  = 1,
  Highway = 2,
}

/** Zone designation for a tile. */
export enum ZoneType {
  None        = 0,
  Residential = 1,
  Commercial  = 2,
  Industrial  = 3,
  /** Mixed-use main-street zoning: residents + commercial jobs in one tile. */
  MixedUse    = 4,
}

/** Full set of per-tile simulation properties. */
export interface ICityTile {
  readonly x: number;
  readonly y: number;
  terrain:         TerrainType;
  roadType:        RoadType;
  zoneType:        ZoneType;
  buildingId:      string | null;
  powered:         boolean;
  watered:         boolean;
  landValue:       number;
  pollution:       number;
  trafficPressure: number;
  /** Noise level [0–100] derived from traffic pressure by TrafficPressureSystem. */
  noise:           number;
  /**
   * Walkability score [0–100] for this tile.
   * Computed monthly by WalkabilitySystem from nearby mixed-use buildings,
   * parks, services, and road noise.
   * Higher walkability means residents can reach destinations on foot.
   */
  walkability:     number;
}

/** Mutable tile used by the simulation engine. */
export class CityTile implements ICityTile {
  readonly x: number;
  readonly y: number;
  terrain:         TerrainType;
  roadType:        RoadType;
  zoneType:        ZoneType;
  buildingId:      string | null;
  powered:         boolean;
  watered:         boolean;
  landValue:       number;
  pollution:       number;
  trafficPressure: number;
  noise:           number;
  walkability:     number;

  constructor(x: number, y: number) {
    this.x               = x;
    this.y               = y;
    this.terrain         = TerrainType.Grass;
    this.roadType        = RoadType.None;
    this.zoneType        = ZoneType.None;
    this.buildingId      = null;
    this.powered         = false;
    this.watered         = false;
    this.landValue       = 50; // neutral baseline until LandValueSystem first runs
    this.pollution       = 0;
    this.trafficPressure = 0;
    this.noise           = 0;
    this.walkability     = 0;
  }
}
