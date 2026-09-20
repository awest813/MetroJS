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

/** Display colour for each terrain type (used when no zone). */
const TERRAIN_COLORS: Record<TerrainType, TileColor> = {
  [TerrainType.Grass]: { r: 0.30, g: 0.60, b: 0.22 },
  [TerrainType.Water]: { r: 0.28, g: 0.34, b: 0.22 },
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
 * Priority: building > zone > terrain.
 * Roads are extruded meshes (RoadRenderer); the ground under them stays
 * a darkened terrain colour so asphalt is not painted onto the heightfield.
 */
export function cityTileColor(tile: CityTile): TileColor {
  if (tile.buildingId !== null && tile.zoneType !== ZoneType.None) {
    return BUILDING_COLORS[tile.zoneType];
  }
  if (tile.zoneType !== ZoneType.None) {
    return ZONE_COLORS[tile.zoneType];
  }
  const terrain = TERRAIN_COLORS[tile.terrain];
  if (tile.roadType !== RoadType.None) {
    return { r: terrain.r * 0.72, g: terrain.g * 0.72, b: terrain.b * 0.72 };
  }
  return terrain;
}
