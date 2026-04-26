/** Map dimensions — must stay 64×64 for Phase 1 compatibility. */
export const MAP_SIZE = 64 as const;

/** Simulated seconds that equal one in-game month (shared by clock and growth system). */
export const MONTH_SECONDS = 30 as const;

/** World-space side length of a single tile. */
export const TILE_SIZE = 1 as const;

/** Fraction of TILE_SIZE that each tile's mesh occupies (leaves a thin gap). */
export const TILE_FILL = 0.98 as const;
