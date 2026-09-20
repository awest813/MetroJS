/// <reference path="./alea-shim.d.ts" />
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import Alea from 'alea';

/**
 * Seeded simplex and PRNG wrappers around MIT `simplex-noise` + `alea`.
 * No Babylon. Safe for HeightField and vegetation.
 */
export function createSeededNoise2D(seed: string | number): NoiseFunction2D {
  return createNoise2D(Alea(String(seed)));
}

export function createSeededRng(seed: string | number): () => number {
  const next = Alea(String(seed));
  return () => next();
}
