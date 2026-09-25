// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType, TerrainType } from './CityTile';
import type { CityTile } from './CityTile';
import { ROAD_STEPS, hasRoadFrontage, isBridgeAt } from './roadConnections';
import { happinessDraw } from './happiness';

/**
 * Opening residential demand. The monthly loop otherwise decays R-demand when
 * jobs ≤ population, so a new city that only paints houses would never grow.
 */
export const STARTER_RESIDENTIAL_DEMAND = 40;

/** Starter demand per point of residential tax under (or over) 9%. */
export const STARTER_TAX_DEMAND = 6;

/**
 * Housing demand in a city nobody lives in: the starter bar, moved by the
 * residential tax. At 16% and up nobody moves in, so a town its taxes
 * emptied stays empty until they come down, instead of regrowing on the
 * starter bar and emptying again every few years.
 */
export function starterDemand(resTaxRate: number): number {
  return Math.max(0, Math.min(100, STARTER_RESIDENTIAL_DEMAND + (9 - resTaxRate) * STARTER_TAX_DEMAND));
}

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

/**
 * Tiles from a factory lot to a highway for the largest works: its freight
 * needs one close by, so heavy industry grows along highways.
 */
export const FREIGHT_REACH = 3;

/** Consecutive stressed months before a zone building downgrades or leaves. */
export const STRESS_MONTHS_TO_CHANGE = 4;

/**
 * Monthly growth multiplier for a lot that already has power.
 * Callers pass this only when the lot also touches a road. Unpowered lots stay
 * on the base chance so a dark block still fills slowly.
 */
export const POWERED_ROAD_GROWTH_BOOST = 2.5;

/** New buildings one zone type can take in a month at zero demand in an empty city. */
export const GROWTH_BUDGET_BASE = 4;

/** Extra new buildings per month for each point of demand. */
export const GROWTH_BUDGET_PER_DEMAND = 0.25;

/** Residents plus jobs that double the monthly budget: a bigger city draws more newcomers. */
export const GROWTH_BUDGET_CITY_SCALE = 1000;

/** A lot beside a building is this much likelier to fill first, so big zones grow outward. */
export const NEIGHBOUR_GROWTH_PULL = 8;

/**
 * How many empty lots of one zone type may fill this month. Demand is how
 * many newcomers want in, not how fast every zoned lot builds: zoning a
 * thousand lots should fill them over years, not in one month.
 */
export function monthlyGrowthBudget(demand: number, population: number, jobs: number): number {
  if (demand <= 0) return 0;
  const base = GROWTH_BUDGET_BASE + demand * GROWTH_BUDGET_PER_DEMAND;
  return Math.ceil(base * (1 + Math.max(0, population + jobs) / GROWTH_BUDGET_CITY_SCALE));
}

/** Empty months after abandon before the lot may grow again. */
export const ABANDON_COOLDOWN_MONTHS = 2;

/** Tile pollution at or above this stresses a zone building. */
export const POLLUTION_STRESS_THRESHOLD = 60;

/** Tile crime at or above this stresses a zone building. */
export const CRIME_STRESS_THRESHOLD = 50;

/**
 * Factories do not mind smog; homes and shops do. (When they did, every
 * workshop fouled its neighbours past the threshold and an industrial
 * district emptied and regrew in a loop.)
 */
export function smogStresses(zoneType: ZoneType): boolean {
  return zoneType !== ZoneType.Industrial;
}

/**
 * Smog or crime already past the level that drives a building out. Nobody
 * builds there: a building would only stand four stressed months and leave.
 */
export function lotTooHostile(tile: CityTile): 'smog' | 'crime' | null {
  if (tile.pollution >= POLLUTION_STRESS_THRESHOLD && smogStresses(tile.zoneType)) return 'smog';
  if (tile.crime >= CRIME_STRESS_THRESHOLD) return 'crime';
  return null;
}

/** True when the lot fronts a land road. Bridge decks have no driveways. */
export function tileHasAdjacentRoad(map: CityMap, x: number, y: number): boolean {
  return hasRoadFrontage(map, x, y);
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

/** True when a highway runs within {@link FREIGHT_REACH} tiles of the lot. */
export function hasFreightAccess(map: CityMap, x: number, y: number): boolean {
  for (let dy = -FREIGHT_REACH; dy <= FREIGHT_REACH; dy++) {
    for (let dx = -FREIGHT_REACH; dx <= FREIGHT_REACH; dx++) {
      if (map.getTile(x + dx, y + dy)?.roadType === RoadType.Highway) return true;
    }
  }
  return false;
}

/**
 * Factory size. Industry grows on demand, not land value (its own smog keeps
 * its land cheap): a factory needs the mid demand bar, and the largest works
 * also need a highway within {@link FREIGHT_REACH} for their freight.
 */
export function industrialTier(demand: number, freight: boolean): number {
  if (demand >= TALL_DEMAND && freight) return 2;
  if (demand >= DENSE_DEMAND) return 1;
  return 0;
}

/** The size a lot can support: by land value and demand, or for industry by demand and freight. */
export function lotTier(map: CityMap, tile: CityTile, demand: number): number {
  if (tile.zoneType === ZoneType.Industrial) return industrialTier(demand, hasFreightAccess(map, tile.x, tile.y));
  return developmentTier(tile.landValue, demand);
}

/**
 * Land value points of slack a building keeps under the bar that grew it
 * before it counts as outgrown, so it does not flip size at the bar.
 */
export const SHRINK_SLACK = 10;

/** Consecutive outgrown months before a building steps down one size. */
export const SHRINK_MONTHS = 6;

/**
 * Industrial demand under which industry is in decline (taxes too high, or
 * more jobs than people). At the baseline of 20 the city simply needs no new
 * factories; the ones it has are still wanted.
 */
export const INDUSTRY_DECLINE_DEMAND = 10;

/**
 * True when a building is bigger than its lot can now support: homes, shops,
 * and mixed use by land value (an office block on land well under 70), and
 * industry when it is in decline or works have lost their highway. Weak
 * demand elsewhere is the stress pass's business (it thins a zone with no
 * demand at all).
 */
export function outgrownLot(
  map: CityMap,
  tile: CityTile,
  defs: readonly GrowthDef[],
  current: GrowthDef,
  demand: number,
): boolean {
  const ranked = rankedZoneDefs(defs);
  const size = ranked.findIndex((def) => def.id === current.id);
  if (tile.zoneType === ZoneType.Industrial) {
    const sustained = demand >= INDUSTRY_DECLINE_DEMAND ? TALL_DEMAND : demand + SHRINK_SLACK;
    return size > industrialTier(sustained, hasFreightAccess(map, tile.x, tile.y));
  }
  return size > developmentTier(tile.landValue + SHRINK_SLACK, TALL_DEMAND);
}

export function rankedZoneDefs<T extends GrowthDef>(defs: readonly T[]): T[] {
  return defs
    .filter((def) => !def.isService)
    .slice()
    .sort((a, b) => buildingSize(a) - buildingSize(b) || a.id.localeCompare(b.id));
}

/**
 * Largest def this lot can support. Low value or weak demand stays on the
 * smallest building. Pass `tier` ({@link lotTier}) to use a zone's own bars.
 */
export function targetBuildingDef<T extends GrowthDef>(
  defs: readonly T[],
  landValue: number,
  demand: number,
  tier = developmentTier(landValue, demand),
): T | undefined {
  const ranked = rankedZoneDefs(defs);
  if (ranked.length === 0) return undefined;
  return ranked[Math.min(tier, ranked.length - 1)];
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
  tier = developmentTier(landValue, demand),
): T | undefined {
  const target = targetBuildingDef(defs, landValue, demand, tier);
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
    case ZoneType.Residential: return housingDemand(stats);
    case ZoneType.Commercial:  return stats.commercialDemand;
    case ZoneType.Industrial:  return stats.industrialDemand;
    case ZoneType.MixedUse:
      return Math.min(housingDemand(stats), stats.commercialDemand);
    default:
      return 0;
  }
}

/**
 * The housing demand people act on: residential demand times the share
 * happiness draws ({@link happinessDraw}). Jobs and taxes set the demand; an
 * unhappy city turns part of it away.
 */
export function housingDemand(stats: CityStats): number {
  return Math.round(stats.residentialDemand * happinessDraw(stats.happiness));
}

/** Why this lot is empty, or null if it already has a building / nothing to say. */
export function formatGrowthHint(
  tile: CityTile,
  map: CityMap,
  stats: CityStats,
  opts: {
    /** The lot's power grid has no room for another building (`CitySim.gridFullAt`). */
    gridFull?: boolean;
    /** Months the building has outgrown its lot (`ZoneGrowthSystem.outgrownMonths`). */
    outgrownMonths?: number;
  } = {},
): string | null {
  if (tile.terrain === TerrainType.Water) return null;
  if (tile.buildingId !== null) {
    if (tile.buildingId === 'small_park') return null;
    if (tile.neglectMonths >= 2) {
      return 'struggling — restore power, demand, or road access';
    }
    if (!tile.powered) return 'unpowered — connect its street to a power plant, or add one if the grid is full';
    const outgrown = opts.outgrownMonths ?? 0;
    if (outgrown > 0) {
      const left = Math.max(1, SHRINK_MONTHS - outgrown);
      const why = tile.zoneType === ZoneType.Industrial
        ? 'industry here is in decline or has lost its highway'
        : 'its land value has fallen under what this size needs';
      return `outgrown — ${why}; it steps down in ${left} month${left === 1 ? '' : 's'}`;
    }
    return null;
  }
  if (tile.zoneType === ZoneType.None) return null;

  if (tile.roadType !== RoadType.None) {
    return 'buildings grow on lots beside the street, not on the road';
  }
  if (!tileHasAdjacentRoad(map, tile.x, tile.y)) {
    const besideBridge = ROAD_STEPS.some(([dx, dy]) => isBridgeAt(map, tile.x + dx, tile.y + dy));
    return besideBridge
      ? 'a bridge has no driveways — needs a street next door'
      : 'needs a road next door';
  }

  const demand = demandForZone(tile.zoneType, stats);
  const housing = tile.zoneType === ZoneType.Residential || tile.zoneType === ZoneType.MixedUse;
  if (demand <= 0 && housing && stats.residentialDemand > 0 && housingDemand(stats) <= 0) {
    return `people are staying away — happiness is ${stats.happiness}; clear the jams and crime that weigh on it`;
  }
  if (demand <= 0) {
    if (tile.zoneType === ZoneType.Residential) {
      return 'no housing demand — add jobs or cut residential tax';
    }
    if (tile.zoneType === ZoneType.Commercial) {
      if (stats.population <= 0) return 'no shop demand — shops wait for residents; zone housing nearby';
      return stats.comTaxRate > 9
        ? `no shop demand — commercial tax at ${stats.comTaxRate}% keeps shops away`
        : 'no shop demand — the residents already keep every shop busy; zone housing for more customers';
    }
    if (tile.zoneType === ZoneType.MixedUse) {
      return 'mixed-use needs both housing and shop demand';
    }
    return stats.indTaxRate > 9
      ? `no industrial demand — industrial tax at ${stats.indTaxRate}% keeps factories away`
      : 'no industrial demand — nearly every resident already has work';
  }

  const hostile = lotTooHostile(tile);
  if (hostile === 'smog') return 'too smoggy to settle — move plants and factories away or add parks';
  if (hostile === 'crime') return 'too much crime to settle — a police station nearby would help';

  if (opts.gridFull) return 'waiting for power — its grid is full, so add a plant on these streets';

  const pace = monthlyGrowthBudget(demand, stats.population, stats.jobs);
  const fill = `up to ${pace} new ${pace === 1 ? 'building' : 'buildings'} a month at this demand`;
  if (!tile.powered) {
    return `waiting to grow, ${fill} (will run underpowered until its street joins a power grid)`;
  }
  return `waiting to grow, ${fill}`;
}

/** Why a zone-grown building is under stress this month. */
export type ZoneStress = 'zone' | 'road' | 'power' | 'smog' | 'crime' | 'demand';

/**
 * What is stressing a zone-grown building, or null when nothing is. Losing
 * its zone, road, power, or clean air, or high crime, comes before a want of
 * demand: those drive a building out on their own; demand alone thins a zone
 * a few buildings a month ({@link demandExodusCap}).
 * Services are filtered by the caller. Crime is typically last month's value.
 */
export function zoneStress(tile: CityTile, map: CityMap, stats: CityStats): ZoneStress | null {
  if (tile.zoneType === ZoneType.None) return 'zone';
  if (!tileHasAdjacentRoad(map, tile.x, tile.y)) return 'road';
  if (!tile.powered) return 'power';
  if (tile.pollution >= POLLUTION_STRESS_THRESHOLD && smogStresses(tile.zoneType)) return 'smog';
  if (tile.crime >= CRIME_STRESS_THRESHOLD) return 'crime';
  if (demandForZone(tile.zoneType, stats) <= 0) return 'demand';
  return null;
}

/** True when a zone-grown building should gain a neglect month. */
export function zoneBuildingIsStressed(tile: CityTile, map: CityMap, stats: CityStats): boolean {
  return zoneStress(tile, map, stats) !== null;
}

/** Share of a zone's buildings that may shrink or leave in one month for want of demand alone. */
export const DEMAND_EXODUS_SHARE = 0.05;

/**
 * How many of a zone's `buildings` may downgrade or leave this month when
 * demand alone is the trouble. With no cap every house in town reached its
 * fourth stressed month together and the town emptied at once, then regrew
 * from the starter demand: a boom and bust instead of a city that settles
 * where its jobs are.
 */
export function demandExodusCap(buildings: number): number {
  return Math.max(1, Math.ceil(buildings * DEMAND_EXODUS_SHARE));
}
