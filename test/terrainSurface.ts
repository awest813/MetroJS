import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType } from '../openpublica/src/sim/CityTile';
import { generateTerrain } from '../openpublica/src/sim/TerrainGenerator';
import {
  FAN_TRIANGLES,
  FAN_VERTS,
  HeightField,
  WATER_SURFACE_Y,
  fanHeight,
  writeFanIndices,
  writeTileFan,
} from '../openpublica/src/sim/HeightField';
import { deckBaseHeight, landRoadBed } from '../openpublica/src/render/roadDeck';
import { FOUNDATION_SINK, foundationFor } from '../openpublica/src/render/foundation';
import { SKIRT_BASE_Y, skirtSegments } from '../openpublica/src/render/terrainSkirt';

function hilly(seed = 2026, size = 32): { map: CityMap; heights: HeightField } {
  const map = new CityMap(size, size);
  generateTerrain(map, seed);
  return { map, heights: HeightField.fromMap(map, seed) };
}

/** Height on the triangle (a, b, c) at (x, z), independent of fanHeight. */
function onTriangle(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  x: number,
  z: number,
): number {
  const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
  const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det;
  const v = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
  return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
}

describe('tile fan surface', () => {
  it('should hit every corner and put the centre at the corners average', () => {
    const [h00, h10, h01, h11] = [0.2, 0.5, 0.3, 0.9];
    expect(fanHeight(h00, h10, h01, h11, 0, 0)).toBeCloseTo(h00);
    expect(fanHeight(h00, h10, h01, h11, 1, 0)).toBeCloseTo(h10);
    expect(fanHeight(h00, h10, h01, h11, 0, 1)).toBeCloseTo(h01);
    expect(fanHeight(h00, h10, h01, h11, 1, 1)).toBeCloseTo(h11);
    expect(fanHeight(h00, h10, h01, h11, 0.5, 0.5)).toBeCloseTo((h00 + h10 + h01 + h11) / 4);
  });

  it('should lie on the same four triangles the mesh draws', () => {
    const [h00, h10, h01, h11] = [0.2, 0.5, 0.3, 0.9];
    const c: [number, number, number] = [0.5, (h00 + h10 + h01 + h11) / 4, 0.5];
    const v00: [number, number, number] = [0, h00, 0];
    const v10: [number, number, number] = [1, h10, 0];
    const v01: [number, number, number] = [0, h01, 1];
    const v11: [number, number, number] = [1, h11, 1];
    const cases: Array<[number, number, [number, number, number], [number, number, number]]> = [
      [0.5, 0.1, v00, v10], // south
      [0.9, 0.5, v10, v11], // east
      [0.5, 0.9, v11, v01], // north
      [0.1, 0.5, v01, v00], // west
      [0.3, 0.2, v00, v10],
      [0.8, 0.65, v10, v11],
    ];
    for (const [fx, fz, a, b] of cases) {
      expect(fanHeight(h00, h10, h01, h11, fx, fz)).toBeCloseTo(onTriangle(a, b, c, fx, fz));
    }
  });

  it('should reproduce a planar tile exactly', () => {
    const plane = (x: number, z: number): number => 0.3 + 0.2 * x - 0.1 * z;
    for (const [fx, fz] of [[0.1, 0.2], [0.7, 0.4], [0.5, 0.95], [0.33, 0.66]]) {
      expect(fanHeight(plane(0, 0), plane(1, 0), plane(0, 1), plane(1, 1), fx, fz)).toBeCloseTo(plane(fx, fz));
    }
  });

  it('should have the height field sample what the fan writer draws', () => {
    const { heights } = hilly();
    const positions = new Float32Array(FAN_VERTS * 3);
    writeTileFan(positions, 0, 7, 9, 1, heights, 0);
    expect(positions[4 * 3 + 1]).toBeCloseTo(heights.tileCenter(7, 9));
    expect(positions[1]).toBeCloseTo(heights.corner(7, 9));
    const indices = new Uint32Array(FAN_TRIANGLES * 3);
    writeFanIndices(indices, 0, 0);
    // Every triangle uses the centre vertex (index 4).
    for (let t = 0; t < FAN_TRIANGLES; t++) expect(indices.slice(t * 3, t * 3 + 3)).toContain(4);
  });

  it('should be continuous across tile edges', () => {
    const { heights } = hilly();
    for (const z of [3.2, 3.5, 3.9]) {
      expect(heights.sample(5 - 1e-9, z)).toBeCloseTo(heights.sample(5 + 1e-9, z), 6);
    }
  });

  it('should give unit, upward normals at corners and centres', () => {
    const map = new CityMap(4, 4);
    const flat = HeightField.fromMap(map, 1);
    const n = flat.cornerNormal(2, 2);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1);
    expect(n[1]).toBeGreaterThan(0);
    const c = flat.centerNormal(1, 1);
    expect(c[1]).toBeGreaterThan(0);
  });
});

describe('road grading', () => {
  it('should level the corners of a land road to the road around them', () => {
    const { map, heights } = hilly();
    let spot: { x: number; y: number } | null = null;
    map.forEach((t) => {
      if (spot || t.terrain === TerrainType.Water || t.x < 2 || t.y < 2 || t.x > 29 || t.y > 29) return;
      const wetNear = [-1, 0, 1, 2].some((dy) => [-1, 0, 1, 2].some((dx) => map.getTile(t.x + dx, t.y + dy)?.terrain === TerrainType.Water));
      if (!wetNear) spot = { x: t.x, y: t.y };
    });
    const { x, y } = spot!;
    const naturalCenter = heights.tileCenter(x, y);
    map.getTile(x, y)!.roadType = RoadType.Street;
    const moved = heights.regrade(map, x, y, x, y);
    expect(moved.length).toBe(9);
    // A lone road tile: all four corners sit at its natural centre.
    for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
      expect(heights.corner(cx, cy)).toBeCloseTo(naturalCenter);
    }
    expect(heights.tileCenter(x, y)).toBeCloseTo(naturalCenter);

    // Bulldozing hands the corners back to the hills.
    map.getTile(x, y)!.roadType = RoadType.None;
    heights.regrade(map, x, y, x, y);
    expect(heights.corner(x, y)).toBeCloseTo(heights.naturalCorner(x, y));
  });

  it('should average corners shared by two road tiles', () => {
    const map = new CityMap(8, 8);
    map.getTile(3, 3)!.roadType = RoadType.Street;
    map.getTile(4, 3)!.roadType = RoadType.Street;
    const heights = HeightField.fromMap(map, 5);
    const natural = (tx: number, ty: number): number =>
      (heights.naturalCorner(tx, ty) + heights.naturalCorner(tx + 1, ty) +
        heights.naturalCorner(tx, ty + 1) + heights.naturalCorner(tx + 1, ty + 1)) / 4;
    expect(heights.corner(4, 3)).toBeCloseTo((natural(3, 3) + natural(4, 3)) / 2);
    expect(heights.corner(3, 3)).toBeCloseTo(natural(3, 3));
  });

  it('should never grade a shoreline corner', () => {
    const map = new CityMap(8, 8);
    for (let x = 0; x < 8; x++) map.getTile(x, 5)!.terrain = TerrainType.Water;
    map.getTile(3, 4)!.roadType = RoadType.Street;
    const heights = HeightField.fromMap(map, 5);
    expect(heights.corner(3, 5)).toBeCloseTo(heights.naturalCorner(3, 5));
    expect(heights.corner(3, 5)).toBeLessThan(WATER_SURFACE_Y);
    // The dry side is graded, and the shore road rides it, not the waterline.
    expect(heights.dryCenter(3, 4)).toBeGreaterThan(heights.tileCenter(3, 4));
    expect(deckBaseHeight(map, heights, 3, 4)).toBeCloseTo(heights.dryCenter(3, 4));
  });

  it('should fall back to the tile centre for grounds that know no dry centre', () => {
    const ground = { tileCenter: () => 0.4 };
    expect(landRoadBed(ground, 0, 0)).toBe(0.4);
  });
});

describe('foundations', () => {
  const shape = { width: 0.6, depth: 0.6, height: 0.5 };

  it('should skip a plinth on a flat lot', () => {
    expect(foundationFor(shape, 0.4, () => 0.4)).toBeNull();
  });

  it('should reach past the lowest ground on a slope', () => {
    const ground = (dx: number): number => 0.4 + 0.3 * dx;
    const spec = foundationFor(shape, 0.4, ground)!;
    const lowest = ground(-0.33);
    expect(spec.top).toBe(0.4);
    expect(spec.bottom).toBeCloseTo(lowest - FOUNDATION_SINK);
    expect(spec.width).toBeGreaterThan(shape.width);
  });
});

describe('map edge skirt', () => {
  it('should wall all four edges down to the base', () => {
    const { map, heights } = hilly(2026, 16);
    const segs = skirtSegments(map, heights);
    expect(segs).toHaveLength(16 * 4);
    for (const seg of segs) {
      expect(Math.min(seg.top0, seg.top1)).toBeGreaterThan(SKIRT_BASE_Y);
      expect(Math.hypot(seg.nx, seg.nz)).toBeCloseTo(1);
    }
  });

  it('should cut through a lake at the water surface', () => {
    const map = new CityMap(6, 6);
    for (let y = 0; y < 6; y++) map.getTile(5, y)!.terrain = TerrainType.Water;
    const heights = HeightField.fromMap(map, 3);
    const east = skirtSegments(map, heights).filter((s) => s.nx === 1);
    expect(east.every((s) => s.water)).toBe(true);
    expect(east.every((s) => s.top0 >= WATER_SURFACE_Y && s.top1 >= WATER_SURFACE_Y)).toBe(true);
  });
});
