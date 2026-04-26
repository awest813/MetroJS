/** All tile types understood by the simulation. */
export enum TileType {
  Empty = 0,
  Road = 1,
  Residential = 2,
  Bulldozed = 3,
}

/** RGB colour (0-1 floats) used by the terrain renderer for each tile type. */
export interface TileColor {
  r: number;
  g: number;
  b: number;
}

/** Procedural placeholder colours — no proprietary assets. */
export const TILE_COLORS: Record<TileType, TileColor> = {
  [TileType.Empty]: { r: 0.30, g: 0.60, b: 0.22 },
  [TileType.Road]: { r: 0.42, g: 0.42, b: 0.42 },
  [TileType.Residential]: { r: 0.38, g: 0.58, b: 0.82 },
  [TileType.Bulldozed]: { r: 0.60, g: 0.44, b: 0.28 },
};
