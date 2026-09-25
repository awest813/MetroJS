// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { CityMap } from './CityMap';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import { housingDemand, tileHasAdjacentRoad, zoneStress, type ZoneStress } from './zoneGrowthHints';
import { stationHasRoad } from './roadDispatch';
import { EXTREME_TRAFFIC_PRESSURE } from './happiness';
import { TAX_NEUTRAL_RATE, taxOccupancy } from './taxes';
import { SERVICE_TIERS, budgetCarries, tierOf, tierToBuild, type TieredService } from './serviceTiers';
import {
  BAILOUT_OFFER_MONTHS,
  BAILOUT_RATING_PENALTY,
  COUNCIL_CUT_MONTHS,
  formatCosts,
  type CityCost,
} from './bankruptcy';

/** Warn about a deficit once the treasury would run dry within this many months. */
const DEFICIT_WARNING_MONTHS = 12;

/**
 * The city rating (stored as `stats.approval`, shown as Rating): four parts
 * worth up to 25 each, less the city's problems.
 *
 * - Size: population on a log scale, 25 at {@link RATING_FULL_SIZE} people.
 * - Happiness: a quarter of it.
 * - Services: the share of zone buildings powered, and from
 *   {@link SERVICE_ADVISORY_POPULATION} residents on also watered and
 *   reached by a fire station.
 * - Budget: a balanced budget and money in hand; nothing in debt.
 * - Problems: smog, taxes over 9%, no power plant, a state bailout's
 *   terms (sim/bankruptcy.ts), and debt. A city in
 *   debt rates {@link RATING_IN_DEBT_MAX} at best, however big and happy.
 */
export const RATING_PART = 25;
export const RATING_FULL_SIZE = 2000;

/** Rating lost per point of smog on developed land. */
const RATING_SMOG_WEIGHT = 0.25;

/** Rating lost per point of each tax over 9% (all three raised together: 3 a point). */
const RATING_TAX_PER_POINT = 1;

/** Rating lost with no power plant once anything is zoned or built. */
const RATING_NO_PLANT = 10;

/**
 * Rating lost while the treasury is in debt (on top of an empty budget part):
 * at least this, and whatever more holds the rating to {@link RATING_IN_DEBT_MAX}.
 */
const RATING_DEBT = 15;

/** The best rating a city in debt can have. */
export const RATING_IN_DEBT_MAX = 40;

/** Money in hand that earns the rest of the budget part. */
const RATING_RESERVE = 1000;

/** Fire/water nags wait until someone actually lives here. */
export const SERVICE_ADVISORY_POPULATION = 40;

/** Buildings left dry by full water towers before the mayor hears about it. */
export const WATER_SHORT_ADVISORY = 5;

/**
 * Once this many people live here, a jobs total under half the population
 * is the mayor's next lesson (zone shops), ahead of fire and water.
 */
export const JOBS_GAP_POPULATION = 4;

/** A tile an advisory points at: clicking it in the HUD jumps there. */
export interface AdvisoryPlace {
  readonly x: number;
  readonly y: number;
}

export interface Advisory {
  readonly id: string;
  readonly message: string;
  /** Where the trouble is, when it has a place. */
  readonly at?: AdvisoryPlace;
}

/**
 * Advisories that take over at once, whatever is being held: money running
 * out, a city without power, and a heatwave or freeze arriving next month.
 */
const URGENT_ADVISORIES: ReadonlySet<string> = new Set([
  'bankrupt', 'deficit', 'start', 'start-zone', 'no-plant', 'dark-houses', 'dark-station',
  'forecast-power', 'forecast-water',
]);

/** Months the top advisory stays up while it still holds, before a new top one replaces it. */
export const ADVISORY_HOLD_MONTHS = 3;

/** The advisory on show and the month it came up (saved, so a load shows the same one). */
export interface AdvisoryHold {
  readonly id: string;
  readonly since: number;
  /** Its words and place when it came up, shown while its family still applies. */
  readonly message?: string;
  readonly at?: AdvisoryPlace;
}

/**
 * Advisories that stand for the same trouble. The emptying lines (one per
 * cause) are one family: while buildings are still emptying, the held line
 * stays even if this month's most common cause is another.
 */
function family(id: string): string {
  return id.startsWith('abandon') ? 'abandon' : id;
}

/**
 * Monthly city rating (see {@link RATING_PART}) and a single top advisory.
 * No Micropolis evaluation tables or census graphs.
 *
 * Advisories are city-wide (status/HUD), not tile-local inspect copy.
 */
export class EvaluationSystem {
  /** The advisory on show, held for {@link ADVISORY_HOLD_MONTHS} while it still applies. */
  hold: AdvisoryHold | null = null;
  /** Every advisory that applied at the last evaluation, most pressing first. */
  advisories: readonly Advisory[] = [];
  /** The advisories that applied at the last evaluation, to tell a new trouble from an old one. */
  private _lastIds: ReadonlySet<string> = new Set();

  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
    forecast?: WeatherForecast,
    /** What one more point on every tax would bring in a month (for the deficit advice). */
    budget?: BudgetHints,
    /** Months the city has run (for the hold). */
    month = 0,
    /**
     * True at a month's end: the advisory on show is held while it applies.
     * False after the player's edits, which show the new top one at once.
     */
    steady = false,
  ): void {
    const census = survey(map, buildings, defs, stats);
    const rating = rate(stats, census);
    stats.approval = rating.total;
    stats.ratingParts = rating.parts;
    const list = listAdvisories(stats, census, forecast, budget);
    this.advisories = list;
    const shown = this._choose(list, month, steady);
    stats.advisory = shown?.message ?? '';
    stats.advisoryAt = shown?.at ?? null;
  }

  /**
   * The top advisory, unless the one on show still applies (or, for the
   * emptying lines, another of its family does), the new top one is neither
   * urgent nor brought up by this edit, and (at a month's end) the one on
   * show came up less than {@link ADVISORY_HOLD_MONTHS} ago: then it stays,
   * so the line does not flip between troubles every month.
   */
  private _choose(list: readonly Advisory[], month: number, steady: boolean): Advisory | undefined {
    const top = list[0];
    if (!top) {
      this.hold = null;
      return undefined;
    }
    const hold = this.hold;
    const before = this._lastIds;
    this._lastIds = new Set(list.map((a) => a.id));
    // An edit that brings up a new trouble shows it at once; at a month's end the hold runs out.
    const fresh = !steady && !before.has(top.id);
    const keep = hold !== null && hold.id !== top.id && !URGENT_ADVISORIES.has(top.id) && !fresh &&
      (!steady || month - hold.since < ADVISORY_HOLD_MONTHS);
    if (keep) {
      const same = list.find((a) => a.id === hold.id);
      if (same) return same;
      if (hold.message && list.some((a) => family(a.id) === family(hold.id))) {
        return { id: hold.id, message: hold.message, at: hold.at };
      }
    }
    if (!hold || hold.id !== top.id) this.hold = { id: top.id, since: month, message: top.message, at: top.at };
    return top;
  }
}

/** Budget figures the advice quotes. */
export interface BudgetHints {
  readonly perTaxPoint: number;
  /** The month's biggest costs, for the deficit and debt advice (G10). */
  readonly costs?: readonly CityCost[];
}

/** Next month's weather, as the load it will put on today's grids. */
export interface WeatherForecast {
  readonly label: string;
  /** Next month's power load over this month's, same buildings. */
  readonly powerLoadRatio: number;
  readonly waterLoadRatio: number;
}

/** Buildings struggling with one trouble: how many, of which kinds, and one of them. */
interface StruggleGroup {
  count: number;
  homes: number;
  shops: number;
  factories: number;
  at: AdvisoryPlace;
}

interface Places {
  /** A struggling building (neglected two months or more). */
  struggling?: AdvisoryPlace;
  needRoad?: AdvisoryPlace;
  darkBuilding?: AdvisoryPlace;
  darkStation?: AdvisoryPlace;
  strandedStation?: AdvisoryPlace;
  strandedUtility?: AdvisoryPlace;
  unprotected?: AdvisoryPlace;
  dry?: AdvisoryPlace;
  /** The most jammed road, the smoggiest and the most crime-ridden developed tiles. */
  worstRoad?: AdvisoryPlace;
  smoggiest?: AdvisoryPlace;
  mostCrime?: AdvisoryPlace;
  /** A small-tier building of each service (pump, fire hall, police post), to upgrade. */
  smallTier?: Partial<Record<TieredService, AdvisoryPlace>>;
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
  /** Struggling buildings by their trouble, most common first. */
  struggling: ReadonlyArray<[ZoneStress, StruggleGroup]>;
  /** Where each kind of trouble can be seen (the first such tile found). */
  places: Places;
  /** Zone buildings sitting in the dark (houses, shops, factories). */
  unpoweredHouses: number;
  /** Zone buildings (houses, shops, factories, mixed use). */
  zoneBuildings: number;
  /** Zone buildings no fire station reaches. */
  unprotectedBuildings: number;
  /** Zone buildings without water. */
  dryBuildings: number;
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
  const places: Places = {};
  const at = (x: number, y: number): AdvisoryPlace => ({ x, y });

  for (const instance of buildings.values()) {
    const def = defs.get(instance.defId);
    if (def?.powerCapacity && def.powerCapacity > 0) hasPlant = true;
    if ((def?.policeRadius || def?.fireRadius) && !stationHasRoad(map, instance.x, instance.y)) {
      strandedStations += 1;
      places.strandedStation ??= at(instance.x, instance.y);
    }
    if ((def?.powerCapacity || def?.waterCapacity) && !stationHasRoad(map, instance.x, instance.y)) {
      strandedUtilities += 1;
      places.strandedUtility ??= at(instance.x, instance.y);
    }
    const tier = tierOf(instance.defId);
    if (tier?.small) {
      places.smallTier ??= {};
      places.smallTier[tier.service] ??= at(instance.x, instance.y);
    }
    if (instance.defId === 'small_park') continue;
    buildingCount += 1;
    const tile = map.getTile(instance.x, instance.y);
    if (tile && !tile.powered) {
      unpoweredCount += 1;
      places.darkBuilding ??= at(instance.x, instance.y);
      if (def?.isService && !def.powerCapacity) {
        unpoweredStations += 1;
        places.darkStation ??= at(instance.x, instance.y);
      }
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
  const causes = new Map<ZoneStress, StruggleGroup>();
  let worstTraffic = 0;
  let worstSmog = 0;
  let worstCrime = 0;
  let unpoweredHouses = 0;
  let zoneBuildings = 0;
  let unprotectedBuildings = 0;
  let dryBuildings = 0;
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
      places.struggling ??= at(tile.x, tile.y);
      const cause = zoneStress(tile, map, stats);
      if (cause) {
        let group = causes.get(cause);
        if (!group) {
          group = { count: 0, homes: 0, shops: 0, factories: 0, at: at(tile.x, tile.y) };
          causes.set(cause, group);
        }
        group.count += 1;
        if (tile.zoneType === ZoneType.Residential) group.homes += 1;
        if (tile.zoneType === ZoneType.Commercial) group.shops += 1;
        if (tile.zoneType === ZoneType.Industrial) group.factories += 1;
      }
    }
    const developed = tile.zoneType !== ZoneType.None || tile.buildingId !== null;
    if (developed && tile.pollution > worstSmog) {
      worstSmog = tile.pollution;
      places.smoggiest = at(tile.x, tile.y);
    }
    if (developed && tile.crime > worstCrime) {
      worstCrime = tile.crime;
      places.mostCrime = at(tile.x, tile.y);
    }
    if (
      tile.zoneType !== ZoneType.None &&
      tile.buildingId !== null &&
      tile.buildingId !== 'small_park'
    ) {
      zoneBuildings += 1;
      if (!tile.powered) unpoweredHouses += 1;
      if (tile.fireCoverage <= 0) {
        unprotectedBuildings += 1;
        places.unprotected ??= at(tile.x, tile.y);
      }
      if (!tile.watered) {
        dryBuildings += 1;
        places.dry ??= at(tile.x, tile.y);
      }
    }
    if (tile.roadType !== RoadType.None && tile.trafficPressure >= EXTREME_TRAFFIC_PRESSURE) {
      extremeRoads += 1;
      if (tile.trafficPressure > worstTraffic) {
        worstTraffic = tile.trafficPressure;
        places.worstRoad = at(tile.x, tile.y);
      }
    }
    if (
      tile.zoneType !== ZoneType.None &&
      tile.roadType === RoadType.None &&
      tile.buildingId === null &&
      !tileHasAdjacentRoad(map, tile.x, tile.y)
    ) {
      lotsNeedRoad += 1;
      places.needRoad ??= at(tile.x, tile.y);
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
    struggling: [...causes].sort((a, b) => b[1].count - a[1].count),
    places,
    unpoweredHouses,
    zoneBuildings,
    unprotectedBuildings,
    dryBuildings,
    growableLots,
  };
}

/** The city rating's parts, for the HUD tooltip. */
export interface RatingParts {
  readonly size: number;
  readonly happiness: number;
  readonly services: number;
  readonly budget: number;
  readonly smog: number;
  readonly taxes: number;
  /** No plant, debt, and a bailout's terms. */
  readonly other: number;
}

/** Size points for a population: log-scaled, {@link RATING_PART} at {@link RATING_FULL_SIZE}. */
export function sizePoints(population: number): number {
  if (population <= 0) return 0;
  const full = Math.log10(1 + RATING_FULL_SIZE / 20);
  return RATING_PART * Math.min(1, Math.log10(1 + population / 20) / full);
}

function rate(stats: CityStats, census: Census): { total: number; parts: RatingParts } {
  const size = sizePoints(stats.population);
  const happiness = RATING_PART * Math.max(0, Math.min(100, stats.happiness)) / 100;
  let services = 0;
  if (census.zoneBuildings > 0) {
    const shares = [1 - census.unpoweredHouses / census.zoneBuildings];
    if (stats.population >= SERVICE_ADVISORY_POPULATION) {
      shares.push(1 - census.dryBuildings / census.zoneBuildings);
      shares.push(1 - census.unprotectedBuildings / census.zoneBuildings);
    }
    services = RATING_PART * shares.reduce((a, b) => a + b, 0) / shares.length;
  }
  const net = stats.projectedIncome - stats.projectedExpenses;
  const budget = stats.bankruptcyWarning || stats.money < 0
    ? 0
    : (net >= 0 ? 15 : 5) + (stats.money >= RATING_RESERVE ? 10 : 5);
  const smog = stats.pollutionAverage * RATING_SMOG_WEIGHT;
  const taxes = [stats.resTaxRate, stats.comTaxRate, stats.indTaxRate]
    .reduce((sum, r) => sum + Math.max(0, r - TAX_NEUTRAL_RATE) * RATING_TAX_PER_POINT, 0);
  const parts = {
    size: Math.round(size),
    happiness: Math.round(happiness),
    services: Math.round(services),
    budget,
    smog: Math.round(smog),
    taxes,
    other: (!census.hasPlant && (census.zonedCount > 0 || census.buildingCount > 0) ? RATING_NO_PLANT : 0)
      + ((stats.bailoutMonths ?? 0) > 0 ? BAILOUT_RATING_PENALTY : 0),
  };
  if (stats.bankruptcyWarning || stats.money < 0) {
    const before = parts.size + parts.happiness + parts.services + parts.budget - parts.smog - parts.taxes - parts.other;
    parts.other += Math.max(RATING_DEBT, before - RATING_IN_DEBT_MAX);
  }
  // The total is the parts as shown, so the HUD tooltip adds up.
  const total = parts.size + parts.happiness + parts.services + parts.budget
    - parts.smog - parts.taxes - parts.other;
  return { total: Math.max(0, Math.min(100, total)), parts };
}

/** Why buildings are emptying, for one trouble and the buildings it troubles. */
function emptyingMessage(cause: ZoneStress, group: StruggleGroup, stats: CityStats): string {
  switch (cause) {
    case 'demand':
      if (group.homes * 2 > group.count) {
        if (stats.residentialDemand > 0 && housingDemand(stats) <= 0) {
          return `Houses are emptying — people are too unhappy to stay (happiness ${stats.happiness}). Clear the jammed roads and crime.`;
        }
        return stats.jobs < stats.population
          ? 'Houses are emptying — more homes than jobs. Zone shops or factories.'
          : 'Houses are emptying — housing demand ran dry and is climbing back while jobs outnumber homes.';
      }
      return group.shops >= group.factories
        ? 'Shops are emptying — there are more shops than residents to keep them busy. Zone housing for more customers.'
        : 'Factories are emptying — nearly every resident already has work. Zone housing for more workers.';
    case 'power':
      return 'Buildings are emptying in the dark — connect their streets to a power plant with room to spare.';
    case 'smog':
      return 'Buildings are emptying in the smog — move plants and factories away from them, or add parks.';
    case 'crime':
      return `Buildings are emptying to crime — add a powered ${tierToBuild('police', stats).name} on a street nearby.`;
    default:
      return 'Buildings are emptying — restore power, demand, or road access.';
  }
}

function listAdvisories(stats: CityStats, census: Census, forecast?: WeatherForecast, budget?: BudgetHints): Advisory[] {
  // A village is told of the cheap tier until its budget carries the full one (G4).
  const water = tierToBuild('water', stats).name;
  const police = tierToBuild('police', stats).name;
  const fire = tierToBuild('fire', stats).name;
  const out: Advisory[] = [];
  const costs = formatCosts(budget?.costs ?? []);
  const biggest = costs ? ` Biggest costs: ${costs}.` : '';
  if (stats.bailoutOffered) {
    out.push({ id: 'bankrupt', message: 'Two years in debt — the state offers a bailout. Take it, or start a new city.' });
  } else if (stats.councilCuts) {
    const left = Math.max(1, BAILOUT_OFFER_MONTHS - (stats.debtMonths ?? 0));
    out.push({
      id: 'bankrupt',
      message: `A year in debt — the council has cut police, fire, and road funding to the minimum until the treasury is out of the red.${biggest} In ${left} month${left === 1 ? '' : 's'} the state steps in.`,
    });
  } else if (stats.bankruptcyWarning) {
    const months = stats.debtMonths ?? 0;
    const left = COUNCIL_CUT_MONTHS - months;
    const warning = months > 0 && left > 0
      ? ` In ${left} month${left === 1 ? '' : 's'} the council cuts funding.`
      : '';
    out.push({
      id: 'bankrupt',
      message: `Treasury is bankrupt — take a bond in Budget, then raise taxes or trim funding.${biggest}${warning}`,
    });
  }
  const net = stats.projectedIncome - stats.projectedExpenses;
  if (!stats.bankruptcyWarning && net < 0 && stats.money >= 0) {
    const months = Math.floor(stats.money / -net);
    if (months < DEFICIT_WARNING_MONTHS) {
      const shown = Math.max(1, months);
      const gain = budget?.perTaxPoint ?? 0;
      const taxes = gain > 0
        ? `A point on every tax brings in about $${gain.toLocaleString()} a month (and empties about 4% of places)`
        : 'Raise taxes';
      out.push({
        id: 'deficit',
        message: `The budget is $${(-net).toLocaleString()}/mo in the red — money runs out in about ${shown} month${shown === 1 ? '' : 's'}. ${taxes}, or trim police, fire, or road funding.${biggest}`,
      });
    }
  }
  // People leaving outrank lots waiting for a road, which have no one to lose.
  // Each trouble is its own line, most buildings first. (A power exodus has
  // its own lines below.)
  for (const [cause, group] of census.struggling) {
    if (cause === 'power') continue;
    out.push({ id: `abandon:${cause}`, message: emptyingMessage(cause, group, stats), at: group.at });
  }
  if (census.strugglingCount > 0 && census.struggling.length === 0) {
    // Neglected buildings whose trouble has just lifted: they may still go.
    out.push({ id: 'abandon', message: 'Buildings are emptying — restore power, demand, or road access.', at: census.places.struggling });
  }
  if (census.lotsNeedRoad > 0) {
    out.push({
      id: 'roads',
      at: census.places.needRoad,
      message: `${census.lotsNeedRoad} zoned lot${census.lotsNeedRoad === 1 ? '' : 's'} need a road next door.`,
    });
  }
  if (!census.hasPlant) {
    if (!census.hasRoad && census.zonedCount === 0 && census.buildingCount === 0) {
      out.push({
        id: 'start',
        message: 'Paint a street, zone lots beside it, then place a power plant beside the street, away from the houses (its smog carries 8 tiles).',
      });
    } else if (census.hasRoad && census.zonedCount === 0 && census.buildingCount === 0) {
      out.push({
        id: 'start-zone',
        message: 'Zone empty lots beside the street, then place a power plant beside it, away from the houses (its smog carries 8 tiles).',
      });
    } else {
      out.push({
        id: 'no-plant',
        message: 'Place a power plant beside a street, away from the houses — power runs along the streets from it, and its smog carries 8 tiles.',
      });
    }
  }
  if (stats.population > 0 && census.unpoweredHouses > 0) {
    out.push({
      id: 'dark-houses',
      at: census.places.darkBuilding,
      message: stats.powerShort > 0
        ? `Power plants are at capacity (${stats.powerLoad}/${stats.powerSupply}) — add a plant on the grid or these houses will leave.`
        : 'These houses are dark and will leave — connect their street to a power plant.',
    });
  }
  if (census.unpoweredStations > 0) {
    out.push({
      id: 'dark-station',
      at: census.places.darkStation,
      message: `${census.unpoweredStations} station${census.unpoweredStations === 1 ? '' : 's'} unpowered — coverage is off until a plant's streets reach ${census.unpoweredStations === 1 ? 'it' : 'them'}.`,
    });
  }
  if (census.strandedUtilities > 0) {
    const one = census.strandedUtilities === 1;
    out.push({
      id: 'utility-road',
      at: census.places.strandedUtility,
      message: `${census.strandedUtilities} plant${one ? ' or tower has' : 's or towers have'} no street — power and water run along streets, so pave one beside ${one ? 'it' : 'them'}.`,
    });
  }
  if (census.strandedStations > 0) {
    const one = census.strandedStations === 1;
    out.push({
      id: 'station-road',
      at: census.places.strandedStation,
      message: `${census.strandedStations} station${one ? ' has' : 's have'} no street — pave one beside ${one ? 'it' : 'them'} so crews can drive out.`,
    });
  }
  if (census.unpoweredCount > 0) {
    out.push({
      id: 'unpowered',
      at: census.places.darkBuilding,
      message: stats.powerShort > 0
        ? `${census.unpoweredCount} building${census.unpoweredCount === 1 ? '' : 's'} unpowered — plants are at capacity (${stats.powerLoad}/${stats.powerSupply}).`
        : `${census.unpoweredCount} building${census.unpoweredCount === 1 ? '' : 's'} unpowered — connect their streets to a power plant.`,
    });
  }
  const held = stats.powerHeld ?? 0;
  if (held > 0 && census.unpoweredCount === 0) {
    out.push({
      id: 'grid-full',
      message: `The power grid is full — ${held} new building${held === 1 ? '' : 's'} waited for power last month. Add a plant on the grid.`,
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
        message: `${forecast.label} next month will push water load to about ${load} of ${stats.waterSupply} — add a ${water} before it comes.`,
      });
    }
  }
  const powerGroup = census.struggling.find(([cause]) => cause === 'power');
  if (powerGroup) {
    out.push({ id: 'abandon:power', message: emptyingMessage('power', powerGroup[1], stats), at: powerGroup[1].at });
  }
  // The jobs lesson comes before fire and water (JOBS_GAP_POPULATION).
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

  const serviced = stats.population >= SERVICE_ADVISORY_POPULATION && census.zonedCount > 0;
  const waterFull = serviced && stats.waterShort >= WATER_SHORT_ADVISORY;
  if (waterFull) {
    const one = stats.waterShort === 1;
    out.push({
      id: 'water-full',
      at: census.places.dry,
      message: `The water mains are at capacity (${stats.waterLoad}/${stats.waterSupply}) — ${stats.waterShort} building${one ? ' is' : 's are'} dry. Add a ${water} on the mains.`,
    });
  }
  if (stats.pollutionAverage >= 40) {
    out.push({ id: 'smog', message: 'Smog spike — industrial and plants are fouling the air.', at: census.places.smoggiest });
  }
  if (stats.crimeAverage >= 35) {
    out.push({ id: 'crime', message: `Crime is high — add a powered ${police} on a street near housing.`, at: census.places.mostCrime });
  }
  // A one-click fix, so it comes before the city's chronic traffic. A village
  // whose fire hall reaches every building is not asked for more until its
  // budget carries a station.
  const fireWanted = census.unprotectedBuildings > 0 || fire === SERVICE_TIERS.fire.full.name;
  if (stats.population >= SERVICE_ADVISORY_POPULATION && stats.fireAverage < 20 && fireWanted) {
    const n = census.unprotectedBuildings;
    out.push({
      id: 'fire',
      at: census.places.unprotected,
      message: n > 0
        ? `Fire coverage is thin — ${n} building${n === 1 ? ' has' : 's have'} no fire engine in reach. Place a powered ${fire} on a street near them.`
        : `Fire coverage is thin — place a powered ${fire} on a street.`,
    });
  }
  if (census.extremeRoads >= 3) {
    // Trips stay near home, so a highway across town relieves nothing: fix the jammed road itself.
    out.push({
      id: 'traffic',
      at: census.places.worstRoad,
      message: `Traffic is jammed on ${census.extremeRoads} roads — upgrade them to a highway or trolley line, or add a street behind the block.`,
    });
  }
  const topTax = Math.max(stats.resTaxRate, stats.comTaxRate, stats.indTaxRate);
  if (topTax >= 15) {
    const empty = Math.round((1 - taxOccupancy(topTax)) * 100);
    out.push({
      id: 'tax',
      message: `Taxes are high — at ${topTax}% about ${empty}% of places stand empty and newcomers stay away, and approval sags.`,
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
  if (serviced && !waterFull && stats.waterAverage < 25) {
    out.push({
      id: 'water',
      at: census.places.dry,
      message: stats.waterShort > 0
        ? `The water mains are running dry (${stats.waterLoad}/${stats.waterSupply}) — add a ${water} on the mains.`
        : `Lots are dry — place a ${water} beside a powered street.`,
    });
  }
  // Once the budget carries the full tier, a village's pump, fire hall, or
  // police post can be upgraded in place (G4).
  for (const service of ['water', 'fire', 'police'] as const) {
    const place = census.places.smallTier?.[service];
    const tiers = SERVICE_TIERS[service];
    if (place && budgetCarries(stats, tiers.full.upkeep - tiers.small.upkeep)) {
      out.push({
        id: `upgrade:${service}`,
        at: place,
        message: `The budget can carry a ${tiers.full.name} now — place one on the ${tiers.small.name} to upgrade it, for the difference in price.`,
      });
    }
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
