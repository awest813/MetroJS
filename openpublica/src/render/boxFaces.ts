/**
 * Trim faces off a box's vertex data. Thin-instanced road pieces are boxes by
 * the thousand, and most of their faces never show: lane paint is only ever
 * seen from above, and no piece is seen from below (the camera stays above
 * the ground). Dropping those faces cuts the triangles every piece costs.
 */

/** A box face, by the way it faces. */
export type BoxFace = 'top' | 'bottom' | 'sides';

/** A box without its underside. */
export const NO_BOTTOM: readonly BoxFace[] = ['top', 'sides'];

/** Only the top: paint and other pieces too thin to show their sides. */
export const TOP_ONLY: readonly BoxFace[] = ['top'];

export interface BoxVertexData {
  positions: number[];
  normals: number[];
  uvs?: number[];
  indices: number[];
}

/** Which face a vertex normal's Y component belongs to. */
export function faceOf(ny: number): BoxFace {
  if (ny > 0.5) return 'top';
  if (ny < -0.5) return 'bottom';
  return 'sides';
}

/**
 * Keep the triangles of the listed faces, and only the vertices they use
 * (in their original order), so a dropped face costs nothing to draw.
 */
export function keepBoxFaces(data: BoxVertexData, faces: readonly BoxFace[]): BoxVertexData {
  const keep = new Set(faces);
  const kept: number[] = [];
  for (let t = 0; t + 2 < data.indices.length; t += 3) {
    if (keep.has(faceOf(data.normals[data.indices[t] * 3 + 1]))) {
      kept.push(data.indices[t], data.indices[t + 1], data.indices[t + 2]);
    }
  }
  const used = [...new Set(kept)].sort((a, b) => a - b);
  const renumber = new Map(used.map((v, i) => [v, i]));
  const pick = (source: readonly number[], size: number): number[] =>
    used.flatMap((v) => source.slice(v * size, v * size + size));
  return {
    positions: pick(data.positions, 3),
    normals: pick(data.normals, 3),
    ...(data.uvs ? { uvs: pick(data.uvs, 2) } : {}),
    indices: kept.map((v) => renumber.get(v)!),
  };
}
