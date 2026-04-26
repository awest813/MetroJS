// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CitySim } from '../sim/CitySim';
import { tileKey } from '../sim/ZoneGrowthSystem';
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
      tiles.push({
        x:          tile.x,
        y:          tile.y,
        terrain:    tile.terrain,
        roadType:   tile.roadType,
        zoneType:   tile.zoneType,
        buildingId: tile.buildingId,
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
        bankruptcyWarning: sim.stats.bankruptcyWarning,
        happiness:         sim.stats.happiness,
        walkability:       sim.stats.walkability,
        transitAccess:     sim.stats.transitAccess,
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
    // ── Tiles ────────────────────────────────────────────────────────────────
    for (const saved of save.tiles) {
      const tile = sim.map.getTile(saved.x, saved.y);
      if (!tile) continue;
      tile.terrain    = saved.terrain    ?? tile.terrain;
      tile.roadType   = saved.roadType   ?? 0;
      tile.zoneType   = saved.zoneType   ?? 0;
      tile.buildingId = saved.buildingId ?? null;
    }

    // ── Buildings registry ───────────────────────────────────────────────────
    sim.growth.buildings.clear();
    for (const saved of save.buildings) {
      sim.growth.buildings.set(
        tileKey(saved.x, saved.y),
        { defId: saved.defId, x: saved.x, y: saved.y },
      );
    }

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
    sim.stats.bankruptcyWarning = s.bankruptcyWarning ?? false;
    sim.stats.happiness         = s.happiness         ?? 100;
    sim.stats.walkability       = s.walkability       ?? 0;
    sim.stats.transitAccess     = s.transitAccess     ?? 0;

    // ── Clock ────────────────────────────────────────────────────────────────
    sim.clock.restore(save.clockTotalSeconds ?? 0);
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
      return data as unknown as SaveGame;
    }

    // Unknown / future version — reject gracefully.
    console.warn(`[SaveCodec] Unrecognised save version: ${String(data['version'])}`);
    return null;
  }
}
