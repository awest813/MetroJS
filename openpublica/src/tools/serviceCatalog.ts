// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { BuildingDef } from '../sim/BuildingDef';
import { PlaceServiceTool } from './PlaceServiceTool';

export type ServiceCoverage = 'power' | 'police' | 'fire' | 'water' | 'park';

export interface ServiceSpec {
  readonly toolName: string;
  readonly label: string;
  readonly defId: string;
  readonly cost: number;
  readonly coverage: ServiceCoverage;
  /** Preview disc RGB. */
  readonly preview: { readonly r: number; readonly g: number; readonly b: number };
}

export const POWER_PLANT_COST = 500;
export const PARK_COST = 200;
export const POLICE_STATION_COST = 400;
export const FIRE_STATION_COST = 400;
export const WATER_TOWER_COST = 350;

export const POWER_PLANT_SERVICE: ServiceSpec = {
  toolName: 'placePowerPlant',
  label: '⚡ Power Plant',
  defId: 'small_power_plant',
  cost: POWER_PLANT_COST,
  coverage: 'power',
  preview: { r: 0.95, g: 0.82, b: 0.2 },
};

export const PARK_SERVICE: ServiceSpec = {
  toolName: 'placePark',
  label: '🌳 Park',
  defId: 'small_park',
  cost: PARK_COST,
  coverage: 'park',
  preview: { r: 0.28, g: 0.72, b: 0.32 },
};

export const POLICE_SERVICE: ServiceSpec = {
  toolName: 'placePoliceStation',
  label: 'Police',
  defId: 'small_police_station',
  cost: POLICE_STATION_COST,
  coverage: 'police',
  preview: { r: 0.28, g: 0.48, b: 0.95 },
};

export const FIRE_SERVICE: ServiceSpec = {
  toolName: 'placeFireStation',
  label: 'Fire',
  defId: 'small_fire_station',
  cost: FIRE_STATION_COST,
  coverage: 'fire',
  preview: { r: 0.95, g: 0.32, b: 0.16 },
};

export const WATER_SERVICE: ServiceSpec = {
  toolName: 'placeWaterTower',
  label: 'Water',
  defId: 'small_water_tower',
  cost: WATER_TOWER_COST,
  coverage: 'water',
  preview: { r: 0.22, g: 0.68, b: 0.9 },
};

export const SERVICE_SPECS: ReadonlyArray<ServiceSpec> = [
  POWER_PLANT_SERVICE,
  PARK_SERVICE,
  POLICE_SERVICE,
  FIRE_SERVICE,
  WATER_SERVICE,
];

const BY_TOOL = new Map(SERVICE_SPECS.map((spec) => [spec.toolName, spec]));
const BY_DEF = new Map(SERVICE_SPECS.map((spec) => [spec.defId, spec]));

export function serviceSpecForTool(toolName: string): ServiceSpec | undefined {
  return BY_TOOL.get(toolName);
}

export function serviceSpecForDef(defId: string): ServiceSpec | undefined {
  return BY_DEF.get(defId);
}

export function serviceRadius(def: BuildingDef | undefined): number {
  if (!def) return 0;
  return def.powerRadius
    || def.policeRadius
    || def.fireRadius
    || def.waterRadius
    || def.parkRadius
    || 0;
}

export function formatServiceHint(def: BuildingDef | undefined, powered: boolean): string | null {
  const radius = serviceRadius(def);
  if (!def || radius <= 0) return null;
  if (def.powerRadius) return `power radius ${radius}`;
  if (def.parkRadius) return `park radius ${radius}`;
  const kind = def.policeRadius ? 'police' : def.fireRadius ? 'fire' : 'water';
  if (!powered) return `dark — ${kind} coverage off until powered`;
  return `${kind} radius ${radius}`;
}

export function createServiceTools(): PlaceServiceTool[] {
  return SERVICE_SPECS.map((spec) => new PlaceServiceTool(spec));
}
