// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import rawDefs from '../data/buildings.json';

import { MONTH_SECONDS } from '../data/constants';
import { EconomySystem } from './EconomySystem';
import { PowerSystem } from './PowerSystem';
import { LandValueSystem } from './LandValueSystem';
import { TrafficPressureSystem } from './TrafficPressureSystem';

/** Maximum demand value (clamps residentialDemand, commercialDemand, industrialDemand). */
const MAX_DEMAND = 100;

/** Probability (0–1) that an eligible tile grows a building in any given month. */
const GROW_CHANCE = 0.25;

/**
 * Fraction of a building's population/jobs contribution when it lacks power.
 * A value of 0.75 means a 25% reduction while unpowered.
 */
const UNPOWERED_FACTOR = 0.75;

/** Cast the imported JSON to a typed array once at module load. */
const BUILDING_DEFS: BuildingDef[] = rawDefs as BuildingDef[];

/** Registry key for a tile position — exported for use by renderers. */
export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Drives the zone-growth simulation.
 *
 * - Runs once per simulated month.
 * - Grows placeholder buildings on zoned tiles adjacent to roads.
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

  /** Traffic pressure system — injected from CitySim so both share the same instance. */
  private readonly _traffic: TrafficPressureSystem;

  constructor(power: PowerSystem, landValue: LandValueSystem, traffic: TrafficPressureSystem) {
    this._power      = power;
    this._landValue  = landValue;
    this._traffic    = traffic;
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
   * Remove the building instance at (x, y) from the registry.
   * Call this from CitySim.bulldoze() to keep the registry consistent.
   * Returns true if a building was found and removed.
   */
  removeAt(x: number, y: number): boolean {
    return this.buildings.delete(tileKey(x, y));
  }

  /**
   * Called every simulation tick.
   * Returns an array of tile keys whose appearance changed (building placed),
   * so callers can trigger render updates.
   * Returns `true` if a monthly tick occurred (so CitySim can fire power callbacks).
   */
  tick(
    deltaSeconds: number,
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): boolean {
    this._secondsAccumulator += deltaSeconds;

    if (this._secondsAccumulator < MONTH_SECONDS) return false;
    this._secondsAccumulator -= MONTH_SECONDS;

    // Update land value first so growth decisions use fresh values.
    this._landValue.tick(map, this.buildings, this.defs);

    this._updateDemand(stats);
    this._growBuildings(map, stats, changedTiles);

    // Update power coverage before recalculating stats so that newly grown
    // buildings and the current power plant layout are both reflected.
    this._power.tick(map, this.buildings, this.defs);

    this._recalcStats(stats, map);
    this._economy.tick(map, this.buildings, this._defs, stats);

    // Traffic pressure is recalculated last so it reflects the freshest
    // building layout and populates tile.trafficPressure / tile.noise.
    this._traffic.tick(map, this.buildings, this.defs, stats);

    return true;
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
  private _updateDemand(stats: CityStats): void {
    // Each tax point above 9% reduces demand by 2 per month; below 9% adds 2.
    const resTaxMod = (9 - stats.resTaxRate) * 2;
    const comTaxMod = (9 - stats.comTaxRate) * 2;
    const indTaxMod = (9 - stats.indTaxRate) * 2;

    // Residential: people move in when there are more jobs than workers.
    const jobBalance = stats.jobs - stats.population;
    stats.residentialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.residentialDemand + (jobBalance > 0 ? 5 : -2) + resTaxMod),
    );

    // Commercial: shops open when there are more residents to serve.
    const popGrowthBoost = stats.population > 0 ? 3 : -1;
    stats.commercialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.commercialDemand + popGrowthBoost + comTaxMod),
    );

    // Industrial: starts at a modest positive level, slowly converges to 20.
    const industrialTarget = 20;
    const industrialDelta  = stats.industrialDemand < industrialTarget ? 2 : -1;
    stats.industrialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.industrialDemand + industrialDelta + indTaxMod),
    );
  }

  /** Try to grow a building on each eligible empty zoned tile. */
  private _growBuildings(
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): void {
    map.forEach((tile) => {
      // Must be a zoned tile with no existing building and no road on it.
      if (tile.zoneType === ZoneType.None)  return;
      if (tile.roadType !== RoadType.None)  return;
      if (tile.buildingId !== null)         return;

      // Must be adjacent to at least one road tile.
      if (!this._hasAdjacentRoad(map, tile.x, tile.y)) return;

      // Demand gate: only grow if demand is positive.
      const demand = this._demandFor(tile.zoneType, stats);
      if (demand <= 0) return;

      // Probabilistic growth — not every eligible tile grows every month.
      // Land value biases the probability: higher value → more likely to grow.
      // lvFactor ranges from 0.5 (LV=0) through 1.0 (LV=50) to 1.5 (LV=100).
      // With the default GROW_CHANCE of 0.25, the effective chance stays well
      // below the 0.9 safety cap (max = 0.25 × 1.5 = 0.375).
      const lvFactor   = 0.5 + tile.landValue / 100;
      // Mixed-use gets an extra boost when near existing residential or commercial
      // zones, reflecting the real-world tendency for main-street corridors to form
      // in already-active neighbourhoods.
      const mixedBoost = (tile.zoneType === ZoneType.MixedUse &&
        this._hasAdjacentResOrCom(map, tile.x, tile.y)) ? 1.3 : 1.0;
      const growChance = Math.min(0.9, GROW_CHANCE * lvFactor * mixedBoost);
      if (Math.random() > growChance) return;

      const def = this._pickDef(tile.zoneType);
      if (!def) return;

      // Place the building.
      const key = tileKey(tile.x, tile.y);
      const instance = { defId: def.id, x: tile.x, y: tile.y };
      this.buildings.set(key, instance);
      tile.buildingId = def.id;

      changedTiles.push({ x: tile.x, y: tile.y });
    });
  }

  /** Recompute population and jobs from all placed buildings.
   *  Unpowered buildings contribute only UNPOWERED_FACTOR of their potential. */
  private _recalcStats(stats: CityStats, map: CityMap): void {
    let population = 0;
    let jobs       = 0;

    for (const instance of this.buildings.values()) {
      const def = this._defs.get(instance.defId);
      if (!def) continue;
      const tile   = map.getTile(instance.x, instance.y);
      const factor = (tile?.powered ?? false) ? 1.0 : UNPOWERED_FACTOR;
      population += def.population * factor;
      jobs       += def.jobs       * factor;
    }

    stats.population = Math.floor(population);
    stats.jobs       = Math.floor(jobs);
  }

  /** Returns true if any orthogonal neighbour has a road. */
  private _hasAdjacentRoad(map: CityMap, x: number, y: number): boolean {
    const neighbours = [
      map.getTile(x,     y - 1),
      map.getTile(x,     y + 1),
      map.getTile(x - 1, y),
      map.getTile(x + 1, y),
    ];
    return neighbours.some((t) => t !== undefined && t.roadType !== RoadType.None);
  }

  /**
   * Returns true if any orthogonal neighbour is zoned Residential, Commercial,
   * or MixedUse.  Used to give mixed-use tiles a growth bonus in active areas.
   */
  private _hasAdjacentResOrCom(map: CityMap, x: number, y: number): boolean {
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

  /** Returns the demand level for the given zone type. */
  private _demandFor(zoneType: ZoneType, stats: CityStats): number {
    switch (zoneType) {
      case ZoneType.Residential: return stats.residentialDemand;
      case ZoneType.Commercial:  return stats.commercialDemand;
      case ZoneType.Industrial:  return stats.industrialDemand;
      // Mixed-use requires both residential and commercial demand to be positive;
      // it grows at the rate of the weaker of the two signals so it stays balanced.
      case ZoneType.MixedUse:
        return Math.min(stats.residentialDemand, stats.commercialDemand);
      default:                   return 0;
    }
  }

  /** Picks a random building definition for the given zone type. */
  private _pickDef(zoneType: ZoneType): BuildingDef | undefined {
    const bucket = this._defsByZone.get(zoneType);
    if (!bucket || bucket.length === 0) return undefined;
    return bucket[Math.floor(Math.random() * bucket.length)];
  }
}
