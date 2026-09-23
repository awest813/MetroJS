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
  /**
   * True when crews drive out along the roads (police, fire): coverage follows
   * the street network from the lot, so the preview paints reachable tiles
   * instead of a disc.
   */
  readonly dispatch?: boolean;
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
  dispatch: true,
  preview: { r: 0.28, g: 0.48, b: 0.95 },
};

export const FIRE_SERVICE: ServiceSpec = {
  toolName: 'placeFireStation',
  label: 'Fire',
  defId: 'small_fire_station',
  cost: FIRE_STATION_COST,
  coverage: 'fire',
  dispatch: true,
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

/** Reach of a disc or dispatch service (parks, police, fire); utilities run along streets instead. */
export function serviceRadius(def: BuildingDef | undefined): number {
  if (!def) return 0;
  return def.policeRadius
    || def.fireRadius
    || def.parkRadius
    || 0;
}

/** Supply and use of the utility network a plant or tower feeds. */
export interface NetworkInfo {
  readonly supply: number;
  readonly load: number;
  readonly served: number;
  readonly shortfall: number;
}

function formatNetwork(kind: 'power' | 'water', network: NetworkInfo | null | undefined): string {
  if (!network) return `${kind} grid: nothing connected yet`;
  const source = kind === 'power' ? 'plant' : 'tower';
  const lots = `${network.served} lot${network.served === 1 ? '' : 's'}`;
  const short = network.shortfall > 0 ? ` · ${network.shortfall} short — add a ${source} on this grid` : '';
  return `${kind} grid ${network.load}/${network.supply} load · feeds ${lots}${short}`;
}

/**
 * Short status for a service lot. Police and fire also need a street
 * (`hasRoad`) because their crews drive out along the roads; plants and
 * towers need one because power lines and water mains run along them.
 */
export function formatServiceHint(
  def: BuildingDef | undefined,
  powered: boolean,
  hasRoad = true,
  network?: NetworkInfo | null,
): string | null {
  if (!def) return null;
  if (def.powerCapacity) {
    if (!hasRoad) return 'no street — power runs along streets, so pave one beside this plant';
    return formatNetwork('power', network);
  }
  if (def.waterCapacity) {
    if (!hasRoad) return 'no street — water mains run along streets, so pave one beside this tower';
    if (!powered) return 'dark — the tower pumps once a powered street reaches it';
    return formatNetwork('water', network);
  }
  const radius = serviceRadius(def);
  if (radius <= 0) return null;
  if (def.parkRadius) return `park radius ${radius}`;
  const kind = def.policeRadius ? 'police' : 'fire';
  if (!hasRoad) return `no street — ${kind} crews can't drive out until one touches this lot`;
  if (!powered) return `dark — ${kind} coverage off until powered`;
  return `${kind} reach ${radius} road tiles`;
}

export function createServiceTools(): PlaceServiceTool[] {
  return SERVICE_SPECS.map((spec) => new PlaceServiceTool(spec));
}
