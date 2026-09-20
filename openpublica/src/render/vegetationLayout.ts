// Render-only layout. No Babylon — Jest can load this file.

import { RoadType } from '../sim/CityTile';

export interface TreeSlot {
  readonly dx: number;
  readonly dz: number;
  readonly scale: number;
}

function hash2(x: number, y: number): number {
  let h = ((x * 73856093) ^ (y * 19349663) ^ (x * 83492791 + y)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function unit(h: number): number {
  return ((h >>> 0) % 1000) / 1000;
}

/** 2–4 trees per park tile, jittered inside the tile. */
export function parkTreeSlots(x: number, y: number): TreeSlot[] {
  const h = hash2(x, y);
  const count = 2 + (h % 3);
  const slots: TreeSlot[] = [];
  for (let i = 0; i < count; i++) {
    const hi = hash2(x + i * 17, y + i * 31);
    const ang = unit(hi) * Math.PI * 2;
    const rad = 0.12 + unit(hi >>> 3) * 0.28;
    slots.push({
      dx: Math.cos(ang) * rad,
      dz: Math.sin(ang) * rad,
      scale: 1.12 + unit(hi >>> 7) * 0.55,
    });
  }
  return slots;
}

/**
 * One curb tree on quiet streets. Highways, trolley, and busy tiles skip.
 */
export function streetTreeSlot(
  x: number,
  y: number,
  roadType: RoadType,
  trafficPressure: number,
  heading: number,
): TreeSlot | null {
  if (roadType !== RoadType.Street) return null;
  if (trafficPressure >= 6) return null;
  const h = hash2(x + 91, y + 7);
  if (unit(h) > 0.42) return null;
  const side = unit(h >>> 5) > 0.5 ? 1 : -1;
  const along = (unit(h >>> 9) - 0.5) * 0.3;
  const curb = 0.38;
  const eastWest = Math.abs(Math.abs(heading) - Math.PI / 2) < 0.3;
  return {
    dx: eastWest ? along : side * curb,
    dz: eastWest ? side * curb : along,
    scale: 0.95 + unit(h >>> 11) * 0.28,
  };
}

export const POWER_PLANT_SMOKE: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: -0.16, y: 0.78, z: 0.08 },
  { x: 0.18, y: 0.70, z: 0.08 },
];
