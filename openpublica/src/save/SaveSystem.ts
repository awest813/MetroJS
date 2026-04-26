// SaveSystem — placeholder for Phase 2 implementation.
// Will serialize GameMap state to JSON and persist via localStorage or IndexedDB.

import type { GameMap } from '../sim/GameMap';

export class SaveSystem {
  private static readonly _STORAGE_KEY = 'openpublica_save_v1';

  /** Serialize the map to a JSON string and store it. (Phase 2 — not yet implemented.) */
  static save(_map: GameMap): void {
    console.info('[SaveSystem] save() — not yet implemented (Phase 2)');
  }

  /** Load a previously saved map.  Returns null if no save exists. (Phase 2 — not yet implemented.) */
  static load(): GameMap | null {
    void localStorage.getItem(SaveSystem._STORAGE_KEY);
    console.info('[SaveSystem] load() — not yet implemented (Phase 2)');
    return null;
  }
}
