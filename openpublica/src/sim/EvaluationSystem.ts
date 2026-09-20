// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import { tileHasAdjacentRoad } from './zoneGrowthHints';

/** Pollution average subtracted from approval at this weight. */
const POLLUTION_WEIGHT = 0.30;

/** Crime average subtracted from approval at this weight. */
const CRIME_WEIGHT = 0.25;

/** Happiness-style extreme traffic threshold (same as TrafficPressureSystem). */
const EXTREME_PRESSURE = 8;

/** Approval lost per extreme-traffic road, capped. */
const TRAFFIC_PER_EXTREME = 2;
const TRAFFIC_CAP = 25;

/** Approval lost per tax point above the default 9. */
const TAX_PER_POINT_OVER = 3;

/** Approval lost when every building is unpowered. */
const UNPOWERED_WEIGHT = 40;

/** Flat approval hit while the treasury is negative. */
const BANKRUPT_PENALTY = 35;

/** Flat approval hit when the city has no generator. */
const NO_PLANT_PENALTY = 12;

export interface Advisory {
  readonly id: string;
  readonly message: string;
}

/**
 * Monthly mayor score and a single top advisory.
 *
 * approval starts at 100 and is reduced by pollution, crime, extreme traffic,
 * taxes above 9%, unpowered buildings, bankruptcy, and a missing power plant.
 * No Micropolis evaluation tables or census graphs.
 *
 * Advisories are city-wide (status/HUD), not tile-local inspect copy.
 */
export class EvaluationSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    const census = survey(map, buildings, defs);
    stats.approval = score(stats, census);
    stats.advisory = topAdvisory(stats, census);
  }
}

interface Census {
  hasPlant: boolean;
  buildingCount: number;
  unpoweredCount: number;
  extremeRoads: number;
  lotsNeedRoad: number;
  zonedCount: number;
}

function survey(
  map: CityMap,
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
): Census {
  let hasPlant = false;
  let buildingCount = 0;
  let unpoweredCount = 0;

  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (def?.powerRadius && def.powerRadius > 0) hasPlant = true;
    if (instance.defId === 'small_park') continue;
    buildingCount += 1;
    const tile = map.getTile(instance.x, instance.y);
    if (tile && !tile.powered) unpoweredCount += 1;
  }

  let extremeRoads = 0;
  let lotsNeedRoad = 0;
  let zonedCount = 0;
  map.forEach((tile) => {
    if (tile.zoneType !== ZoneType.None) zonedCount += 1;
    if (tile.roadType !== RoadType.None && tile.trafficPressure >= EXTREME_PRESSURE) {
      extremeRoads += 1;
    }
    if (
      tile.zoneType !== ZoneType.None &&
      tile.roadType === RoadType.None &&
      tile.buildingId === null &&
      !tileHasAdjacentRoad(map, tile.x, tile.y)
    ) {
      lotsNeedRoad += 1;
    }
  });

  return { hasPlant, buildingCount, unpoweredCount, extremeRoads, lotsNeedRoad, zonedCount };
}

function score(stats: CityStats, census: Census): number {
  let next = 100;
  next -= Math.round(stats.pollutionAverage * POLLUTION_WEIGHT);
  next -= Math.round(stats.crimeAverage * CRIME_WEIGHT);
  next -= Math.min(TRAFFIC_CAP, census.extremeRoads * TRAFFIC_PER_EXTREME);
  next -= taxOverDefault(stats.resTaxRate);
  next -= taxOverDefault(stats.comTaxRate);
  next -= taxOverDefault(stats.indTaxRate);
  if (census.buildingCount > 0) {
    next -= Math.round((census.unpoweredCount / census.buildingCount) * UNPOWERED_WEIGHT);
  }
  if (stats.bankruptcyWarning) next -= BANKRUPT_PENALTY;
  if (!census.hasPlant && (census.zonedCount > 0 || census.buildingCount > 0)) {
    next -= NO_PLANT_PENALTY;
  }
  return Math.max(0, Math.min(100, next));
}

function taxOverDefault(rate: number): number {
  return Math.max(0, rate - 9) * TAX_PER_POINT_OVER;
}

function topAdvisory(stats: CityStats, census: Census): string {
  const list = listAdvisories(stats, census);
  return list[0]?.message ?? '';
}

function listAdvisories(stats: CityStats, census: Census): Advisory[] {
  const out: Advisory[] = [];
  if (stats.bankruptcyWarning) {
    out.push({ id: 'bankrupt', message: 'Treasury is bankrupt — cut spending or raise taxes.' });
  }
  if (!census.hasPlant) {
    if (census.zonedCount === 0 && census.buildingCount === 0) {
      out.push({ id: 'no-plant', message: 'Zone land and place a power plant.' });
    } else {
      out.push({ id: 'no-plant', message: 'No power plant — lots stay dark until you place one.' });
    }
  }
  if (census.unpoweredCount > 0) {
    out.push({
      id: 'unpowered',
      message: `${census.unpoweredCount} building${census.unpoweredCount === 1 ? '' : 's'} unpowered — expand the plant radius.`,
    });
  }
  if (stats.pollutionAverage >= 40) {
    out.push({ id: 'smog', message: 'Smog spike — industrial and plants are fouling the air.' });
  }
  if (stats.crimeAverage >= 35) {
    out.push({ id: 'crime', message: 'Crime is high — add a powered police station near housing.' });
  }
  if (census.extremeRoads >= 3) {
    out.push({ id: 'traffic', message: 'Traffic is jammed — add roads or trolley near jobs.' });
  }
  if (stats.resTaxRate >= 15 || stats.comTaxRate >= 15 || stats.indTaxRate >= 15) {
    out.push({ id: 'tax', message: 'Taxes are high — demand and approval will sag.' });
  }
  if (census.lotsNeedRoad > 0) {
    out.push({
      id: 'roads',
      message: `${census.lotsNeedRoad} zoned lot${census.lotsNeedRoad === 1 ? '' : 's'} need a road next door.`,
    });
  }
  if (stats.population > 0 && stats.fireAverage < 20) {
    out.push({ id: 'fire', message: 'Fire coverage is thin — place a powered fire station.' });
  }
  return out;
}
