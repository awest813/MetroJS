// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType, TerrainType, type CityTile } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import rawDefs from '../data/buildings.json';

import { MONTH_CATCHUP_LIMIT, MONTH_SECONDS } from '../data/constants';
import { EconomySystem } from './EconomySystem';
import { PowerSystem } from './PowerSystem';
import { PollutionSystem } from './PollutionSystem';
import { LandValueSystem } from './LandValueSystem';
import { TrafficPressureSystem } from './TrafficPressureSystem';
import { WalkabilitySystem } from './WalkabilitySystem';
import { TransitSystem } from './TransitSystem';
import {
  NEIGHBOUR_GROWTH_PULL,
  POWERED_ROAD_GROWTH_BOOST,
  STARTER_RESIDENTIAL_DEMAND,
  UNPOWERED_FACTOR,
  demandForZone,
  growthChance,
  monthlyGrowthBudget,
  nextDevelopmentDef,
  targetBuildingDef,
  tileHasAdjacentRoad,
  zoneBuildingIsStressed,
  STRESS_MONTHS_TO_CHANGE,
  ABANDON_COOLDOWN_MONTHS,
} from './zoneGrowthHints';

/** Maximum demand value (clamps residentialDemand, commercialDemand, industrialDemand). */
const MAX_DEMAND = 100;

/** Cast the imported JSON to a typed array once at module load. */
const BUILDING_DEFS: BuildingDef[] = rawDefs as BuildingDef[];

/** Result of one `ZoneGrowthSystem.tick` — clock advances only for time actually committed. */
export interface MonthTickResult {
  monthsRun: number;
  clockAdvance: number;
}
export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Drives the zone-growth simulation.
 *
 * - Runs once per simulated month.
 * - Grows placeholder buildings on zoned tiles adjacent to roads.
 * - After four consecutive stressed months, zone buildings downgrade or leave.
 * - Updates city stats (population, jobs) and demand values.
 */
export class ZoneGrowthSystem {
  /** All placed buildings, keyed by "x,y". */
  readonly buildings: Map<string, BuildingInstance> = new Map();

  /** Lookup from BuildingDef.id → BuildingDef. */
  private readonly _defs: Map<string, BuildingDef>;

  /** Candidate defs for each zone type. */
  private readonly _defsByZone: Map<ZoneType, BuildingDef[]>;

  /** How many seconds have elapsed since the last monthly tick. */
  private _secondsAccumulator = 0;

  /** Economy system — runs once per simulated month. */
  private readonly _economy = new EconomySystem();

  /** Power system — injected from CitySim so both share the same instance. */
  private readonly _power: PowerSystem;

  /** Land value system — injected from CitySim so both share the same instance. */
  private readonly _landValue: LandValueSystem;

  /** Pollution system — injected from CitySim so both share the same instance. */
  private readonly _pollution: PollutionSystem;

  /** Traffic pressure system — injected from CitySim so both share the same instance. */
  private readonly _traffic: TrafficPressureSystem;

  /** Walkability system — injected from CitySim so both share the same instance. */
  private readonly _walkability: WalkabilitySystem;

  /** Transit system — injected from CitySim so both share the same instance. */
  private readonly _transit: TransitSystem;

  constructor(power: PowerSystem, pollution: PollutionSystem, landValue: LandValueSystem, traffic: TrafficPressureSystem, walkability: WalkabilitySystem, transit: TransitSystem) {
    this._power       = power;
    this._pollution   = pollution;
    this._landValue   = landValue;
    this._traffic     = traffic;
    this._walkability = walkability;
    this._transit     = transit;
    this._defs      = new Map(BUILDING_DEFS.map((d) => [d.id, d]));
    this._defsByZone = new Map<ZoneType, BuildingDef[]>();
    for (const def of BUILDING_DEFS) {
      let bucket = this._defsByZone.get(def.zoneType);
      if (!bucket) {
        bucket = [];
        this._defsByZone.set(def.zoneType, bucket);
      }
      bucket.push(def);
    }
  }

  /** Expose building definitions for use by CitySim (e.g. power refresh). */
  get defs(): ReadonlyMap<string, BuildingDef> {
    return this._defs;
  }

  /**
   * Align the intra-month growth accumulator with a restored clock.
   * When `accumulator` is provided it is used as-is (may include pending catch-up
   * months). Otherwise `totalSeconds % MONTH_SECONDS` is the time already elapsed
   * in the current month.
   */
  restoreMonthProgress(totalSeconds: number, accumulator?: number): void {
    if (typeof accumulator === 'number' && Number.isFinite(accumulator) && accumulator >= 0) {
      this._secondsAccumulator = accumulator;
      return;
    }
    const elapsed = Number.isFinite(totalSeconds) ? totalSeconds : 0;
    const remainder = elapsed % MONTH_SECONDS;
    this._secondsAccumulator = remainder < 0 ? remainder + MONTH_SECONDS : remainder;
  }

  /** Seconds waiting to be processed (intra-month remainder plus pending catch-up). */
  get monthAccumulator(): number {
    return this._secondsAccumulator;
  }

  /** Recompute population and private-sector jobs from the current buildings. */
  recomputeCensus(stats: CityStats, map: CityMap): void {
    this._recalcStats(stats, map);
  }

  /**
   * Remove the building instance at (x, y) from the registry.
   * Call this from CitySim.bulldoze() to keep the registry consistent.
   * Returns true if a building was found and removed.
   */
  removeAt(x: number, y: number): boolean {
    return this.buildings.delete(tileKey(x, y));
  }

  /**
   * Called every simulation tick.
   * A large delta (tab resume) runs up to MONTH_CATCHUP_LIMIT months; leftover
   * time stays in the accumulator. `afterMonth` runs after each month so crime
   * and coverage exist before the next grow/degrade pass.
   *
   * `clockAdvance` is the simulated time that actually ran (processed months plus
   * live intra-month remainder). Pending catch-up months stay off the calendar.
   */
  tick(
    deltaSeconds: number,
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
    afterMonth?: () => void,
  ): MonthTickResult {
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    const before = this._secondsAccumulator;
    this._secondsAccumulator += delta;

    let months = 0;
    while (this._secondsAccumulator >= MONTH_SECONDS && months < MONTH_CATCHUP_LIMIT) {
      this._secondsAccumulator -= MONTH_SECONDS;
      this._runMonth(map, stats, changedTiles);
      afterMonth?.();
      months += 1;
    }

    const after = this._secondsAccumulator;
    const pendingBefore = Math.floor(before / MONTH_SECONDS);
    const pendingAfter = Math.floor(after / MONTH_SECONDS);
    const liveRemainder = (value: number, pending: number): number =>
      pending > 0 ? 0 : value - pending * MONTH_SECONDS;
    const clockAdvance =
      months * MONTH_SECONDS + liveRemainder(after, pendingAfter) - liveRemainder(before, pendingBefore);

    return { monthsRun: months, clockAdvance };
  }

  /** One simulated month: pollution → growth → power → census → economy → traffic. */
  private _runMonth(
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): void {
    // Pollution runs before land value so desirability reflects the previous
    // month's traffic plus the current building layout.
    this._pollution.tick(map, this.buildings, this.defs, stats);

    // Update land value before growth so growth decisions use fresh values.
    this._landValue.tick(map, this.buildings, this.defs);

    this._updateResidentialDemand(stats);
    this._growEmptyLots(map, stats, changedTiles, (zone) =>
      zone === ZoneType.Residential || zone === ZoneType.MixedUse,
    );

    // Power before the census so new houses count fully, then shops can open
    // against that population in the same month.
    this._power.tick(map, this.buildings, this.defs);
    this._recalcStats(stats, map);
    this._updateJobDemand(stats);

    this._growEmptyLots(map, stats, changedTiles, (zone) =>
      zone === ZoneType.Commercial || zone === ZoneType.Industrial || zone === ZoneType.MixedUse,
    );
    this._densifyBuildings(map, stats, changedTiles);

    this._power.tick(map, this.buildings, this.defs);
    this._degradeBuildings(map, stats, changedTiles);

    this._recalcStats(stats, map);
    this._economy.tick(map, this.buildings, this._defs, stats);

    // Traffic pressure is recalculated last so it reflects the freshest
    // building layout and populates tile.trafficPressure / tile.noise.
    this._traffic.tick(map, this.buildings, this.defs, stats);

    // Walkability runs after traffic so it can read fresh tile.noise values
    // and apply a modest reduction to trafficPressure on walkable road tiles.
    this._walkability.tick(map, this.buildings, this.defs, stats);

    // Transit runs last so it can further reduce trafficPressure after walkability
    // has already adjusted it, and so its effects feed into next month's LV pass.
    this._transit.tick(map, stats);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Adjusts demand values based on the current population/jobs balance
   * and tax rates.
   *
   * Rules (simple, readable):
   * - residential demand rises when jobs > workers (population).
   * - commercial demand rises when population grows.
   * - industrial demand starts modestly positive and decays slowly toward 20.
   * - higher tax rates suppress demand (penalty); lower rates boost it.
   */
  /** Housing demand from last month's jobs. An empty city keeps the starter bar. */
  private _updateResidentialDemand(stats: CityStats): void {
    const resTaxMod = (9 - stats.resTaxRate) * 2;
    const TRANSIT_RES_DEMAND_DIVISOR = 50;
    if (stats.population === 0) {
      stats.residentialDemand = STARTER_RESIDENTIAL_DEMAND;
      return;
    }
    const jobBalance = stats.jobs - stats.population;
    const transitResBoost = Math.round(stats.transitAccess / TRANSIT_RES_DEMAND_DIVISOR);
    stats.residentialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.residentialDemand + (jobBalance > 0 ? 5 : -2) + transitResBoost + resTaxMod),
    );
  }

  /** Shop and factory demand from the census just taken, including this month's houses. */
  private _updateJobDemand(stats: CityStats): void {
    const comTaxMod = (9 - stats.comTaxRate) * 2;
    const indTaxMod = (9 - stats.indTaxRate) * 2;
    const WALK_COM_DEMAND_DIVISOR = 25;
    const TRANSIT_COM_DEMAND_DIVISOR = 20;
    const popGrowthBoost = stats.population > 0 ? 3 : -1;
    const walkBoost = Math.round(stats.walkability / WALK_COM_DEMAND_DIVISOR);
    const transitComBoost = Math.round(stats.transitAccess / TRANSIT_COM_DEMAND_DIVISOR);
    stats.commercialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.commercialDemand + popGrowthBoost + walkBoost + transitComBoost + comTaxMod),
    );

    const industrialTarget = 20;
    const industrialDelta = stats.industrialDemand < industrialTarget ? 2 : -1;
    stats.industrialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.industrialDemand + industrialDelta + indTaxMod),
    );
  }

  /**
   * Grow empty zoned lots whose zone passes `include`. Each eligible lot rolls
   * its chance; when more succeed than the zone's monthly budget, lots beside
   * existing buildings and with better odds are kept first.
   */
  private _growEmptyLots(
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
    include: (zone: ZoneType) => boolean,
  ): void {
    const winners: Array<{ tile: CityTile; def: BuildingDef; rank: number }> = [];
    map.forEach((tile) => {
      if (!include(tile.zoneType)) return;
      if (tile.zoneType === ZoneType.None) return;
      if (tile.terrain === TerrainType.Water) return;
      if (tile.roadType !== RoadType.None) return;
      if (tile.buildingId !== null) return;
      if (tile.neglectMonths > 0) return;
      if (!tileHasAdjacentRoad(map, tile.x, tile.y)) return;

      const demand = demandForZone(tile.zoneType, stats);
      if (demand <= 0) return;

      const mixedBoost = (tile.zoneType === ZoneType.MixedUse &&
        this._hasAdjacentActiveZone(map, tile.x, tile.y)) ? 1.3 : 1.0;
      const poweredBoost = tile.powered ? POWERED_ROAD_GROWTH_BOOST : 1;
      const chance = growthChance(tile.landValue, demand, mixedBoost, poweredBoost);
      if (Math.random() > chance) return;

      const bucket = this._defsByZone.get(tile.zoneType);
      const def = bucket ? targetBuildingDef(bucket, tile.landValue, demand) : undefined;
      if (!def) return;

      // Weighted draw without replacement: a higher weight ranks higher on average.
      const pull = this._hasBuiltNeighbour(map, tile.x, tile.y) ? NEIGHBOUR_GROWTH_PULL : 1;
      winners.push({ tile, def, rank: Math.random() ** (1 / (chance * pull)) });
    });

    winners.sort((a, b) => b.rank - a.rank);
    const used = new Map<ZoneType, number>();
    for (const { tile, def } of winners) {
      const zone = tile.zoneType;
      const count = used.get(zone) ?? 0;
      const budget = monthlyGrowthBudget(demandForZone(zone, stats), stats.population, stats.jobs);
      if (count >= budget) continue;
      used.set(zone, count + 1);
      this.buildings.set(tileKey(tile.x, tile.y), { defId: def.id, x: tile.x, y: tile.y });
      tile.buildingId = def.id;
      changedTiles.push({ x: tile.x, y: tile.y });
    }
  }

  /** Any of the eight tiles around (x, y) has a building. */
  private _hasBuiltNeighbour(map: CityMap, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx !== 0 || dy !== 0) && map.getTile(x + dx, y + dy)?.buildingId) return true;
      }
    }
    return false;
  }

  /** Step a healthy building up one size when land value and demand can carry it. */
  private _densifyBuildings(
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): void {
    map.forEach((tile) => {
      if (tile.buildingId === null) return;
      const current = this._defs.get(tile.buildingId);
      if (!current || current.isService) return;
      if (zoneBuildingIsStressed(tile, map, stats)) return;

      const demand = demandForZone(tile.zoneType, stats);
      if (demand <= 0) return;
      const bucket = this._defsByZone.get(tile.zoneType);
      const next = bucket ? nextDevelopmentDef(bucket, current, tile.landValue, demand) : undefined;
      if (!next) return;
      if (Math.random() > growthChance(tile.landValue, demand, 1, POWERED_ROAD_GROWTH_BOOST)) return;

      this.buildings.set(tileKey(tile.x, tile.y), { defId: next.id, x: tile.x, y: tile.y });
      tile.buildingId = next.id;
      changedTiles.push({ x: tile.x, y: tile.y });
    });
  }

  /**
   * Zone-grown buildings (not parks/plants/stations) take stress from no road,
   * no demand, no power, heavy smog, or high crime.
   *
   * After STRESS_MONTHS_TO_CHANGE consecutive stressed months the building
   * steps down to a smaller def in the same zone, or leaves the lot if none
   * remains. Demand/tax/power formulas are unchanged. Crime is last month's
   * value (CrimeSystem runs after this monthly pass).
   */
  private _degradeBuildings(
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): void {
    const leaving: Array<{ x: number; y: number }> = [];

    map.forEach((tile) => {
      if (tile.buildingId === null) {
        if (tile.neglectMonths > 0) tile.neglectMonths -= 1;
        return;
      }

      const def = this._defs.get(tile.buildingId);
      if (!def || def.isService) {
        tile.neglectMonths = 0;
        return;
      }

      if (!zoneBuildingIsStressed(tile, map, stats)) {
        tile.neglectMonths = 0;
        return;
      }

      tile.neglectMonths += 1;
      if (tile.neglectMonths < STRESS_MONTHS_TO_CHANGE) return;

      const smaller = this._pickSmallerDef(tile.zoneType, def);
      if (smaller) {
        const key = tileKey(tile.x, tile.y);
        this.buildings.set(key, { defId: smaller.id, x: tile.x, y: tile.y });
        tile.buildingId = smaller.id;
        tile.neglectMonths = 0;
        changedTiles.push({ x: tile.x, y: tile.y });
        return;
      }

      leaving.push({ x: tile.x, y: tile.y });
    });

    for (const coord of leaving) {
      this.removeAt(coord.x, coord.y);
      const tile = map.getTile(coord.x, coord.y);
      if (!tile) continue;
      tile.buildingId = null;
      tile.neglectMonths = ABANDON_COOLDOWN_MONTHS;
      changedTiles.push(coord);
    }
  }

  private _pickSmallerDef(zoneType: ZoneType, current: BuildingDef): BuildingDef | undefined {
    const bucket = this._defsByZone.get(zoneType);
    if (!bucket) return undefined;
    const curSize = current.population + current.jobs;
    const smaller = bucket.filter(
      (d) => !d.isService && d.population + d.jobs < curSize,
    );
    if (smaller.length === 0) return undefined;
    smaller.sort((a, b) => (b.population + b.jobs) - (a.population + a.jobs));
    return smaller[0];
  }

  /**
   * Recompute population and jobs from placed buildings.
   * Civic/service staffing is not counted as `stats.jobs` — those posts do not
   * tax as C/I employment or create housing demand. Unpowered buildings
   * contribute only UNPOWERED_FACTOR of their potential.
   */
  private _recalcStats(stats: CityStats, map: CityMap): void {
    let population = 0;
    let darkPopulation = 0;
    let jobs       = 0;

    for (const instance of this.buildings.values()) {
      const def = this._defs.get(instance.defId);
      if (!def) continue;
      const tile   = map.getTile(instance.x, instance.y);
      const powered = tile?.powered ?? false;
      const factor = powered ? 1.0 : UNPOWERED_FACTOR;
      const people = def.population * factor;
      population += people;
      if (!powered) darkPopulation += people;
      if (!def.isService) jobs += def.jobs * factor;
    }

    stats.population = Math.floor(population);
    stats.darkPopulation = Math.floor(darkPopulation);
    stats.jobs       = Math.floor(jobs);
  }

  /**
   * Returns true if any orthogonal neighbour is zoned Residential, Commercial,
   * or MixedUse — any "active" (people/jobs-generating) zone type.
   * Used to give mixed-use tiles a growth bonus in already-active neighbourhoods.
   */
  private _hasAdjacentActiveZone(map: CityMap, x: number, y: number): boolean {
    const neighbours = [
      map.getTile(x,     y - 1),
      map.getTile(x,     y + 1),
      map.getTile(x - 1, y),
      map.getTile(x + 1, y),
    ];
    return neighbours.some(
      (t) =>
        t !== undefined &&
        (t.zoneType === ZoneType.Residential ||
         t.zoneType === ZoneType.Commercial  ||
         t.zoneType === ZoneType.MixedUse),
    );
  }

}
