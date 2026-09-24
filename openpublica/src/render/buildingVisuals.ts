// Render-only kit data. No Babylon imports — Jest can load this file.

import { ZoneType } from '../sim/CityTile';

export type KitSlot = 'body' | 'roof' | 'trim' | 'accent' | 'stack' | 'glass';
export type KitShape = 'box' | 'cylinder' | 'prism';

export interface KitPart {
  readonly shape: KitShape;
  readonly slot: KitSlot;
  /** Box / prism width (X). Cylinder uses this as diameter. */
  readonly w: number;
  /** Height (Y). Prism uses this as ridge height. */
  readonly h: number;
  /** Depth (Z). Cylinder uses this as height along Y when unrotated. */
  readonly d: number;
  /** Centre of the part, Y measured from the tile ground plane. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
}

export interface BuildingShape {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface BuildingKit {
  readonly defId: string;
  readonly shape: BuildingShape;
  /** Parks skip a building kit; VegetationRenderer plants the trees. */
  readonly skipMesh?: boolean;
  readonly parts: readonly KitPart[];
}

/**
 * Per-def silhouette used until kits land, and still the pick/bounds size.
 * Heights are the source of the skyline scale.
 */
export const BUILDING_SHAPES: Record<string, BuildingShape> = {
  small_house:          { width: 0.50, depth: 0.50, height: 0.40 },
  rowhouse:             { width: 0.70, depth: 0.45, height: 0.55 },
  small_shop:           { width: 0.65, depth: 0.65, height: 0.35 },
  shop_row:             { width: 0.80, depth: 0.60, height: 0.52 },
  office_block:         { width: 0.70, depth: 0.70, height: 1.16 },
  light_workshop:       { width: 0.75, depth: 0.75, height: 0.50 },
  factory:              { width: 0.82, depth: 0.78, height: 0.62 },
  industrial_works:     { width: 0.90, depth: 0.86, height: 0.95 },
  small_power_plant:    { width: 0.80, depth: 0.80, height: 0.60 },
  small_police_station: { width: 0.70, depth: 0.62, height: 0.55 },
  small_fire_station:   { width: 0.72, depth: 0.64, height: 0.48 },
  small_water_tower:    { width: 0.42, depth: 0.42, height: 0.85 },
  shopfront_apartments: { width: 0.75, depth: 0.55, height: 0.65 },
  corner_store_flats:   { width: 0.65, depth: 0.65, height: 0.60 },
  main_street_block:    { width: 0.85, depth: 0.60, height: 0.75 },
  small_park:           { width: 0.40, depth: 0.40, height: 0.10 },
};

export const DEFAULT_SHAPE: BuildingShape = { width: 0.50, depth: 0.50, height: 0.40 };

export const SERVICE_DEF_IDS = new Set(['small_power_plant']);
export const CIVIC_DEF_IDS = new Set(['small_police_station']);
export const FIRE_DEF_IDS = new Set(['small_fire_station']);
export const WATER_DEF_IDS = new Set(['small_water_tower']);

export const SKIP_MESH_DEF_IDS = new Set(['small_park']);

function box(
  slot: KitSlot,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rot?: { rx?: number; ry?: number; rz?: number },
): KitPart {
  return { shape: 'box', slot, w, h, d, x, y, z, ...rot };
}

function cylinder(
  slot: KitSlot,
  diameter: number,
  height: number,
  x: number,
  y: number,
  z: number,
): KitPart {
  return { shape: 'cylinder', slot, w: diameter, h: height, d: diameter, x, y, z };
}

function prism(
  slot: KitSlot,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): KitPart {
  return { shape: 'prism', slot, w, h, d, x, y, z };
}

const KITS: BuildingKit[] = [
  {
    defId: 'small_house',
    shape: BUILDING_SHAPES.small_house,
    parts: [
      box('body', 0.46, 0.24, 0.42, 0, 0.12, 0),
      prism('roof', 0.56, 0.18, 0.48, 0, 0.34, 0),
      box('accent', 0.08, 0.12, 0.03, 0, 0.08, 0.22),
      box('glass', 0.10, 0.08, 0.02, -0.14, 0.14, 0.215),
      box('glass', 0.10, 0.08, 0.02, 0.14, 0.14, 0.215),
    ],
  },
  {
    defId: 'rowhouse',
    shape: BUILDING_SHAPES.rowhouse,
    parts: [
      box('body', 0.68, 0.44, 0.42, 0, 0.22, 0),
      box('roof', 0.72, 0.08, 0.46, 0, 0.48, 0),
      box('glass', 0.58, 0.07, 0.02, 0, 0.18, 0.215),
      box('glass', 0.58, 0.07, 0.02, 0, 0.32, 0.215),
      box('trim', 0.68, 0.03, 0.03, 0, 0.25, 0.22),
      box('accent', 0.08, 0.14, 0.03, -0.22, 0.09, 0.22),
    ],
  },
  {
    defId: 'small_shop',
    shape: BUILDING_SHAPES.small_shop,
    parts: [
      box('body', 0.62, 0.26, 0.58, 0, 0.13, 0),
      box('roof', 0.64, 0.05, 0.60, 0, 0.285, 0),
      box('accent', 0.64, 0.035, 0.18, 0, 0.23, 0.28),
      box('glass', 0.48, 0.12, 0.02, 0, 0.12, 0.30),
      box('trim', 0.28, 0.06, 0.02, 0, 0.30, 0.31),
    ],
  },
  {
    defId: 'shop_row',
    shape: BUILDING_SHAPES.shop_row,
    parts: [
      box('body', 0.78, 0.22, 0.56, 0, 0.11, 0),
      box('body', 0.74, 0.24, 0.50, 0, 0.34, -0.02),
      box('accent', 0.80, 0.03, 0.16, 0, 0.21, 0.30),
      box('glass', 0.66, 0.11, 0.02, 0, 0.10, 0.29),
      box('glass', 0.62, 0.07, 0.02, 0, 0.35, 0.235),
      box('trim', 0.74, 0.03, 0.03, 0, 0.465, 0.235),
      box('roof', 0.76, 0.05, 0.52, 0, 0.485, -0.02),
    ],
  },
  {
    defId: 'office_block',
    shape: BUILDING_SHAPES.office_block,
    parts: [
      box('body', 0.68, 0.16, 0.66, 0, 0.08, 0),
      box('glass', 0.56, 0.10, 0.02, 0, 0.08, 0.335),
      box('body', 0.56, 0.86, 0.56, 0, 0.59, 0),
      box('glass', 0.58, 0.06, 0.58, 0, 0.30, 0),
      box('glass', 0.58, 0.06, 0.58, 0, 0.46, 0),
      box('glass', 0.58, 0.06, 0.58, 0, 0.62, 0),
      box('glass', 0.58, 0.06, 0.58, 0, 0.78, 0),
      box('glass', 0.58, 0.06, 0.58, 0, 0.94, 0),
      box('roof', 0.58, 0.04, 0.58, 0, 1.04, 0),
      box('trim', 0.20, 0.08, 0.16, 0.12, 1.10, -0.10),
    ],
  },
  {
    defId: 'light_workshop',
    shape: BUILDING_SHAPES.light_workshop,
    parts: [
      box('body', 0.72, 0.32, 0.68, 0, 0.16, 0),
      box('roof', 0.76, 0.06, 0.74, 0, 0.36, 0, { rx: 0.22 }),
      cylinder('stack', 0.09, 0.22, 0.22, 0.47, -0.18),
      box('trim', 0.18, 0.16, 0.03, 0, 0.10, 0.35),
    ],
  },
  {
    // A sawtooth-roofed shed with north lights and twin stacks.
    defId: 'factory',
    shape: BUILDING_SHAPES.factory,
    parts: [
      box('body', 0.80, 0.30, 0.74, 0, 0.15, 0),
      box('roof', 0.80, 0.05, 0.26, 0, 0.36, -0.24, { rx: 0.35 }),
      box('roof', 0.80, 0.05, 0.26, 0, 0.36, 0, { rx: 0.35 }),
      box('roof', 0.80, 0.05, 0.26, 0, 0.36, 0.24, { rx: 0.35 }),
      box('glass', 0.76, 0.05, 0.02, 0, 0.36, -0.12),
      box('glass', 0.76, 0.05, 0.02, 0, 0.36, 0.12),
      cylinder('stack', 0.10, 0.34, 0.28, 0.45, -0.24),
      cylinder('stack', 0.08, 0.28, 0.14, 0.42, -0.26),
      box('accent', 0.80, 0.03, 0.03, 0, 0.26, 0.375),
      box('trim', 0.22, 0.18, 0.03, -0.18, 0.09, 0.38),
    ],
  },
  {
    // A tall hall, a storage tank, a conveyor, and a tall stack: heavy industry by the highway.
    defId: 'industrial_works',
    shape: BUILDING_SHAPES.industrial_works,
    parts: [
      box('body', 0.60, 0.42, 0.84, -0.14, 0.21, 0),
      box('roof', 0.64, 0.05, 0.86, -0.14, 0.445, 0),
      box('glass', 0.56, 0.06, 0.02, -0.14, 0.32, 0.425),
      box('trim', 0.20, 0.18, 0.03, -0.24, 0.09, 0.43),
      cylinder('accent', 0.26, 0.46, 0.30, 0.23, 0.22),
      box('trim', 0.34, 0.04, 0.07, 0.16, 0.40, -0.02, { rz: -0.45 }),
      cylinder('stack', 0.12, 0.62, 0.30, 0.64, -0.24),
      cylinder('stack', 0.09, 0.40, 0.04, 0.60, -0.28),
    ],
  },
  {
    defId: 'small_power_plant',
    shape: BUILDING_SHAPES.small_power_plant,
    parts: [
      box('body', 0.74, 0.34, 0.64, 0, 0.17, 0),
      box('trim', 0.76, 0.05, 0.66, 0, 0.36, 0),
      cylinder('stack', 0.14, 0.52, -0.16, 0.52, 0.08),
      cylinder('stack', 0.14, 0.44, 0.18, 0.48, 0.08),
      box('accent', 0.74, 0.04, 0.04, 0, 0.26, 0.33),
    ],
  },
  {
    defId: 'small_police_station',
    shape: BUILDING_SHAPES.small_police_station,
    parts: [
      box('body', 0.62, 0.28, 0.54, 0, 0.14, 0),
      box('roof', 0.66, 0.06, 0.58, 0, 0.32, 0),
      box('trim', 0.22, 0.34, 0.22, -0.18, 0.40, -0.12),
      box('accent', 0.10, 0.10, 0.03, 0.08, 0.18, 0.28),
      box('glass', 0.28, 0.10, 0.02, 0.10, 0.16, 0.28),
    ],
  },
  {
    defId: 'small_fire_station',
    shape: BUILDING_SHAPES.small_fire_station,
    parts: [
      box('body', 0.66, 0.26, 0.56, 0, 0.13, 0),
      box('roof', 0.70, 0.05, 0.60, 0, 0.285, 0),
      box('accent', 0.28, 0.16, 0.04, -0.16, 0.12, 0.29),
      box('glass', 0.22, 0.12, 0.02, 0.16, 0.14, 0.29),
      cylinder('stack', 0.08, 0.18, 0.22, 0.38, -0.16),
    ],
  },
  {
    defId: 'small_water_tower',
    shape: BUILDING_SHAPES.small_water_tower,
    parts: [
      box('trim', 0.22, 0.28, 0.22, 0, 0.14, 0),
      cylinder('body', 0.36, 0.32, 0, 0.46, 0),
      box('roof', 0.38, 0.04, 0.38, 0, 0.64, 0),
      cylinder('accent', 0.08, 0.16, 0, 0.76, 0),
    ],
  },
  {
    defId: 'shopfront_apartments',
    shape: BUILDING_SHAPES.shopfront_apartments,
    parts: [
      box('body', 0.72, 0.18, 0.52, 0, 0.09, 0),
      box('body', 0.62, 0.42, 0.42, 0, 0.39, 0),
      box('accent', 0.74, 0.04, 0.16, 0, 0.19, 0.24),
      box('glass', 0.50, 0.10, 0.02, 0, 0.10, 0.27),
      box('glass', 0.50, 0.08, 0.02, 0, 0.34, 0.22),
      box('glass', 0.50, 0.08, 0.02, 0, 0.48, 0.22),
      box('roof', 0.64, 0.05, 0.44, 0, 0.625, 0),
    ],
  },
  {
    defId: 'corner_store_flats',
    shape: BUILDING_SHAPES.corner_store_flats,
    parts: [
      box('body', 0.62, 0.16, 0.62, 0, 0.08, 0),
      box('body', 0.52, 0.40, 0.52, 0, 0.36, 0),
      box('accent', 0.64, 0.035, 0.14, 0.12, 0.17, 0.28),
      box('glass', 0.28, 0.10, 0.02, -0.10, 0.09, 0.32),
      box('glass', 0.40, 0.08, 0.02, 0, 0.32, 0.27),
      box('glass', 0.40, 0.08, 0.02, 0, 0.46, 0.27),
      box('roof', 0.54, 0.05, 0.54, 0, 0.585, 0),
    ],
  },
  {
    defId: 'main_street_block',
    shape: BUILDING_SHAPES.main_street_block,
    parts: [
      box('body', 0.82, 0.20, 0.56, 0, 0.10, 0),
      box('body', 0.70, 0.48, 0.46, 0, 0.44, 0),
      box('accent', 0.84, 0.04, 0.18, 0, 0.21, 0.26),
      box('glass', 0.62, 0.10, 0.02, 0, 0.11, 0.29),
      box('glass', 0.58, 0.08, 0.02, 0, 0.36, 0.24),
      box('glass', 0.58, 0.08, 0.02, 0, 0.50, 0.24),
      box('trim', 0.70, 0.03, 0.03, 0, 0.58, 0.24),
      box('roof', 0.72, 0.06, 0.48, 0, 0.71, 0),
    ],
  },
  {
    defId: 'small_park',
    shape: BUILDING_SHAPES.small_park,
    skipMesh: true,
    parts: [],
  },
];

export const BUILDING_KITS: Record<string, BuildingKit> = Object.fromEntries(
  KITS.map((kit) => [kit.defId, kit]),
);

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type KitPalette = Record<KitSlot, Rgb>;

const ZONE_BODY: Record<ZoneType, Rgb> = {
  [ZoneType.None]:        { r: 0.60, g: 0.60, b: 0.60 },
  [ZoneType.Residential]: { r: 0.42, g: 0.62, b: 0.90 },
  [ZoneType.Commercial]:  { r: 0.92, g: 0.78, b: 0.22 },
  [ZoneType.Industrial]:  { r: 0.68, g: 0.48, b: 0.78 },
  [ZoneType.MixedUse]:    { r: 0.20, g: 0.75, b: 0.65 },
};

function shade(c: Rgb, factor: number): Rgb {
  return { r: clamp01(c.r * factor), g: clamp01(c.g * factor), b: clamp01(c.b * factor) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function kitPalette(kind: 'zone' | 'service' | 'civic' | 'fire' | 'water' | 'warning', zoneType: ZoneType): KitPalette {
  if (kind === 'warning') {
    return {
      body:   { r: 0.70, g: 0.20, b: 0.20 },
      roof:   { r: 0.45, g: 0.10, b: 0.10 },
      trim:   { r: 0.85, g: 0.35, b: 0.30 },
      accent: { r: 0.55, g: 0.12, b: 0.12 },
      stack:  { r: 0.35, g: 0.08, b: 0.08 },
      glass:  { r: 0.40, g: 0.12, b: 0.14 },
    };
  }
  if (kind === 'civic') {
    return {
      body:   { r: 0.22, g: 0.34, b: 0.52 },
      roof:   { r: 0.12, g: 0.16, b: 0.24 },
      trim:   { r: 0.72, g: 0.74, b: 0.78 },
      accent: { r: 0.85, g: 0.70, b: 0.18 },
      stack:  { r: 0.30, g: 0.32, b: 0.38 },
      glass:  { r: 0.18, g: 0.28, b: 0.40 },
    };
  }
  if (kind === 'fire') {
    return {
      body:   { r: 0.78, g: 0.18, b: 0.12 },
      roof:   { r: 0.28, g: 0.10, b: 0.08 },
      trim:   { r: 0.90, g: 0.88, b: 0.82 },
      accent: { r: 0.95, g: 0.72, b: 0.12 },
      stack:  { r: 0.22, g: 0.22, b: 0.24 },
      glass:  { r: 0.16, g: 0.20, b: 0.28 },
    };
  }
  if (kind === 'water') {
    return {
      body:   { r: 0.22, g: 0.48, b: 0.62 },
      roof:   { r: 0.14, g: 0.28, b: 0.38 },
      trim:   { r: 0.55, g: 0.55, b: 0.52 },
      accent: { r: 0.35, g: 0.70, b: 0.78 },
      stack:  { r: 0.30, g: 0.32, b: 0.34 },
      glass:  { r: 0.18, g: 0.32, b: 0.42 },
    };
  }
  if (kind === 'service') {
    return {
      body:   { r: 1.00, g: 0.55, b: 0.08 },
      roof:   { r: 0.55, g: 0.28, b: 0.06 },
      trim:   { r: 0.85, g: 0.85, b: 0.80 },
      accent: { r: 0.90, g: 0.15, b: 0.08 },
      stack:  { r: 0.30, g: 0.32, b: 0.34 },
      glass:  { r: 0.16, g: 0.18, b: 0.20 },
    };
  }
  const body = ZONE_BODY[zoneType] ?? ZONE_BODY[ZoneType.None];
  return {
    body,
    roof:   shade(body, 0.42),
    trim:   shade(body, 1.12),
    accent: { r: 0.38, g: 0.24, b: 0.14 },
    stack:  { r: 0.28, g: 0.28, b: 0.30 },
    glass:  { r: 0.10, g: 0.18, b: 0.28 },
  };
}

export function kitForDef(defId: string): BuildingKit | null {
  return BUILDING_KITS[defId] ?? null;
}
