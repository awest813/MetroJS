// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from '../sim/CityMap';
import type { CityTile } from '../sim/CityTile';
import { RoadType, ZoneType, TerrainType } from '../sim/CityTile';
import { terrainHash } from '../sim/TerrainGenerator';

/** RGB colour (0–1 floats) for terrain / overlay tints. */
export interface TileColor {
  r: number;
  g: number;
  b: number;
}

/** Display color for each zone type (no road). */
const ZONE_COLORS: Record<ZoneType, TileColor> = {
  [ZoneType.None]:        { r: 0.28, g: 0.54, b: 0.24 },
  [ZoneType.Residential]: { r: 0.38, g: 0.58, b: 0.82 },
  [ZoneType.Commercial]:  { r: 0.90, g: 0.78, b: 0.22 },
  [ZoneType.Industrial]:  { r: 0.62, g: 0.42, b: 0.72 },
  [ZoneType.MixedUse]:    { r: 0.22, g: 0.72, b: 0.62 },
};

const TERRAIN_COLORS: Record<TerrainType, TileColor> = {
  [TerrainType.Grass]: { r: 0.28, g: 0.54, b: 0.24 },
  [TerrainType.Water]: { r: 0.07, g: 0.15, b: 0.16 },
  [TerrainType.Dirt]:  { r: 0.50, g: 0.45, b: 0.30 },
};

const BUILDING_COLORS: Record<ZoneType, TileColor> = {
  [ZoneType.None]:        { r: 0.28, g: 0.54, b: 0.24 },
  [ZoneType.Residential]: { r: 0.20, g: 0.35, b: 0.65 },
  [ZoneType.Commercial]:  { r: 0.70, g: 0.55, b: 0.05 },
  [ZoneType.Industrial]:  { r: 0.40, g: 0.22, b: 0.50 },
  [ZoneType.MixedUse]:    { r: 0.10, g: 0.50, b: 0.42 },
};

/** Darker lawn so tree canopies read against the ground. */
const PARK_GROUND: TileColor = { r: 0.12, g: 0.40, b: 0.16 };

export function averageColors(colors: ReadonlyArray<TileColor>): TileColor {
  if (colors.length === 0) return TERRAIN_COLORS[TerrainType.Grass];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of colors) {
    r += c.r;
    g += c.g;
    b += c.b;
  }
  const n = colors.length;
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Colours at the four corners of tile (x, y): SW, SE, NW, NE.
 * Averaging neighbouring tiles removes the spreadsheet grid on terrain.
 * Empty zoned lots keep a hard plat so R/C/I/M still read after blending.
 */
export function tileCornerColors(map: CityMap, x: number, y: number): [TileColor, TileColor, TileColor, TileColor] {
  const tile = map.getTile(x, y);
  if (tile && isEmptyZonePlat(tile)) {
    const plat = cityTileColor(tile);
    return [plat, plat, plat, plat];
  }
  return [
    _cornerColor(map, x, y),
    _cornerColor(map, x + 1, y),
    _cornerColor(map, x, y + 1),
    _cornerColor(map, x + 1, y + 1),
  ];
}

/** Empty zoned lots (no building, no road) painted as a hard-edged plat. */
export function isEmptyZonePlat(tile: CityTile): boolean {
  return (
    tile.zoneType !== ZoneType.None &&
    tile.buildingId === null &&
    tile.roadType === RoadType.None &&
    tile.terrain !== TerrainType.Water
  );
}

function _cornerColor(map: CityMap, cx: number, cy: number): TileColor {
  const tiles = [
    map.getTile(cx - 1, cy - 1),
    map.getTile(cx, cy - 1),
    map.getTile(cx - 1, cy),
    map.getTile(cx, cy),
  ].filter((t): t is CityTile => t !== undefined);
  return averageColors(tiles.map(cityTileColor));
}

/**
 * Returns the display colour for a CityTile.
 *
 * Priority: park > zoned building > zone > terrain.
 */
const POLICE_GROUND: TileColor = { r: 0.18, g: 0.26, b: 0.40 };
const FIRE_GROUND: TileColor = { r: 0.48, g: 0.18, b: 0.12 };
const WATER_GROUND: TileColor = { r: 0.16, g: 0.38, b: 0.46 };

export function cityTileColor(tile: CityTile): TileColor {
  if (tile.buildingId === 'small_park') {
    return PARK_GROUND;
  }
  if (tile.buildingId === 'small_police_station') {
    return POLICE_GROUND;
  }
  if (tile.buildingId === 'small_fire_station') {
    return FIRE_GROUND;
  }
  if (tile.buildingId === 'small_water_tower') {
    return WATER_GROUND;
  }
  if (tile.buildingId !== null && tile.zoneType !== ZoneType.None) {
    return BUILDING_COLORS[tile.zoneType];
  }
  if (tile.zoneType !== ZoneType.None) {
    return ZONE_COLORS[tile.zoneType];
  }
  let terrain = TERRAIN_COLORS[tile.terrain];
  if (tile.terrain === TerrainType.Grass) {
    const n = terrainHash(tile.x, tile.y, 11);
    terrain = {
      r: terrain.r * (0.90 + n * 0.16),
      g: terrain.g * (0.94 + n * 0.10),
      b: terrain.b * (0.88 + n * 0.14),
    };
  }
  // Darken the ground under land roads. A bridge leaves the lake bed alone.
  if (tile.roadType !== RoadType.None && tile.terrain !== TerrainType.Water) {
    return { r: terrain.r * 0.72, g: terrain.g * 0.72, b: terrain.b * 0.72 };
  }
  return terrain;
}
