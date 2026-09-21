// Render-only overlay palettes. No Babylon — Jest can load this file.
// Inspect remains the numeric source of truth; these tints are optional.

import type { CityTile } from '../sim/CityTile';
import { RoadType } from '../sim/CityTile';

export type OverlayMode =
  | 'power'
  | 'landValue'
  | 'traffic'
  | 'walkability'
  | 'transit'
  | 'pollution'
  | 'density'
  | 'crime'
  | 'fire'
  | 'water';

export interface OverlayRgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const OVERLAY_CLEAR: OverlayRgba = { r: 0, g: 0, b: 0, a: 0 };

const POWERED: OverlayRgba = { r: 0.15, g: 0.90, b: 0.15, a: 0.35 };
const UNPOWERED: OverlayRgba = { r: 0.90, g: 0.15, b: 0.15, a: 0.40 };

const TRAFFIC_ALPHA = 0.55;
const MAX_DISPLAY_PRESSURE = 12;

const LV_ALPHA = 0.45;
const LV_R_LOW = 0.90;
const LV_G_MID = 0.78;
const LV_G_HIGH = 0.90;
const LV_R_HIGH = 0.10;

const WALK_ALPHA = 0.50;
const TRANSIT_ALPHA = 0.50;
const POLLUTION_ALPHA = 0.52;

export function colorForOverlay(mode: OverlayMode, tile: CityTile): OverlayRgba {
  switch (mode) {
    case 'power':       return colorForPower(tile.powered, tile.buildingId !== null);
    case 'landValue':   return colorForLandValue(tile.landValue);
    case 'traffic':     return colorForTraffic(tile.roadType, tile.trafficPressure);
    case 'walkability': return colorForWalkability(tile.walkability);
    case 'transit':     return colorForTransit(tile.transitAccess);
    case 'pollution':   return colorForPollution(tile.pollution);
    case 'density':     return colorForDensity(tile.populationDensity);
    case 'crime':       return colorForCrime(tile.crime);
    case 'fire':        return colorForFire(tile.fireCoverage);
    case 'water':       return colorForWater(tile.watered);
  }
}

export function colorForPower(powered: boolean, hasBuilding: boolean): OverlayRgba {
  if (powered) return POWERED;
  if (hasBuilding) return UNPOWERED;
  return OVERLAY_CLEAR;
}

export function colorForLandValue(landValue: number): OverlayRgba {
  const t = clamp01(landValue / 100);
  if (t < 0.5) {
    const s = t * 2;
    return { r: LV_R_LOW, g: s * LV_G_MID, b: 0, a: LV_ALPHA };
  }
  const s = (t - 0.5) * 2;
  return {
    r: LV_R_LOW - s * (LV_R_LOW - LV_R_HIGH),
    g: LV_G_MID + s * (LV_G_HIGH - LV_G_MID),
    b: 0,
    a: LV_ALPHA,
  };
}

export function colorForTraffic(roadType: RoadType, pressure: number): OverlayRgba {
  if (roadType === RoadType.None) return OVERLAY_CLEAR;
  const t = clamp01(pressure / MAX_DISPLAY_PRESSURE);
  if (t <= 0) {
    // Idle streets stay visible so the Traffic overlay is the road network, not a blank map.
    return { r: 0.22, g: 0.38, b: 0.55, a: 0.28 };
  }
  if (t < 0.5) {
    const s = t * 2;
    return { r: 0.9 * s, g: 0.85 * s, b: 0, a: TRAFFIC_ALPHA * (0.35 + 0.65 * s) };
  }
  const s = (t - 0.5) * 2;
  return { r: 0.9, g: 0.85 * (1 - s), b: 0, a: TRAFFIC_ALPHA };
}

export function colorForWalkability(walkability: number): OverlayRgba {
  const t = clamp01(walkability / 100);
  return {
    r: 0.10 * (1 - t),
    g: 0.60 * t + 0.25 * t * t,
    b: 0.55 * t + 0.25 * t * t,
    a: WALK_ALPHA * t,
  };
}

export function colorForTransit(transitAccess: number): OverlayRgba {
  const t = clamp01(transitAccess / 100);
  return {
    r: 0.45 + 0.20 * t,
    g: 0.10 + 0.10 * t,
    b: 0.80 + 0.20 * t,
    a: TRANSIT_ALPHA * t,
  };
}

/** Brown haze; clear at 0 so clean tiles stay readable. */
export function colorForPollution(pollution: number): OverlayRgba {
  const t = clamp01(pollution / 100);
  if (t <= 0) return OVERLAY_CLEAR;
  return {
    r: 0.42 + 0.38 * t,
    g: 0.32 - 0.18 * t,
    b: 0.08,
    a: POLLUTION_ALPHA * (0.25 + 0.75 * t),
  };
}

/** Magenta crowd; clear at 0. */
export function colorForDensity(density: number): OverlayRgba {
  const t = clamp01(density / 100);
  if (t <= 0) return OVERLAY_CLEAR;
  return {
    r: 0.55 + 0.35 * t,
    g: 0.12 + 0.08 * t,
    b: 0.62 + 0.28 * t,
    a: 0.22 + 0.38 * t,
  };
}

/** Red crime heat; clear at 0. */
export function colorForCrime(crime: number): OverlayRgba {
  const t = clamp01(crime / 100);
  if (t <= 0) return OVERLAY_CLEAR;
  return {
    r: 0.75 + 0.20 * t,
    g: 0.12 * (1 - t),
    b: 0.18 * (1 - t),
    a: 0.28 + 0.42 * t,
  };
}

/** Orange fire coverage; clear at 0 (underserved lots stay readable). */
export function colorForFire(coverage: number): OverlayRgba {
  const t = clamp01(coverage / 100);
  if (t <= 0) return OVERLAY_CLEAR;
  return {
    r: 0.95,
    g: 0.35 + 0.40 * t,
    b: 0.08,
    a: 0.22 + 0.38 * t,
  };
}

/** Cyan mains; dry tiles stay clear. */
export function colorForWater(watered: boolean): OverlayRgba {
  if (!watered) return OVERLAY_CLEAR;
  return { r: 0.20, g: 0.55, b: 0.85, a: 0.38 };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
