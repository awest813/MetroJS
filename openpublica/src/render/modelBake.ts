// Render-only model geometry. No Babylon imports — Jest can load this file.

import type { BuildingShape } from './buildingVisuals';

/**
 * A GLB building flattened to one vertex-coloured mesh in lot space: it
 * stands on y = 0, centred on the lot, front toward +z. Colours are linear
 * RGBA, like the procedural kits' vertex colours.
 */
export interface BakedModel {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  /** Its footprint and height, for foundations on slopes. */
  readonly shape: BuildingShape;
}

/** Widest a model may stand in its lot; a larger one is shrunk to fit. */
export const LOT_FIT = 0.96;

/** Tallest a model may be (the office block is 1.16), so a mis-scaled export stays on the map. */
export const MAX_MODEL_HEIGHT = 2;

/**
 * A model whose middle is this far from its origin was authored off-centre
 * (an export with its origin at a corner, say) and is re-centred. Closer than
 * that, the origin is taken as the lot's centre, so a sign or chimney to one
 * side does not shift the building.
 */
export const RECENTRE_OFFSET = 0.1;

export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function boundsOf(positions: ArrayLike<number>): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/**
 * Move a model onto its lot in place: standing on y = 0, re-centred if it
 * was authored off-centre ({@link RECENTRE_OFFSET}), and shrunk uniformly if
 * its footprint is wider than {@link LOT_FIT} or it is taller than
 * {@link MAX_MODEL_HEIGHT}. A model authored to the conventions comes
 * through unchanged. Returns the scale applied.
 */
export function fitToLot(positions: Float32Array): number {
  const { min, max } = boundsOf(positions);
  if (!Number.isFinite(min[0])) return 1;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const width = Math.max(max[0] - min[0], max[2] - min[2]);
  const height = max[1] - min[1];
  const scale = Math.min(
    1,
    width > 0 ? LOT_FIT / width : 1,
    height > 0 ? MAX_MODEL_HEIGHT / height : 1,
  );
  const offCentre = Math.abs(cx) > RECENTRE_OFFSET || Math.abs(cz) > RECENTRE_OFFSET;
  const ox = offCentre ? cx : 0;
  const oz = offCentre ? cz : 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] = (positions[i] - ox) * scale;
    positions[i + 1] = (positions[i + 1] - min[1]) * scale;
    positions[i + 2] = (positions[i + 2] - oz) * scale;
  }
  return scale;
}

/** Footprint and height of a fitted model. */
export function shapeOf(positions: ArrayLike<number>): BuildingShape {
  const { min, max } = boundsOf(positions);
  if (!Number.isFinite(min[0])) return { width: 0, depth: 0, height: 0 };
  return { width: max[0] - min[0], depth: max[2] - min[2], height: max[1] - min[1] };
}

/**
 * The dark look of an unpowered building, as the procedural kits' warning
 * palette: every colour becomes a red of its own brightness, so the model
 * keeps its detail (roof darker than walls, windows darkest).
 */
export function warningColors(colors: Float32Array): Float32Array {
  const out = new Float32Array(colors.length);
  for (let i = 0; i + 3 < colors.length; i += 4) {
    const lum = 0.2126 * colors[i] + 0.7152 * colors[i + 1] + 0.0722 * colors[i + 2];
    const t = Math.max(0, Math.min(1, lum));
    out[i] = 0.35 + 0.5 * t;
    out[i + 1] = 0.08 + 0.27 * t;
    out[i + 2] = 0.08 + 0.22 * t;
    out[i + 3] = colors[i + 3];
  }
  return out;
}
