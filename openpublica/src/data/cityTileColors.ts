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

/**
 * Ground under a grown building: yards, pavement, and work yards, so a built
 * block reads as a place. The kit itself carries the zone colour; only empty
 * zoned lots keep the zone swatch, so the lots still waiting to grow stand out.
 */
const DEVELOPED_GROUND: Record<ZoneType, TileColor> = {
  [ZoneType.None]:        { r: 0.28, g: 0.54, b: 0.24 },
  [ZoneType.Residential]: { r: 0.33, g: 0.57, b: 0.26 }, // mown lawn
  [ZoneType.Commercial]:  { r: 0.62, g: 0.60, b: 0.56 }, // pavement
  [ZoneType.Industrial]:  { r: 0.45, g: 0.42, b: 0.37 }, // gravel yard
  [ZoneType.MixedUse]:    { r: 0.66, g: 0.61, b: 0.53 }, // warm paving
};

/** Plat colour of an empty lot in this zone. */
export function zoneColor(zoneType: ZoneType): TileColor {
  return ZONE_COLORS[zoneType];
}

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
    // Strong zone colour at the edges draws the lot line; a waterfront plat
    // fades to the bank at corners that touch the water.
    const plat = _mix(ZONE_COLORS[tile.zoneType], terrainColor(tile), PLAT_EDGE_ZONE);
    const at = (cx: number, cy: number): TileColor => (_cornerTouchesWater(map, cx, cy) ? _cornerColor(map, cx, cy) : plat);
    return [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
  }
  return [
    _cornerColor(map, x, y),
    _cornerColor(map, x + 1, y),
    _cornerColor(map, x, y + 1),
    _cornerColor(map, x + 1, y + 1),
  ];
}

/** Share of the zone colour at an empty lot's edges and at its centre; the rest is the ground under it. */
const PLAT_EDGE_ZONE = 0.9;
const PLAT_CENTER_ZONE = 0.55;

function _mix(a: TileColor, b: TileColor, t: number): TileColor {
  return { r: a.r * t + b.r * (1 - t), g: a.g * t + b.g * (1 - t), b: a.b * t + b.b * (1 - t) };
}

/** Centre of an empty zoned lot: the zone colour washed over the ground, so the lot line reads at its edge. */
export function platCenterColor(tile: CityTile): TileColor {
  return _mix(ZONE_COLORS[tile.zoneType], terrainColor(tile), PLAT_CENTER_ZONE);
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

function _cornerTouchesWater(map: CityMap, cx: number, cy: number): boolean {
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    if (map.getTile(cx + dx, cy + dy)?.terrain === TerrainType.Water) return true;
  }
  return false;
}

function _cornerColor(map: CityMap, cx: number, cy: number): TileColor {
  const tiles = [
    map.getTile(cx - 1, cy - 1),
    map.getTile(cx, cy - 1),
    map.getTile(cx - 1, cy),
    map.getTile(cx, cy),
  ].filter((t): t is CityTile => t !== undefined);
  // The shore and lake bed keep natural colours: a lot's yard or zone swatch
  // stops at the bank instead of tinting the water beside it.
  const wet = tiles.some((t) => t.terrain === TerrainType.Water);
  return averageColors(tiles.map(wet ? terrainColor : cityTileColor));
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
  if (tile.buildingId === 'small_police_station' || tile.buildingId === 'police_post') {
    return POLICE_GROUND;
  }
  if (tile.buildingId === 'small_fire_station' || tile.buildingId === 'volunteer_fire_hall') {
    return FIRE_GROUND;
  }
  if (tile.buildingId === 'small_water_tower' || tile.buildingId === 'water_pump') {
    return WATER_GROUND;
  }
  if (tile.buildingId !== null && tile.zoneType !== ZoneType.None) {
    return DEVELOPED_GROUND[tile.zoneType];
  }
  if (tile.zoneType !== ZoneType.None) {
    return ZONE_COLORS[tile.zoneType];
  }
  const terrain = terrainColor(tile);
  // Darken the ground under land roads. A bridge leaves the lake bed alone.
  if (tile.roadType !== RoadType.None && tile.terrain !== TerrainType.Water) {
    return { r: terrain.r * 0.72, g: terrain.g * 0.72, b: terrain.b * 0.72 };
  }
  return terrain;
}

/** The natural ground of a tile, ignoring what is built or zoned on it. */
export function terrainColor(tile: CityTile): TileColor {
  const terrain = TERRAIN_COLORS[tile.terrain];
  if (tile.terrain !== TerrainType.Grass) return terrain;
  const n = terrainHash(tile.x, tile.y, 11);
  return {
    r: terrain.r * (0.90 + n * 0.16),
    g: terrain.g * (0.94 + n * 0.10),
    b: terrain.b * (0.88 + n * 0.14),
  };
}
