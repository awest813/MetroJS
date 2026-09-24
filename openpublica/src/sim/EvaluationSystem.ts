// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import { tileHasAdjacentRoad, zoneStress, type ZoneStress } from './zoneGrowthHints';
import { stationHasRoad } from './roadDispatch';
import { EXTREME_TRAFFIC_PRESSURE } from './happiness';

/** Pollution average subtracted from approval at this weight. */
const POLLUTION_WEIGHT = 0.30;

/** Crime average subtracted from approval at this weight. */
const CRIME_WEIGHT = 0.25;

/** Warn about a deficit once the treasury would run dry within this many months. */
const DEFICIT_WARNING_MONTHS = 12;

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

/** Fire/water nags wait until someone actually lives here. */
export const SERVICE_ADVISORY_POPULATION = 40;

/**
 * Once this many people live here, a jobs total under half the population
 * is the mayor's next lesson (zone shops), ahead of fire and water.
 */
export const JOBS_GAP_POPULATION = 4;

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
    forecast?: WeatherForecast,
  ): void {
    const census = survey(map, buildings, defs, stats);
    stats.approval = score(stats, census);
    stats.advisory = topAdvisory(stats, census, forecast);
  }
}

/** Next month's weather, as the load it will put on today's grids. */
export interface WeatherForecast {
  readonly label: string;
  /** Next month's power load over this month's, same buildings. */
  readonly powerLoadRatio: number;
  readonly waterLoadRatio: number;
}

interface Census {
  hasPlant: boolean;
  hasRoad: boolean;
  buildingCount: number;
  unpoweredCount: number;
  unpoweredStations: number;
  /** Police/fire stations whose vehicles have no street to leave by. */
  strandedStations: number;
  /** Plants and towers with no street for their lines or mains to follow. */
  strandedUtilities: number;
  extremeRoads: number;
  lotsNeedRoad: number;
  zonedCount: number;
  residentialLots: number;
  commercialLots: number;
  industrialLots: number;
  mixedLots: number;
  strugglingCount: number;
  /** The most common trouble among struggling buildings, and whether most of those are houses. */
  strugglingCause: ZoneStress | null;
  strugglingHomes: boolean;
  /** Zone buildings sitting in the dark (houses, shops, factories). */
  unpoweredHouses: number;
  /** Empty zoned lots that already touch a road. */
  growableLots: number;
}

function survey(
  map: CityMap,
  buildings: ReadonlyMap<string, BuildingInstance>,
  defs: ReadonlyMap<string, BuildingDef>,
  stats: CityStats,
): Census {
  let hasPlant = false;
  let buildingCount = 0;
  let unpoweredCount = 0;
  let unpoweredStations = 0;
  let strandedStations = 0;
  let strandedUtilities = 0;

  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (def?.powerCapacity && def.powerCapacity > 0) hasPlant = true;
    if ((def?.policeRadius || def?.fireRadius) && !stationHasRoad(map, instance.x, instance.y)) {
      strandedStations += 1;
    }
    if ((def?.powerCapacity || def?.waterCapacity) && !stationHasRoad(map, instance.x, instance.y)) {
      strandedUtilities += 1;
    }
    if (instance.defId === 'small_park') continue;
    buildingCount += 1;
    const tile = map.getTile(instance.x, instance.y);
    if (tile && !tile.powered) {
      unpoweredCount += 1;
      if (def?.isService && !def.powerCapacity) unpoweredStations += 1;
    }
  }

  let extremeRoads = 0;
  let lotsNeedRoad = 0;
  let zonedCount = 0;
  let residentialLots = 0;
  let commercialLots = 0;
  let industrialLots = 0;
  let mixedLots = 0;
  let strugglingCount = 0;
  let strugglingHomeCount = 0;
  const causes = new Map<ZoneStress, number>();
  let unpoweredHouses = 0;
  let growableLots = 0;
  let hasRoad = false;
  map.forEach((tile) => {
    if (tile.roadType !== RoadType.None) hasRoad = true;
    if (tile.zoneType !== ZoneType.None) zonedCount += 1;
    if (tile.zoneType === ZoneType.Residential) residentialLots += 1;
    if (tile.zoneType === ZoneType.Commercial) commercialLots += 1;
    if (tile.zoneType === ZoneType.Industrial) industrialLots += 1;
    if (tile.zoneType === ZoneType.MixedUse) mixedLots += 1;
    if (tile.neglectMonths >= 2 && tile.buildingId !== null) {
      strugglingCount += 1;
      if (tile.zoneType === ZoneType.Residential) strugglingHomeCount += 1;
      const cause = zoneStress(tile, map, stats);
      if (cause) causes.set(cause, (causes.get(cause) ?? 0) + 1);
    }
    if (
      tile.zoneType !== ZoneType.None &&
      tile.buildingId !== null &&
      tile.buildingId !== 'small_park' &&
      !tile.powered
    ) {
      unpoweredHouses += 1;
    }
    if (tile.roadType !== RoadType.None && tile.trafficPressure >= EXTREME_TRAFFIC_PRESSURE) {
      extremeRoads += 1;
    }
    if (
      tile.zoneType !== ZoneType.None &&
      tile.roadType === RoadType.None &&
      tile.buildingId === null &&
      !tileHasAdjacentRoad(map, tile.x, tile.y)
    ) {
      lotsNeedRoad += 1;
    } else if (
      tile.zoneType !== ZoneType.None &&
      tile.roadType === RoadType.None &&
      tile.buildingId === null &&
      tileHasAdjacentRoad(map, tile.x, tile.y)
    ) {
      growableLots += 1;
    }
  });

  return {
    hasPlant,
    hasRoad,
    buildingCount,
    unpoweredCount,
    unpoweredStations,
    strandedStations,
    strandedUtilities,
    extremeRoads,
    lotsNeedRoad,
    zonedCount,
    residentialLots,
    commercialLots,
    industrialLots,
    mixedLots,
    strugglingCount,
    strugglingCause: [...causes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    strugglingHomes: strugglingHomeCount * 2 > strugglingCount,
    unpoweredHouses,
    growableLots,
  };
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

/** Why buildings are emptying, named by what troubles most of them. */
function emptyingMessage(census: Census): string {
  switch (census.strugglingCause) {
    case 'demand':
      return census.strugglingHomes
        ? 'Houses are emptying — more homes than jobs. Zone shops or factories, or cut residential tax.'
        : 'Shops and factories are emptying — not enough demand. Grow the population or cut taxes.';
    case 'power':
      return 'Buildings are emptying in the dark — connect their streets to a power plant with room to spare.';
    case 'smog':
      return 'Buildings are emptying in the smog — move plants and factories away from them, or add parks.';
    case 'crime':
      return 'Buildings are emptying to crime — add a powered police station on a street nearby.';
    default:
      return 'Buildings are emptying — restore power, demand, or road access.';
  }
}

function topAdvisory(stats: CityStats, census: Census, forecast?: WeatherForecast): string {
  const list = listAdvisories(stats, census, forecast);
  return list[0]?.message ?? '';
}

function listAdvisories(stats: CityStats, census: Census, forecast?: WeatherForecast): Advisory[] {
  const out: Advisory[] = [];
  if (stats.bankruptcyWarning) {
    out.push({ id: 'bankrupt', message: 'Treasury is bankrupt — cut spending or raise taxes.' });
  }
  const net = stats.projectedIncome - stats.projectedExpenses;
  if (!stats.bankruptcyWarning && net < 0 && stats.money >= 0) {
    const months = Math.floor(stats.money / -net);
    if (months < DEFICIT_WARNING_MONTHS) {
      out.push({
        id: 'deficit',
        message: `The budget is $${(-net).toLocaleString()}/mo in the red — money runs out in about ${Math.max(1, months)} month${months === 1 ? '' : 's'}. Raise taxes or cut upkeep.`,
      });
    }
  }
  if (census.lotsNeedRoad > 0) {
    out.push({
      id: 'roads',
      message: `${census.lotsNeedRoad} zoned lot${census.lotsNeedRoad === 1 ? '' : 's'} need a road next door.`,
    });
  }
  if (!census.hasPlant) {
    if (!census.hasRoad && census.zonedCount === 0 && census.buildingCount === 0) {
      out.push({
        id: 'start',
        message: 'Paint a street, zone lots beside it, then place a power plant beside the street.',
      });
    } else if (census.hasRoad && census.zonedCount === 0 && census.buildingCount === 0) {
      out.push({
        id: 'start-zone',
        message: 'Zone empty lots beside the street, then place a power plant beside it.',
      });
    } else {
      out.push({
        id: 'no-plant',
        message: 'Place a power plant beside a street — power runs along the streets from it.',
      });
    }
  }
  if (stats.population > 0 && census.unpoweredHouses > 0) {
    out.push({
      id: 'dark-houses',
      message: stats.powerShort > 0
        ? `Power plants are at capacity (${stats.powerLoad}/${stats.powerSupply}) — add a plant on the grid or these houses will leave.`
        : 'These houses are dark and will leave — connect their street to a power plant.',
    });
  }
  if (census.unpoweredStations > 0) {
    out.push({
      id: 'dark-station',
      message: `${census.unpoweredStations} station${census.unpoweredStations === 1 ? '' : 's'} unpowered — coverage is off until a plant's streets reach ${census.unpoweredStations === 1 ? 'it' : 'them'}.`,
    });
  }
  if (census.strandedUtilities > 0) {
    const one = census.strandedUtilities === 1;
    out.push({
      id: 'utility-road',
      message: `${census.strandedUtilities} plant${one ? ' or tower has' : 's or towers have'} no street — power and water run along streets, so pave one beside ${one ? 'it' : 'them'}.`,
    });
  }
  if (census.strandedStations > 0) {
    const one = census.strandedStations === 1;
    out.push({
      id: 'station-road',
      message: `${census.strandedStations} station${one ? ' has' : 's have'} no street — pave one beside ${one ? 'it' : 'them'} so crews can drive out.`,
    });
  }
  if (census.unpoweredCount > 0) {
    out.push({
      id: 'unpowered',
      message: stats.powerShort > 0
        ? `${census.unpoweredCount} building${census.unpoweredCount === 1 ? '' : 's'} unpowered — plants are at capacity (${stats.powerLoad}/${stats.powerSupply}).`
        : `${census.unpoweredCount} building${census.unpoweredCount === 1 ? '' : 's'} unpowered — connect their streets to a power plant.`,
    });
  }
  if (forecast && stats.powerShort === 0 && stats.powerSupply > 0 && forecast.powerLoadRatio > 1) {
    const load = Math.round(stats.powerLoad * forecast.powerLoadRatio);
    if (load > stats.powerSupply) {
      out.push({
        id: 'forecast-power',
        message: `${forecast.label} next month will push power load to about ${load} of ${stats.powerSupply} — add a plant before it comes.`,
      });
    }
  }
  if (forecast && stats.waterShort === 0 && stats.waterSupply > 0 && forecast.waterLoadRatio > 1) {
    const load = Math.round(stats.waterLoad * forecast.waterLoadRatio);
    if (load > stats.waterSupply) {
      out.push({
        id: 'forecast-water',
        message: `${forecast.label} next month will push water load to about ${load} of ${stats.waterSupply} — add a water tower before it comes.`,
      });
    }
  }
  if (census.strugglingCount > 0) {
    out.push({ id: 'abandon', message: emptyingMessage(census) });
  }
  if (stats.pollutionAverage >= 40) {
    out.push({ id: 'smog', message: 'Smog spike — industrial and plants are fouling the air.' });
  }
  if (stats.crimeAverage >= 35) {
    out.push({ id: 'crime', message: 'Crime is high — add a powered police station on a street near housing.' });
  }
  if (census.extremeRoads >= 3) {
    out.push({ id: 'traffic', message: 'Traffic is jammed — add a parallel street, a highway, or a trolley line.' });
  }
  if (stats.resTaxRate >= 15 || stats.comTaxRate >= 15 || stats.indTaxRate >= 15) {
    out.push({ id: 'tax', message: 'Taxes are high — demand and approval will sag.' });
  }
  const jobsFarBelow = stats.population >= JOBS_GAP_POPULATION && stats.jobs * 2 < stats.population;
  if (jobsFarBelow) {
    const jobLots = census.commercialLots + census.industrialLots + census.mixedLots;
    out.push({
      id: 'need-jobs',
      message: jobLots === 0
        ? 'Zone shops beside the street — jobs are far below the population.'
        : 'Jobs are far below the population — zone more shops or factories beside the street.',
    });
  }
  if (census.hasPlant && census.lotsNeedRoad === 0) {
    if (stats.population === 0) {
      if (
        census.residentialLots === 0 &&
        (census.commercialLots > 0 || census.mixedLots > 0) &&
        census.industrialLots === 0
      ) {
        out.push({
          id: 'need-housing',
          message: 'Shops wait for residents — zone housing beside a road.',
        });
      } else if (census.zonedCount === 0) {
        out.push({
          id: 'need-zone',
          message: 'Zone lots beside the street so houses can grow.',
        });
      } else {
        out.push({
          id: 'waiting',
          message: 'Waiting for growth — houses appear each month on powered lots by the road.',
        });
      }
    }
  }
  if (stats.population >= SERVICE_ADVISORY_POPULATION && stats.fireAverage < 20) {
    out.push({ id: 'fire', message: 'Fire coverage is thin — place a powered fire station on a street.' });
  }
  if (
    stats.population >= SERVICE_ADVISORY_POPULATION &&
    census.zonedCount > 0 &&
    stats.waterAverage < 25
  ) {
    out.push({
      id: 'water',
      message: stats.waterShort > 0
        ? `Water towers are running dry (${stats.waterLoad}/${stats.waterSupply}) — add a tower on the mains.`
        : 'Lots are dry — place a water tower beside a powered street.',
    });
  }
  if (
    census.hasPlant &&
    stats.population > 0 &&
    census.lotsNeedRoad === 0 &&
    census.growableLots > 0 &&
    !jobsFarBelow
  ) {
    out.push({
      id: 'waiting',
      message: 'Waiting for growth — houses appear each month on powered lots by the road.',
    });
  }
  return out;
}
