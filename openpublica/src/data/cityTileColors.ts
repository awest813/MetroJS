// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityTile } from '../sim/CityTile';
import { RoadType, ZoneType, TerrainType } from '../sim/CityTile';
import type { TileColor } from './tileTypes';

/** Display color for each zone type (no road). */
const ZONE_COLORS: Record<ZoneType, TileColor> = {
  [ZoneType.None]:        { r: 0.30, g: 0.60, b: 0.22 }, // grass (default terrain)
  [ZoneType.Residential]: { r: 0.38, g: 0.58, b: 0.82 }, // soft blue
  [ZoneType.Commercial]:  { r: 0.90, g: 0.78, b: 0.22 }, // amber/yellow
  [ZoneType.Industrial]:  { r: 0.62, g: 0.42, b: 0.72 }, // muted purple
  [ZoneType.MixedUse]:    { r: 0.22, g: 0.72, b: 0.62 }, // teal
};

/** Display color for each road type. */
const ROAD_COLORS: Record<RoadType, TileColor> = {
  [RoadType.None]:    { r: 0, g: 0, b: 0 },              // unused; road=None falls through to terrain
  [RoadType.Street]:  { r: 0.42, g: 0.42, b: 0.42 },     // grey asphalt
  [RoadType.Highway]: { r: 0.25, g: 0.25, b: 0.25 },     // dark concrete
};

/** Display colour for each terrain type (used when no road or zone). */
const TERRAIN_COLORS: Record<TerrainType, TileColor> = {
  [TerrainType.Grass]: { r: 0.30, g: 0.60, b: 0.22 },
  [TerrainType.Water]: { r: 0.18, g: 0.45, b: 0.78 },
  [TerrainType.Dirt]:  { r: 0.60, g: 0.44, b: 0.28 },
};

/** Display colour for a tile that has a building on it (darker than the zone tint). */
const BUILDING_COLORS: Record<ZoneType, TileColor> = {
  [ZoneType.None]:        { r: 0.30, g: 0.60, b: 0.22 }, // fallback (unused)
  [ZoneType.Residential]: { r: 0.20, g: 0.35, b: 0.65 }, // dark blue
  [ZoneType.Commercial]:  { r: 0.70, g: 0.55, b: 0.05 }, // dark amber
  [ZoneType.Industrial]:  { r: 0.40, g: 0.22, b: 0.50 }, // dark purple
  [ZoneType.MixedUse]:    { r: 0.10, g: 0.50, b: 0.42 }, // dark teal
};

/**
 * Returns the display colour for a CityTile.
 *
 * Priority: road > building > zone > terrain.
 */
export function cityTileColor(tile: CityTile): TileColor {
  if (tile.roadType !== RoadType.None) {
    return ROAD_COLORS[tile.roadType];
  }
  if (tile.buildingId !== null && tile.zoneType !== ZoneType.None) {
    return BUILDING_COLORS[tile.zoneType];
  }
  if (tile.zoneType !== ZoneType.None) {
    return ZONE_COLORS[tile.zoneType];
  }
  return TERRAIN_COLORS[tile.terrain];
}
