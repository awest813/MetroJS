// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CitySim } from '../sim/CitySim';
import { SaveCodec } from './SaveCodec';
import type { SaveGame } from './SaveGame';

/** Outcome of trying to load a save into a live CitySim. */
export type SaveLoadStatus = 'loaded' | 'missing' | 'invalid' | 'size-mismatch';

/**
 * Persists and restores city state via localStorage.
 *
 * Storage key is versioned so a future format change can coexist with
 * old saves under a different key without corrupting them.
 */
export class SaveSystem {
  private static readonly _STORAGE_KEY = 'openpublica_save_v1';

  /** Serialise the sim state to JSON and write it to localStorage. */
  static save(sim: CitySim): void {
    const data = SaveCodec.encode(sim);
    localStorage.setItem(SaveSystem._STORAGE_KEY, JSON.stringify(data, null, 2));
    console.info('[SaveSystem] Game saved.');
  }

  /**
   * Parse the raw localStorage entry and run migrations.
   * Returns the migrated SaveGame, or null if nothing is stored or the data
   * is unrecognisable.
   */
  static loadRaw(): SaveGame | null {
    const raw = localStorage.getItem(SaveSystem._STORAGE_KEY);
    if (!raw) return null;
    try {
      return SaveCodec.migrate(JSON.parse(raw) as unknown);
    } catch (e) {
      console.warn('[SaveSystem] Failed to parse save data:', e);
      return null;
    }
  }

  /**
   * Load a previously saved city into an existing CitySim instance in-place.
   * Coverage, power, and overlays are recomputed after decode so load is not
   * a month of darkness.
   */
  static load(sim: CitySim): SaveLoadStatus {
    const raw = localStorage.getItem(SaveSystem._STORAGE_KEY);
    if (!raw) {
      console.info('[SaveSystem] No save found.');
      return 'missing';
    }
    let save: SaveGame | null = null;
    try {
      save = SaveCodec.migrate(JSON.parse(raw) as unknown);
    } catch (e) {
      console.warn('[SaveSystem] Failed to parse save data:', e);
      return 'invalid';
    }
    if (!save) {
      console.warn('[SaveSystem] Save data is unrecognisable.');
      return 'invalid';
    }
    if (save.mapWidth !== sim.map.width || save.mapHeight !== sim.map.height) {
      console.warn(
        `[SaveSystem] Save map is ${save.mapWidth}×${save.mapHeight}, city is ${sim.map.width}×${sim.map.height}.`,
      );
      return 'size-mismatch';
    }
    SaveCodec.decode(save, sim);
    sim.refreshDerivedState({
      applyCrimeHappiness: true,
      notify: false,
      includeMonthlyOverlays: true,
    });
    console.info('[SaveSystem] Game loaded.');
    return 'loaded';
  }

  /** Returns `true` when a save entry exists in localStorage. */
  static hasSave(): boolean {
    return localStorage.getItem(SaveSystem._STORAGE_KEY) !== null;
  }

  /** Remove the save entry from localStorage. */
  static deleteSave(): void {
    localStorage.removeItem(SaveSystem._STORAGE_KEY);
    console.info('[SaveSystem] Save deleted.');
  }
}
