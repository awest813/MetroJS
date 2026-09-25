import '@babylonjs/loaders/glTF';
import {
  BaseTexture,
  LoadAssetContainerAsync,
  Vector3,
  VertexBuffer,
  type AbstractMesh,
  type Material,
  type Scene,
} from '@babylonjs/core';
import type { BuildingDef } from '../sim/BuildingDef';
import { fitToLot, shapeOf, type BakedModel } from './modelBake';

/**
 * GLB building kits (a def's `visualRef`). Each model loads once and is
 * flattened to one vertex-coloured mesh in lot space, so it draws and
 * instances exactly as a procedural kit does. Until it arrives, and for good
 * if it fails to load, the building keeps its procedural kit; `onReady`
 * tells the renderer when to swap.
 */
export class BuildingModels {
  private readonly _ready = new Map<string, BakedModel>();
  private readonly _loading = new Set<string>();
  private readonly _failed = new Set<string>();
  /** A def's model has arrived and replaces its procedural kit. */
  onReady: ((defId: string) => void) | null = null;

  /** @param _baseUrl - site root the `visualRef` paths are relative to (Vite's BASE_URL). */
  constructor(private readonly _scene: Scene, private readonly _baseUrl: string) {}

  /** The baked model for a def, or null while it loads, if it failed, or if it has none. */
  get(defId: string): BakedModel | null {
    return this._ready.get(defId) ?? null;
  }

  /** Start loading every model not yet loaded or tried. */
  load(defs: Iterable<BuildingDef>): void {
    for (const def of defs) {
      if (!def.visualRef) continue;
      if (this._ready.has(def.id) || this._loading.has(def.id) || this._failed.has(def.id)) continue;
      this._loading.add(def.id);
      void this._loadOne(def.id, this._baseUrl + def.visualRef);
    }
  }

  private async _loadOne(defId: string, url: string): Promise<void> {
    try {
      const container = await LoadAssetContainerAsync(url, this._scene);
      try {
        const baked = await bakeMeshes(container.meshes);
        if (!baked) throw new Error('the model has no triangles');
        this._ready.set(defId, baked);
      } finally {
        container.dispose();
      }
      this.onReady?.(defId);
    } catch (error) {
      this._failed.add(defId);
      console.warn(`Building model ${url} did not load, so ${defId} keeps its procedural kit.`, error);
    } finally {
      this._loading.delete(defId);
    }
  }
}

/** Pixels of a material's base-colour texture, read back once per texture. */
interface TexturePixels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBufferView;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** The base colour a material multiplies into every pixel (glTF baseColorFactor), and its texture. */
function baseColorOf(material: Material | null): { rgba: [number, number, number, number]; texture: BaseTexture | null } {
  // glTF materials load as PBR: albedoColor/alpha. Allow a standard material's diffuse too.
  const m = material as unknown as {
    albedoColor?: { r: number; g: number; b: number };
    diffuseColor?: { r: number; g: number; b: number };
    albedoTexture?: BaseTexture | null;
    diffuseTexture?: BaseTexture | null;
    alpha?: number;
  } | null;
  const c = m?.albedoColor ?? m?.diffuseColor ?? { r: 1, g: 1, b: 1 };
  return { rgba: [c.r, c.g, c.b, m?.alpha ?? 1], texture: m?.albedoTexture ?? m?.diffuseTexture ?? null };
}

async function readTexture(texture: BaseTexture, cache: Map<BaseTexture, TexturePixels | null>): Promise<TexturePixels | null> {
  if (cache.has(texture)) return cache.get(texture)!;
  let pixels: TexturePixels | null = null;
  try {
    await new Promise<void>((resolve) => BaseTexture.WhenAllReady([texture], resolve));
    const size = texture.getSize();
    const data = await texture.readPixels();
    if (data && size.width > 0 && size.height > 0) pixels = { width: size.width, height: size.height, data };
  } catch {
    pixels = null;
  }
  cache.set(texture, pixels);
  return pixels;
}

/** Linear RGB of a texture at a glTF uv (origin top left, wrapping). */
function sample(pixels: TexturePixels, u: number, v: number): [number, number, number] {
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  const x = Math.min(pixels.width - 1, Math.floor(fu * pixels.width));
  const y = Math.min(pixels.height - 1, Math.floor(fv * pixels.height));
  const i = (y * pixels.width + x) * 4;
  const d = pixels.data as unknown as ArrayLike<number>;
  // 8-bit textures read back as bytes in sRGB; float ones as linear floats.
  const bytes = pixels.data instanceof Uint8Array || pixels.data instanceof Uint8ClampedArray;
  const at = (k: number): number => (bytes ? srgbToLinear(d[i + k] / 255) : d[i + k]);
  return [at(0), at(1), at(2)];
}

/** True when a triangle's winding agrees with its normal (counter-clockwise), which Babylon culls. */
function facesNormal(positions: readonly number[], normals: readonly number[], a: number, b: number, c: number): boolean {
  const abx = positions[b * 3] - positions[a * 3];
  const aby = positions[b * 3 + 1] - positions[a * 3 + 1];
  const abz = positions[b * 3 + 2] - positions[a * 3 + 2];
  const acx = positions[c * 3] - positions[a * 3];
  const acy = positions[c * 3 + 1] - positions[a * 3 + 1];
  const acz = positions[c * 3 + 2] - positions[a * 3 + 2];
  const nx = (normals[a * 3] + normals[b * 3] + normals[c * 3]);
  const ny = (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]);
  const nz = (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
  return (aby * acz - abz * acy) * nx + (abz * acx - abx * acz) * ny + (abx * acy - aby * acx) * nz > 0;
}

/**
 * Flatten a loaded model into one vertex-coloured mesh in lot space. World
 * transforms are applied, and each triangle is wound the way Babylon draws a
 * front face (clockwise: cross(b − a, c − a) points against the normal),
 * judged by its own normal, so any exporter's handedness comes out right.
 * Each vertex takes its material's base colour, times its texture at the
 * vertex's uv and any vertex colour: palette-textured kits come through
 * exactly; a detailed texture is reduced to its colour at each vertex.
 */
export async function bakeMeshes(meshes: readonly AbstractMesh[]): Promise<BakedModel | null> {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const textures = new Map<BaseTexture, TexturePixels | null>();
  const p = new Vector3();
  const n = new Vector3();

  for (const mesh of meshes) {
    const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
    const idx = mesh.getIndices();
    if (!pos || !idx || idx.length === 0 || !mesh.isEnabled(false)) continue;
    const nrm = mesh.getVerticesData(VertexBuffer.NormalKind);
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const vcol = mesh.getVerticesData(VertexBuffer.ColorKind);
    const vcolStride = vcol ? Math.round(vcol.length / (pos.length / 3)) : 0;
    const world = mesh.computeWorldMatrix(true);
    // Normals take the inverse transpose, so a non-uniform scale still lights right.
    const normalMatrix = world.clone().invert().transpose();
    // Without normals, trust the glTF loader's handedness flip (a mirroring root).
    const flipAll = world.determinant() > 0;
    const { rgba, texture } = baseColorOf(mesh.material);
    const pixels = texture && uvs ? await readTexture(texture, textures) : null;

    const base = positions.length / 3;
    for (let v = 0; v < pos.length / 3; v++) {
      Vector3.TransformCoordinatesFromFloatsToRef(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], world, p);
      positions.push(p.x, p.y, p.z);
      if (nrm) {
        Vector3.TransformNormalFromFloatsToRef(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2], normalMatrix, n);
        n.normalize();
        normals.push(n.x, n.y, n.z);
      } else {
        normals.push(0, 1, 0);
      }
      let [r, g, b] = rgba;
      if (pixels && uvs) {
        const [tr, tg, tb] = sample(pixels, uvs[v * 2], uvs[v * 2 + 1]);
        r *= tr;
        g *= tg;
        b *= tb;
      }
      if (vcol) {
        r *= vcol[v * vcolStride];
        g *= vcol[v * vcolStride + 1];
        b *= vcol[v * vcolStride + 2];
      }
      colors.push(r, g, b, 1);
    }
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = base + idx[t];
      const b = base + idx[t + 1];
      const c = base + idx[t + 2];
      const flip = nrm ? facesNormal(positions, normals, a, b, c) : flipAll;
      if (flip) indices.push(a, c, b);
      else indices.push(a, b, c);
    }
  }
  if (indices.length === 0) return null;

  const fitted = Float32Array.from(positions);
  fitToLot(fitted);
  return {
    positions: fitted,
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    shape: shapeOf(fitted),
  };
}
