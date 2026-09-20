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
  | 'pollution';

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
  if (t < 0.5) {
    const s = t * 2;
    return { r: 0.9 * s, g: 0.85 * s, b: 0, a: TRAFFIC_ALPHA * s };
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
