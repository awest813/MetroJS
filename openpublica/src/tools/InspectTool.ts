import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';

/** Reads and displays tile information. Does not modify the map. */
export class InspectTool implements Tool {
  readonly name = 'inspect';
  readonly label = '🔍 Inspect';

  apply(coord: TileCoord, sim: CitySim): boolean {
    const tile = sim.getTile(coord.x, coord.y);
    if (tile) {
      console.info(
        `[Inspect] (${tile.x}, ${tile.y}) ` +
        `terrain=${tile.terrain} road=${tile.roadType} zone=${tile.zoneType} ` +
        `building=${tile.buildingId ?? 'none'} ` +
        `powered=${tile.powered} watered=${tile.watered} ` +
        `landValue=${tile.landValue} pollution=${tile.pollution} ` +
        `traffic=${tile.trafficPressure}`,
      );
    }
    return false; // inspect never mutates
  }
}
