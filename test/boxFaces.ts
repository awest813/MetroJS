import { NO_BOTTOM, TOP_ONLY, faceOf, keepBoxFaces, type BoxVertexData } from '../openpublica/src/render/boxFaces';

/** A unit box laid out like Babylon's: four vertices and two triangles per face. */
function unitBox(): BoxVertexData {
  const faces: Array<[number, number, number]> = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  const data: BoxVertexData = { positions: [], normals: [], uvs: [], indices: [] };
  faces.forEach(([nx, ny, nz], f) => {
    // Two axes across the face.
    const [ux, uy, uz] = ny !== 0 ? [1, 0, 0] : [0, 1, 0];
    const [vx, vy, vz] = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      data.positions.push(
        nx / 2 + (a * ux + b * vx) / 2,
        ny / 2 + (a * uy + b * vy) / 2,
        nz / 2 + (a * uz + b * vz) / 2,
      );
      data.normals.push(nx, ny, nz);
      data.uvs!.push((a + 1) / 2, (b + 1) / 2);
    }
    const base = f * 4;
    data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return data;
}

describe('box faces', () => {
  it('should name faces by their normal', () => {
    expect(faceOf(1)).toBe('top');
    expect(faceOf(-1)).toBe('bottom');
    expect(faceOf(0)).toBe('sides');
  });

  it('should keep only the top of paint: two triangles on four vertices', () => {
    const top = keepBoxFaces(unitBox(), TOP_ONLY);
    expect(top.indices).toHaveLength(6);
    expect(top.positions).toHaveLength(4 * 3);
    expect(top.uvs).toHaveLength(4 * 2);
    for (let v = 0; v < 4; v++) {
      expect(top.normals[v * 3 + 1]).toBe(1);
      expect(top.positions[v * 3 + 1]).toBe(0.5);
    }
    expect(Math.max(...top.indices)).toBe(3);
  });

  it('should drop only the underside, keeping winding and vertex order', () => {
    const box = unitBox();
    const kept = keepBoxFaces(box, NO_BOTTOM);
    expect(kept.indices).toHaveLength(30);
    expect(kept.positions).toHaveLength(20 * 3);
    for (let v = 0; v < 20; v++) expect(kept.normals[v * 3 + 1]).toBeGreaterThan(-0.5);
    // The bottom face came last, so the rest keep their numbers and order.
    expect(kept.indices).toEqual(box.indices.slice(0, 30));
    expect(kept.positions).toEqual(box.positions.slice(0, 60));
  });

  it('should leave out uvs when the box has none', () => {
    const { uvs: _uvs, ...bare } = unitBox();
    expect(keepBoxFaces(bare, TOP_ONLY).uvs).toBeUndefined();
  });
});
