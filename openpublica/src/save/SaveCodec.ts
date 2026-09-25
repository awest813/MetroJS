// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CitySim } from '../sim/CitySim';
import { tileKey } from '../sim/ZoneGrowthSystem';
import { DEFAULT_TERRAIN_SEED } from '../sim/TerrainGenerator';
import { MILESTONES, milestonesByPopulation } from '../sim/milestones';
import { SAVE_VERSION } from './SaveGame';
import type { SaveGame } from './SaveGame';

/**
 * Converts CitySim ↔ SaveGame documents.
 *
 * Encoding captures only simulation state (no Babylon mesh data).
 * Decoding restores that state onto an existing CitySim, with safe defaults
 * for any fields that are absent (e.g. when loading an older save).
 */
export class SaveCodec {
  // ── Encode ─────────────────────────────────────────────────────────────────

  /** Serialise the current sim state into a SaveGame document. */
  static encode(sim: CitySim): SaveGame {
    const tiles: SaveGame['tiles'] = [];
    sim.map.forEach((tile) => {
      const outgrown = sim.growth.outgrownMonths(tile.x, tile.y);
      tiles.push({
        x:          tile.x,
        y:          tile.y,
        terrain:    tile.terrain,
        roadType:   tile.roadType,
        zoneType:   tile.zoneType,
        buildingId: tile.buildingId,
        neglectMonths: tile.neglectMonths,
        ...(outgrown > 0 ? { outgrownMonths: outgrown } : {}),
      });
    });

    const buildings = Array.from(sim.growth.buildings.values()).map((inst) => ({
      defId: inst.defId,
      x:     inst.x,
      y:     inst.y,
    }));

    return {
      version:           SAVE_VERSION,
      mapWidth:          sim.map.width,
      mapHeight:         sim.map.height,
      clockTotalSeconds: sim.clock.totalSeconds,
      terrainSeed:       sim.terrainSeed,
      monthAccumulator:  sim.growth.monthAccumulator,
      stats: {
        population:        sim.stats.population,
        jobs:              sim.stats.jobs,
        money:             sim.stats.money,
        residentialDemand: sim.stats.residentialDemand,
        commercialDemand:  sim.stats.commercialDemand,
        industrialDemand:  sim.stats.industrialDemand,
        resTaxRate:        sim.stats.resTaxRate,
        comTaxRate:        sim.stats.comTaxRate,
        indTaxRate:        sim.stats.indTaxRate,
        monthlyIncome:     sim.stats.monthlyIncome,
        monthlyExpenses:   sim.stats.monthlyExpenses,
        serviceExpenses:   sim.stats.serviceExpenses,
        projectedIncome:   sim.stats.projectedIncome,
        projectedExpenses: sim.stats.projectedExpenses,
        bankruptcyWarning: sim.stats.bankruptcyWarning,
        happiness:         sim.stats.happiness,
        walkability:       sim.stats.walkability,
        transitAccess:     sim.stats.transitAccess,
        pollutionAverage:  sim.stats.pollutionAverage,
        crimeAverage:      sim.stats.crimeAverage,
        fireAverage:       sim.stats.fireAverage,
        waterAverage:      sim.stats.waterAverage,
        approval:          sim.stats.approval,
        advisory:          sim.stats.advisory,
        powerHeld:         sim.stats.powerHeld ?? 0,
        advisoryHold:      sim.evaluation.hold,
        milestones:        sim.stats.milestones ?? 0,
        debtMonths:        sim.stats.debtMonths ?? 0,
        councilCuts:       sim.stats.councilCuts ?? false,
        bailoutOffered:    sim.stats.bailoutOffered ?? false,
        bailoutMonths:     sim.stats.bailoutMonths ?? 0,
        bailouts:          sim.stats.bailouts ?? 0,
      },
      levers: {
        safetyFunding: sim.levers.safetyFunding,
        roadFunding:   sim.levers.roadFunding,
        bonds:         sim.levers.bonds.map((b) => ({ owed: b.owed, payment: b.payment })),
      },
      tiles,
      buildings,
    };
  }

  // ── Decode ─────────────────────────────────────────────────────────────────

  /**
   * Restore sim state from a SaveGame document in-place.
   * The sim must already exist (typically a fresh CitySim with the correct map
   * dimensions).  All fields use safe defaults so loading an older save never
   * throws.
   */
  static decode(save: SaveGame, sim: CitySim): void {
    // Drop live occupancy so a partial tile list cannot keep leftover roads.
    sim.map.forEach((tile) => tile.clearOccupancy());

    for (const saved of save.tiles) {
      const tile = sim.map.getTile(saved.x, saved.y);
      if (!tile) continue;
      tile.terrain       = saved.terrain    ?? tile.terrain;
      tile.roadType      = saved.roadType   ?? 0;
      tile.zoneType      = saved.zoneType   ?? 0;
      tile.buildingId    = saved.buildingId ?? null;
      tile.neglectMonths = saved.neglectMonths ?? 0;
    }

    sim.growth.buildings.clear();
    for (const saved of save.buildings) {
      sim.growth.buildings.set(
        tileKey(saved.x, saved.y),
        { defId: saved.defId, x: saved.x, y: saved.y },
      );
    }
    SaveCodec._reconcileBuildings(sim);
    // How long each building has outgrown its lot, so a load shrinks it when the
    // unsaved city would have.
    sim.growth.restoreOutgrownMonths(
      save.tiles
        .filter((t) => (t.outgrownMonths ?? 0) > 0 && t.buildingId)
        .map((t) => ({ x: t.x, y: t.y, months: t.outgrownMonths! })),
    );

    // ── Stats ────────────────────────────────────────────────────────────────
    const s = save.stats;
    sim.stats.population        = s.population        ?? 0;
    sim.stats.jobs              = s.jobs              ?? 0;
    sim.stats.money             = s.money             ?? 10_000;
    sim.stats.residentialDemand = s.residentialDemand ?? 0;
    sim.stats.commercialDemand  = s.commercialDemand  ?? 0;
    sim.stats.industrialDemand  = s.industrialDemand  ?? 20;
    sim.stats.resTaxRate        = s.resTaxRate        ?? 9;
    sim.stats.comTaxRate        = s.comTaxRate        ?? 9;
    sim.stats.indTaxRate        = s.indTaxRate        ?? 9;
    sim.stats.monthlyIncome     = s.monthlyIncome     ?? 0;
    sim.stats.monthlyExpenses   = s.monthlyExpenses   ?? 0;
    sim.stats.serviceExpenses   = s.serviceExpenses   ?? 0;
    sim.stats.projectedIncome   = s.projectedIncome   ?? sim.stats.monthlyIncome;
    sim.stats.projectedExpenses = s.projectedExpenses ?? sim.stats.monthlyExpenses;
    sim.stats.bankruptcyWarning = s.bankruptcyWarning ?? false;
    sim.stats.happiness         = s.happiness         ?? 100;
    sim.stats.walkability       = s.walkability       ?? 0;
    sim.stats.transitAccess     = s.transitAccess     ?? 0;
    sim.stats.pollutionAverage  = s.pollutionAverage  ?? 0;
    sim.stats.crimeAverage      = s.crimeAverage      ?? 0;
    sim.stats.fireAverage       = s.fireAverage       ?? 0;
    sim.stats.waterAverage      = s.waterAverage      ?? 0;
    sim.stats.approval          = s.approval          ?? 100;
    sim.stats.advisory          = s.advisory          ?? '';
    sim.stats.powerHeld         = s.powerHeld         ?? 0;
    sim.stats.milestones        = Number.isFinite(s.milestones)
      ? Math.max(0, Math.min(MILESTONES.length, Math.floor(s.milestones!)))
      : milestonesByPopulation(s.population ?? 0);
    const count = (n: number | undefined): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0);
    sim.stats.debtMonths        = count(s.debtMonths);
    sim.stats.councilCuts       = s.councilCuts === true;
    sim.stats.bailoutOffered    = s.bailoutOffered === true;
    sim.stats.bailoutMonths     = count(s.bailoutMonths);
    sim.stats.bailouts          = count(s.bailouts);
    const hold = s.advisoryHold;
    sim.evaluation.hold = hold && typeof hold.id === 'string' && Number.isFinite(hold.since)
      ? {
        id: hold.id,
        since: hold.since,
        ...(typeof hold.message === 'string' ? { message: hold.message } : {}),
        ...(hold.at && Number.isFinite(hold.at.x) && Number.isFinite(hold.at.y) ? { at: { x: hold.at.x, y: hold.at.y } } : {}),
      }
      : null;

    sim.restoreLevers(save.levers ?? {});

    // ── Clock ────────────────────────────────────────────────────────────────
    sim.clock.restore(save.clockTotalSeconds ?? 0);
    sim.growth.restoreMonthProgress(save.clockTotalSeconds ?? 0, save.monthAccumulator);
    sim.terrainSeed = typeof save.terrainSeed === 'number' ? save.terrainSeed : DEFAULT_TERRAIN_SEED;
  }

  /**
   * Buildings registry is authoritative for defId at a coordinate.
   * Tiles that still name a building missing from the registry are added back.
   */
  private static _reconcileBuildings(sim: CitySim): void {
    for (const instance of sim.growth.buildings.values()) {
      const tile = sim.map.getTile(instance.x, instance.y);
      if (tile) tile.buildingId = instance.defId;
    }
    sim.map.forEach((tile) => {
      if (tile.buildingId === null) return;
      const key = tileKey(tile.x, tile.y);
      if (!sim.growth.buildings.has(key)) {
        sim.growth.buildings.set(key, { defId: tile.buildingId, x: tile.x, y: tile.y });
      }
    });
  }

  // ── Migration ──────────────────────────────────────────────────────────────

  /**
   * Upgrade a raw parsed JSON value to the current SaveGame schema.
   *
   * Each `case` should transform data from the previous version to the next.
   * Add new cases here whenever SAVE_VERSION is incremented.
   *
   * Returns `null` when the data is unrecognisable or unrecoverably corrupt.
   */
  static migrate(raw: unknown): SaveGame | null {
    if (typeof raw !== 'object' || raw === null) return null;

    const data = raw as Record<string, unknown>;

    // ── v1 → current (no changes needed yet) ──────────────────────────────
    if (data['version'] === 1) {
      // Basic structural validation: require the arrays and map dimensions.
      if (!Array.isArray(data['tiles']) || !Array.isArray(data['buildings'])) {
        console.warn('[SaveCodec] Save data is missing required tile/building arrays.');
        return null;
      }
      if (typeof data['mapWidth'] !== 'number' || typeof data['mapHeight'] !== 'number') {
        console.warn('[SaveCodec] Save data is missing map dimensions.');
        return null;
      }
      return data as unknown as SaveGame;
    }

    // Unknown / future version — reject gracefully.
    console.warn(`[SaveCodec] Unrecognised save version: ${String(data['version'])}`);
    return null;
  }
}
