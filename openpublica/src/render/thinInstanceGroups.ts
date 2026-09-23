import { Matrix, Quaternion, Vector3, type Mesh } from '@babylonjs/core';

/**
 * Thin instances over shared source meshes, grouped by a key (a tile).
 * Replacing a group marks only its sources dirty; `flush` rewrites those
 * sources' matrix buffers once. Thousands of pieces then cost one scene mesh
 * per source instead of one node each to cull and update every frame.
 */
export class ThinInstanceGroups {
  private readonly _groups = new Map<string, Map<Mesh, number[]>>();
  private readonly _dirty = new Set<Mesh>();

  /** Set up a source: hidden until a flush gives it pieces, and never culled. */
  static prepare(src: Mesh): void {
    src.isVisible = false;
    // The pieces span the whole city; skip per-frame culling of the combined bounds.
    src.alwaysSelectAsActiveMesh = true;
  }

  /** Drop a group's pieces. */
  clear(key: string): void {
    const group = this._groups.get(key);
    if (!group) return;
    for (const src of group.keys()) this._dirty.add(src);
    this._groups.delete(key);
  }

  clearAll(): void {
    for (const key of Array.from(this._groups.keys())) this.clear(key);
  }

  /** Add a piece with the transform an instance with this position, scale, and rotation would get. */
  add(key: string, src: Mesh, position: Vector3, scaling: Vector3, rotation: Vector3 = Vector3.ZeroReadOnly): void {
    const rotationQ = Quaternion.RotationYawPitchRoll(rotation.y, rotation.x, rotation.z);
    const matrix = Matrix.Compose(scaling, rotationQ, position);
    let group = this._groups.get(key);
    if (!group) {
      group = new Map();
      this._groups.set(key, group);
    }
    let list = group.get(src);
    if (!list) {
      list = [];
      group.set(src, list);
    }
    for (const v of matrix.m) list.push(v);
    this._dirty.add(src);
  }

  /** Rewrite the buffer of each source whose groups changed. */
  flush(): void {
    for (const src of this._dirty) {
      let floats = 0;
      for (const group of this._groups.values()) floats += group.get(src)?.length ?? 0;
      if (floats === 0) {
        src.thinInstanceCount = 0;
        src.isVisible = false;
        continue;
      }
      const buffer = new Float32Array(floats);
      let at = 0;
      for (const group of this._groups.values()) {
        const list = group.get(src);
        if (!list) continue;
        buffer.set(list, at);
        at += list.length;
      }
      src.thinInstanceSetBuffer('matrix', buffer, 16, false);
      src.isVisible = true;
    }
    this._dirty.clear();
  }
}
