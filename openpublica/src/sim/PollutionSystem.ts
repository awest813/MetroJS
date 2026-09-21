// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CityMap } from './CityMap';
import { RoadType, ZoneType } from './CityTile';
import type { BuildingDef } from './BuildingDef';
import type { BuildingInstance } from './BuildingInstance';
import type { CityStats } from './CitySim';

/** Maximum per-tile pollution value. */
const MAX_POLLUTION = 100;

/** Radius used to spread vehicle pollution out from busy road tiles. */
const TRAFFIC_POLLUTION_RADIUS = 2;

/** Pollution contributed by one unit of trafficPressure on a road tile. */
const POLLUTION_PER_TRAFFIC_PRESSURE = 2;

/**
 * PollutionSystem — writes `tile.pollution` and `stats.pollutionAverage`.
 *
 * Run once per simulated month. Building-based pollution is data-driven via
 * BuildingDef.pollutionOutput / pollutionRadius. Road traffic contributes an
 * additional local pollution cloud based on the previous month's
 * `tile.trafficPressure`.
 *
 * `stats.pollutionAverage` is the mean on developed tiles (zone, building, or
 * road), including clean lots at 0 — same include-zeros rule as crime/fire.
 */
export class PollutionSystem {
  tick(
    map: CityMap,
    buildings: ReadonlyMap<string, BuildingInstance>,
    defs: ReadonlyMap<string, BuildingDef>,
    stats: CityStats,
  ): void {
    map.forEach((tile) => {
      tile.pollution = 0;
    });

    for (const instance of buildings.values()) {
      const def = defs.get(instance.defId);
      if (!def) continue;
      this._emitRadialPollution(
        map,
        instance.x,
        instance.y,
        def.pollutionOutput ?? 0,
        def.pollutionRadius ?? 0,
      );
    }

    map.forEach((tile) => {
      if (tile.roadType === RoadType.None || tile.trafficPressure <= 0) return;
      this._emitRadialPollution(
        map,
        tile.x,
        tile.y,
        tile.trafficPressure * POLLUTION_PER_TRAFFIC_PRESSURE,
        TRAFFIC_POLLUTION_RADIUS,
      );
    });

    let developedCount = 0;
    let pollutionTotal = 0;

    map.forEach((tile) => {
      tile.pollution = Math.max(0, Math.min(MAX_POLLUTION, tile.pollution));
      if (
        tile.zoneType === ZoneType.None &&
        tile.buildingId === null &&
        tile.roadType === RoadType.None
      ) {
        return;
      }
      developedCount++;
      pollutionTotal += tile.pollution;
    });

    stats.pollutionAverage = developedCount > 0
      ? Math.round(pollutionTotal / developedCount)
      : 0;
  }

  private _emitRadialPollution(
    map: CityMap,
    originX: number,
    originY: number,
    strength: number,
    radius: number,
  ): void {
    if (strength <= 0 || radius <= 0) return;

    const radiusSquared = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared) continue;

        const tile = map.getTile(originX + dx, originY + dy);
        if (!tile) continue;

        const distance = Math.sqrt(distanceSquared);
        const falloff  = Math.max(0, 1 - distance / (radius + 1));
        tile.pollution += Math.round(strength * falloff);
      }
    }
  }
}
