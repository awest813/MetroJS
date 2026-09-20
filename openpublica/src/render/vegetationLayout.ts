// Render-only layout. No Babylon — Jest can load this file.

import { RoadType } from '../sim/CityTile';
import { createSeededRng } from '../math/seededNoise';

export interface TreeSlot {
  readonly dx: number;
  readonly dz: number;
  readonly scale: number;
}

/** 2–4 trees per park tile, jittered inside the tile. */
export function parkTreeSlots(x: number, y: number): TreeSlot[] {
  const rng = createSeededRng(`openpublica-park-${x}-${y}`);
  const count = 2 + Math.floor(rng() * 3);
  const slots: TreeSlot[] = [];
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 0.12 + rng() * 0.28;
    slots.push({
      dx: Math.cos(ang) * rad,
      dz: Math.sin(ang) * rad,
      scale: 1.12 + rng() * 0.55,
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
  neighborCount = 2,
): TreeSlot | null {
  if (roadType !== RoadType.Street) return null;
  if (trafficPressure >= 6) return null;
  if (neighborCount >= 3) return null;
  const rng = createSeededRng(`openpublica-street-${x}-${y}`);
  if (rng() > 0.42) return null;
  const side = rng() > 0.5 ? 1 : -1;
  const along = (rng() - 0.5) * 0.3;
  const curb = 0.42;
  const eastWest = Math.abs(Math.abs(heading) - Math.PI / 2) < 0.3;
  return {
    dx: eastWest ? along : side * curb,
    dz: eastWest ? side * curb : along,
    scale: 0.95 + rng() * 0.28,
  };
}

export const POWER_PLANT_SMOKE: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: -0.16, y: 0.78, z: 0.08 },
  { x: 0.18, y: 0.70, z: 0.08 },
];
