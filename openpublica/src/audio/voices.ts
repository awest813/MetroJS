/**
 * Original procedural voices. No sample files, no Micropolis clips.
 * Audio lives here so sim/tools stay side-effect free.
 */

export type OscShape = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type VoiceKind = 'blip' | 'noise' | 'chord';

export interface Voice {
  readonly kind: VoiceKind;
  readonly freq: number;
  readonly duration: number;
  readonly gain: number;
  readonly type?: OscShape;
  /** Extra Hz added over the envelope (park “lift”). */
  readonly slide?: number;
}

export const PAINT_GAP_MS = 80;
export const FAIL_GAP_MS = 140;
export const GROWTH_GAP_MS = 450;

export const FAIL_VOICE: Voice = {
  kind: 'blip',
  freq: 110,
  duration: 0.07,
  gain: 0.045,
  type: 'triangle',
};

export const GROWTH_VOICE: Voice = {
  kind: 'chord',
  freq: 392,
  duration: 0.16,
  gain: 0.045,
  type: 'sine',
};

export const BANKRUPT_VOICE: Voice = {
  kind: 'blip',
  freq: 98,
  duration: 0.28,
  gain: 0.07,
  type: 'sawtooth',
  slide: -40,
};

/** Inspect is silent. Unknown tools get a tiny click. */
export function sfxForTool(toolName: string): Voice | null {
  switch (toolName) {
    case 'inspect':
      return null;
    case 'road':
      return { kind: 'blip', freq: 196, duration: 0.055, gain: 0.055, type: 'triangle' };
    case 'highway':
      return { kind: 'blip', freq: 148, duration: 0.07, gain: 0.055, type: 'triangle' };
    case 'trolleyAvenue':
      return { kind: 'blip', freq: 164, duration: 0.08, gain: 0.05, type: 'square' };
    case 'zoneResidentialLow':
      return { kind: 'blip', freq: 392, duration: 0.05, gain: 0.045, type: 'sine' };
    case 'zoneCommercialLow':
      return { kind: 'blip', freq: 494, duration: 0.05, gain: 0.045, type: 'sine' };
    case 'zoneIndustrialLight':
      return { kind: 'blip', freq: 311, duration: 0.055, gain: 0.045, type: 'triangle' };
    case 'zoneMixedUse':
      return { kind: 'blip', freq: 440, duration: 0.05, gain: 0.045, type: 'sine' };
    case 'zoneClear':
      return { kind: 'blip', freq: 220, duration: 0.045, gain: 0.04, type: 'triangle' };
    case 'bulldoze':
      return { kind: 'noise', freq: 90, duration: 0.11, gain: 0.07 };
    case 'placePowerPlant':
      return { kind: 'chord', freq: 175, duration: 0.2, gain: 0.06, type: 'triangle' };
    case 'placePark':
      return { kind: 'blip', freq: 523, duration: 0.11, gain: 0.05, type: 'sine', slide: 90 };
    case 'placePoliceStation':
      return { kind: 'blip', freq: 220, duration: 0.09, gain: 0.05, type: 'square' };
    case 'placeFireStation':
      return { kind: 'blip', freq: 196, duration: 0.10, gain: 0.05, type: 'sawtooth' };
    case 'placeWaterTower':
      return { kind: 'blip', freq: 262, duration: 0.10, gain: 0.05, type: 'sine', slide: 40 };
    default:
      return { kind: 'blip', freq: 280, duration: 0.04, gain: 0.035, type: 'sine' };
  }
}
