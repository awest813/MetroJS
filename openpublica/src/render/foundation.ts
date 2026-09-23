// Render-only layout. No Babylon — Jest can load this file.

import type { BuildingShape } from './buildingVisuals';

/** A plinth sticks out this far past the building on every side. */
export const FOUNDATION_MARGIN = 0.03;

/** The plinth is buried this deep below the lowest ground so no gap shows. */
export const FOUNDATION_SINK = 0.04;

/** Lots flatter than this drop need no plinth. */
export const FOUNDATION_MIN_DROP = 0.015;

export interface FoundationSpec {
  readonly width: number;
  readonly depth: number;
  /** World Y of the plinth top (the building's floor). */
  readonly top: number;
  /** World Y of the plinth bottom. */
  readonly bottom: number;
}

/**
 * A stone plinth under a building on a slope, from its floor down past the
 * lowest ground in its footprint, so the downhill side does not float.
 * `groundAt(dx, dz)` is the terrain height at an offset from the tile centre.
 * Returns null on a flat lot.
 */
export function foundationFor(
  shape: BuildingShape,
  floorY: number,
  groundAt: (dx: number, dz: number) => number,
): FoundationSpec | null {
  const width = shape.width + FOUNDATION_MARGIN * 2;
  const depth = shape.depth + FOUNDATION_MARGIN * 2;
  let lowest = Infinity;
  for (const fx of [-0.5, 0, 0.5]) {
    for (const fz of [-0.5, 0, 0.5]) {
      lowest = Math.min(lowest, groundAt(fx * width, fz * depth));
    }
  }
  if (!Number.isFinite(lowest) || floorY - lowest < FOUNDATION_MIN_DROP) return null;
  return { width, depth, top: floorY, bottom: lowest - FOUNDATION_SINK };
}
