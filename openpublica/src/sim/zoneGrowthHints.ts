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
