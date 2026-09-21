// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType, TerrainType } from './CityTile';
import type { CityTile } from './CityTile';

/**
 * Opening residential demand. The monthly loop otherwise decays R-demand when
 * jobs ≤ population, so a new city that only paints houses would never grow.
 */
export const STARTER_RESIDENTIAL_DEMAND = 40;

/**
 * Share of population and jobs counted while a building has no power.
 * Census and the density overlay both use this so Pop and Crowd match.
 */
export const UNPOWERED_FACTOR = 0.75;

/** Land value and demand required before a zone steps up from its smallest building. */
export const DENSE_LAND_VALUE = 45;
export const DENSE_DEMAND = 35;

/** Land value and demand required for the largest building in a three-step zone. */
export const TALL_LAND_VALUE = 70;
export const TALL_DEMAND = 60;

/** Consecutive stressed months before a zone building downgrades or leaves. */
export const STRESS_MONTHS_TO_CHANGE = 4;

/**
 * Monthly growth multiplier for a lot that already has power.
 * Callers pass this only when the lot also touches a road. Unpowered lots stay
 * on the base chance so a dark block still fills slowly.
 */
export const POWERED_ROAD_GROWTH_BOOST = 2.5;

/** Empty months after abandon before the lot may grow again. */
export const ABANDON_COOLDOWN_MONTHS = 2;

/** Tile pollution at or above this stresses a zone building. */
export const POLLUTION_STRESS_THRESHOLD = 60;

/** Tile crime at or above this stresses a zone building. */
export const CRIME_STRESS_THRESHOLD = 50;

export function tileHasAdjacentRoad(map: CityMap, x: number, y: number): boolean {
  const neighbours = [
    map.getTile(x, y - 1),
    map.getTile(x, y + 1),
    map.getTile(x - 1, y),
    map.getTile(x + 1, y),
  ];
  return neighbours.some((t) => t !== undefined && t.roadType !== RoadType.None);
}

export interface GrowthDef {
  readonly id: string;
  readonly population: number;
  readonly jobs: number;
  readonly isService?: boolean;
}

export function buildingSize(def: GrowthDef): number {
  return def.population + def.jobs;
}

/** 0 = smallest building, 1 = mid, 2 = largest. Both value and demand must clear the bar. */
export function developmentTier(landValue: number, demand: number): number {
  if (landValue >= TALL_LAND_VALUE && demand >= TALL_DEMAND) return 2;
  if (landValue >= DENSE_LAND_VALUE && demand >= DENSE_DEMAND) return 1;
  return 0;
}

export function rankedZoneDefs<T extends GrowthDef>(defs: readonly T[]): T[] {
  return defs
    .filter((def) => !def.isService)
    .slice()
    .sort((a, b) => buildingSize(a) - buildingSize(b) || a.id.localeCompare(b.id));
}

/** Largest def this lot can support. Low value or weak demand stays on the smallest building. */
export function targetBuildingDef<T extends GrowthDef>(
  defs: readonly T[],
  landValue: number,
  demand: number,
): T | undefined {
  const ranked = rankedZoneDefs(defs);
  if (ranked.length === 0) return undefined;
  const tier = Math.min(developmentTier(landValue, demand), ranked.length - 1);
  return ranked[tier];
}

/**
 * One step toward the target size. Empty lots use {@link targetBuildingDef} directly;
 * an existing building densifies one step per successful month.
 */
export function nextDevelopmentDef<T extends GrowthDef>(
  defs: readonly T[],
  current: T,
  landValue: number,
  demand: number,
): T | undefined {
  const target = targetBuildingDef(defs, landValue, demand);
  if (!target || buildingSize(target) <= buildingSize(current)) return undefined;
  const ranked = rankedZoneDefs(defs);
  const index = ranked.findIndex((def) => def.id === current.id);
  if (index < 0) return undefined;
  return ranked[index + 1];
}

/**
 * Monthly chance an eligible lot develops. Demand scales the roll so a full
 * bar fills faster than a trickle, without making low demand impossible.
 */
export function growthChance(
  landValue: number,
  demand: number,
  mixedBoost = 1,
  poweredBoost = 1,
): number {
  const lvFactor = 0.5 + Math.max(0, landValue) / 100;
  const demandFactor = 0.45 + 0.55 * (Math.max(0, Math.min(100, demand)) / 100);
  const power = Math.max(1, poweredBoost);
  return Math.min(0.9, 0.32 * lvFactor * demandFactor * mixedBoost * power);
}

export function demandForZone(zoneType: ZoneType, stats: CityStats): number {
  switch (zoneType) {
    case ZoneType.Residential: return stats.residentialDemand;
    case ZoneType.Commercial:  return stats.commercialDemand;
    case ZoneType.Industrial:  return stats.industrialDemand;
    case ZoneType.MixedUse:
      return Math.min(stats.residentialDemand, stats.commercialDemand);
    default:
      return 0;
  }
}

/** Why this lot is empty, or null if it already has a building / nothing to say. */
export function formatGrowthHint(
  tile: CityTile,
  map: CityMap,
  stats: CityStats,
): string | null {
  if (tile.terrain === TerrainType.Water) return null;
  if (tile.buildingId !== null) {
    if (tile.buildingId === 'small_park') return null;
    if (tile.neglectMonths >= 2) {
      return 'struggling — restore power, demand, or road access';
    }
    if (!tile.powered) return 'unpowered — place a power plant nearby';
    return null;
  }
  if (tile.zoneType === ZoneType.None) return null;

  if (tile.roadType !== RoadType.None) {
    return 'buildings grow on lots beside the street, not on the road';
  }
  if (!tileHasAdjacentRoad(map, tile.x, tile.y)) {
    return 'needs a road next door';
  }

  const demand = demandForZone(tile.zoneType, stats);
  if (demand <= 0) {
    if (tile.zoneType === ZoneType.Residential) {
      return 'no housing demand — add jobs or cut residential tax';
    }
    if (tile.zoneType === ZoneType.Commercial) {
      return 'no shop demand — grow population or add transit';
    }
    if (tile.zoneType === ZoneType.MixedUse) {
      return 'mixed-use needs both housing and shop demand';
    }
    return 'no industrial demand — cut industrial tax';
  }

  if (!tile.powered) {
    return 'waiting to grow (will run underpowered until a plant covers it)';
  }
  return 'waiting to grow';
}

/**
 * True when a zone-grown building should gain a neglect month.
 * Services are filtered by the caller. Crime is typically last month's value.
 */
export function zoneBuildingIsStressed(tile: CityTile, map: CityMap, stats: CityStats): boolean {
  if (tile.zoneType === ZoneType.None) return true;
  if (!tileHasAdjacentRoad(map, tile.x, tile.y)) return true;
  if (demandForZone(tile.zoneType, stats) <= 0) return true;
  if (!tile.powered) return true;
  if (tile.pollution >= POLLUTION_STRESS_THRESHOLD) return true;
  if (tile.crime >= CRIME_STRESS_THRESHOLD) return true;
  return false;
}
