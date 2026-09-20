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

/** Consecutive stressed months before a zone building downgrades or leaves. */
export const STRESS_MONTHS_TO_CHANGE = 4;

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
