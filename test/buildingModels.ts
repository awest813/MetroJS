import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import rawDefs from '../openpublica/src/data/buildings.json';
import {
  LOT_FIT,
  MAX_MODEL_HEIGHT,
  RECENTRE_OFFSET,
  boundsOf,
  fitToLot,
  shapeOf,
  warningColors,
} from '../openpublica/src/render/modelBake';

const PUBLIC = join(__dirname, '..', 'openpublica', 'public');

interface Def {
  id: string;
  visualRef?: string;
}
const defs = rawDefs as Def[];
const modelled = defs.filter((d) => d.visualRef);

/** The JSON chunk of a GLB, and the POSITION extents of its primitives. */
function readGlb(path: string): {
  json: {
    asset: { version: string };
    meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number }> }>;
    accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
  };
  triangles: number;
  min: number[];
  max: number[];
} {
  const bytes = readFileSync(path);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const pos = json.accessors[prim.attributes.POSITION];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos.min[a]);
        max[a] = Math.max(max[a], pos.max[a]);
      }
      triangles += (prim.indices !== undefined ? json.accessors[prim.indices].count : pos.count) / 3;
    }
  }
  return { json, triangles, min, max };
}

describe('GLB building kits', () => {
  it('should point each model at a file under public/models', () => {
    expect(modelled.length).toBeGreaterThan(0);
    for (const def of modelled) {
      expect(def.visualRef).toBe(`models/${def.id}.glb`);
      expect(existsSync(join(PUBLIC, def.visualRef!))).toBe(true);
    }
  });

  it('should ship models that follow the conventions: on the ground, inside the lot, lit, and light', () => {
    for (const def of modelled) {
      const { json, triangles, min, max } = readGlb(join(PUBLIC, def.visualRef!));
      expect(json.asset.version).toBe('2.0');
      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives) expect(prim.attributes.NORMAL).toBeDefined();
      }
      expect(min[1]).toBeCloseTo(0, 6);
      expect(max[1]).toBeLessThanOrEqual(MAX_MODEL_HEIGHT);
      for (const axis of [0, 2]) {
        expect(max[axis]).toBeLessThanOrEqual(LOT_FIT / 2);
        expect(min[axis]).toBeGreaterThanOrEqual(-LOT_FIT / 2);
        // Authored about the lot's centre, so the loader leaves it where it is.
        expect(Math.abs((min[axis] + max[axis]) / 2)).toBeLessThan(RECENTRE_OFFSET);
      }
      // A building is drawn hundreds of times; keep each under the rowhouse's budget.
      expect(triangles).toBeLessThanOrEqual(400);
    }
  });

  it('should build every referenced model from the generator, and no others', () => {
    const script = readFileSync(join(__dirname, '..', 'openpublica', 'scripts', 'build-models.mjs'), 'utf8');
    const block = script.slice(script.indexOf('const MODELS = {'), script.indexOf('};', script.indexOf('const MODELS = {')));
    const built = [...block.matchAll(/^\s+(\w+)(?::|,)/gm)].map((m) => m[1]).sort();
    expect(built).toEqual(modelled.map((d) => d.id).sort());
  });
});

describe('modelBake', () => {
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Float32Array =>
    Float32Array.from([x0, y0, z0, x1, y1, z1, x0, y1, z1, x1, y0, z0]);

  it('should leave a model authored to the conventions where it is', () => {
    const p = box(-0.3, 0.2, 0, 0.4, -0.25, 0.25);
    const before = Array.from(p);
    expect(fitToLot(p)).toBe(1);
    expect(Array.from(p)).toEqual(before);
  });

  it('should stand a model on the ground and re-centre one authored off its origin', () => {
    const p = box(0, 0.5, -0.2, 0.3, 0, 0.4);
    fitToLot(p);
    const { min, max } = boundsOf(p);
    expect(min[1]).toBeCloseTo(0);
    expect(max[1]).toBeCloseTo(0.5);
    expect((min[0] + max[0]) / 2).toBeCloseTo(0);
    expect((min[2] + max[2]) / 2).toBeCloseTo(0);
  });

  it('should shrink a model too wide for its lot or too tall for the map', () => {
    const wide = box(-1, 1, 0, 0.5, -0.5, 0.5);
    expect(fitToLot(wide)).toBeCloseTo(LOT_FIT / 2);
    expect(shapeOf(wide).width).toBeCloseTo(LOT_FIT);
    const tall = box(-0.2, 0.2, 0, 5, -0.2, 0.2);
    fitToLot(tall);
    expect(shapeOf(tall).height).toBeCloseTo(MAX_MODEL_HEIGHT);
  });

  it('should darken a model to reds of its own brightness when unpowered', () => {
    const lit = Float32Array.from([1, 1, 1, 1, 0.1, 0.1, 0.1, 1]);
    const dark = warningColors(lit);
    expect(dark[0]).toBeGreaterThan(dark[1]);
    expect(dark[0]).toBeGreaterThan(dark[4]);
    expect(dark[3]).toBe(1);
    expect(dark[7]).toBe(1);
  });
});
