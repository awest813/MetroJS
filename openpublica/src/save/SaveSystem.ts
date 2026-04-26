// ⚠️  This file must NOT import anything from @babylonjs/core.
//     All simulation logic must remain renderer-agnostic.

import type { CitySim } from '../sim/CitySim';
import { SaveCodec } from './SaveCodec';
import type { SaveGame } from './SaveGame';

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
   * Returns `true` when a save was found and applied, `false` when there is
   * no save or the data could not be parsed.
   */
  static load(sim: CitySim): boolean {
    const save = SaveSystem.loadRaw();
    if (!save) {
      console.info('[SaveSystem] No save found.');
      return false;
    }
    SaveCodec.decode(save, sim);
    console.info('[SaveSystem] Game loaded.');
    return true;
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
