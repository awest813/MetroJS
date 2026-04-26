// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import type { CityStats } from './CitySim';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import rawDefs from '../data/buildings.json';

/** Seconds of simulation time that equal one "month". */
const MONTH_SECONDS = 30;

/** Maximum demand value (clamps residentialDemand, commercialDemand, industrialDemand). */
const MAX_DEMAND = 100;

/** Probability (0–1) that an eligible tile grows a building in any given month. */
const GROW_CHANCE = 0.25;

/** Cast the imported JSON to a typed array once at module load. */
const BUILDING_DEFS: BuildingDef[] = rawDefs as BuildingDef[];

/** Registry key for a tile position. */
function tileKey(x: number, y: number): string {
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

  constructor() {
    this._defs      = new Map(BUILDING_DEFS.map((d) => [d.id, d]));
    this._defsByZone = new Map<ZoneType, BuildingDef[]>();
    for (const def of BUILDING_DEFS) {
      const bucket = this._defsByZone.get(def.zoneType) ?? [];
      bucket.push(def);
      this._defsByZone.set(def.zoneType, bucket);
    }
  }

  /**
   * Called every simulation tick.
   * Returns an array of tile keys whose appearance changed (building placed),
   * so callers can trigger render updates.
   */
  tick(
    deltaSeconds: number,
    map: CityMap,
    stats: CityStats,
    changedTiles: Array<{ x: number; y: number }>,
  ): void {
    this._secondsAccumulator += deltaSeconds;

    if (this._secondsAccumulator < MONTH_SECONDS) return;
    this._secondsAccumulator -= MONTH_SECONDS;

    this._updateDemand(stats);
    this._growBuildings(map, stats, changedTiles);
    this._recalcStats(stats);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Adjusts demand values based on the current population/jobs balance.
   *
   * Rules (simple, readable):
   * - residential demand rises when jobs > workers (population).
   * - commercial demand rises when population grows.
   * - industrial demand starts modestly positive and decays slowly toward 20.
   */
  private _updateDemand(stats: CityStats): void {
    // Residential: people move in when there are more jobs than workers.
    const jobBalance = stats.jobs - stats.population;
    stats.residentialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.residentialDemand + (jobBalance > 0 ? 5 : -2)),
    );

    // Commercial: shops open when there are more residents to serve.
    const popGrowthBoost = stats.population > 0 ? 3 : -1;
    stats.commercialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.commercialDemand + popGrowthBoost),
    );

    // Industrial: starts at a modest positive level, slowly converges to 20.
    const industrialTarget = 20;
    const industrialDelta  = stats.industrialDemand < industrialTarget ? 2 : -1;
    stats.industrialDemand = Math.max(
      0,
      Math.min(MAX_DEMAND, stats.industrialDemand + industrialDelta),
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
      if (Math.random() > GROW_CHANCE) return;

      const def = this._pickDef(tile.zoneType);
      if (!def) return;

      // Place the building.
      const key: string = tileKey(tile.x, tile.y);
      const instance: BuildingInstance = { defId: def.id, x: tile.x, y: tile.y };
      this.buildings.set(key, instance);
      tile.buildingId = def.id;

      changedTiles.push({ x: tile.x, y: tile.y });
    });
  }

  /** Recompute population and jobs from all placed buildings. */
  private _recalcStats(stats: CityStats): void {
    let population = 0;
    let jobs       = 0;

    for (const instance of this.buildings.values()) {
      const def = this._defs.get(instance.defId);
      if (!def) continue;
      population += def.population;
      jobs       += def.jobs;
    }

    stats.population = population;
    stats.jobs       = jobs;
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

  /** Returns the demand level for the given zone type. */
  private _demandFor(zoneType: ZoneType, stats: CityStats): number {
    switch (zoneType) {
      case ZoneType.Residential: return stats.residentialDemand;
      case ZoneType.Commercial:  return stats.commercialDemand;
      case ZoneType.Industrial:  return stats.industrialDemand;
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
