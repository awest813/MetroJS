/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

// =============================================================================
// SYSTEM: Map Scanner (Tile Dispatch Engine)
// =============================================================================
// MapScanner iterates over every tile in the game map and dispatches to a
// registered list of (criterion → action) handlers. Subsystems register their
// handlers via addAction() during Simulation.init(); the scan itself is split
// across phases 1-8 of the simulation cycle, covering 1/8 of the map width
// per phase so that it does not block for too long in a single tick.
//
// During a scan of each tile:
//   1. If the tile value is >= FLOOD, its power conductivity is checked and
//      the power manager is asked to mark it as powered or not.
//   2. If the tile is a zone centre, the repair manager checks for decay, and
//      the census powered/unpowered zone counts are incremented.
//   3. Each registered action's criterion is tested (either a tile value
//      constant or a predicate function). The first matching action's handler
//      is called with (map, x, y, simData) and scanning moves to the next tile.
//
// Handlers are registered by: Commercial, EmergencyServices, Industrial,
// MiscTiles, PowerManager, Road, Residential, Stadia, Transport.
// =============================================================================

import { Tile } from "./tile.ts";
import { FLOOD } from "./tileValues.ts";

// Tile to be filled to avoid creating lots of GC-able objects
var tile = new Tile();


function MapScanner(map) {
  this._map = map;
  this._actions = [];
}


var isCallable = function(f) {
  return typeof(f) === 'function';
};


MapScanner.prototype.addAction = function(criterion, action) {
  this._actions.push({criterion: criterion, action: action});
};


MapScanner.prototype.mapScan = function(startX, maxX, simData) {
  for (var y = 0; y < this._map.height; y++) {
    for (var x = startX; x < maxX; x++) {
      this._map.getTile(x, y, tile);
      var tileValue = tile.getValue();

      if (tileValue < FLOOD)
        continue;

      if (tile.isConductive())
        simData.powerManager.setTilePower(x, y);

      if (tile.isZone()) {
        simData.repairManager.checkTile(x, y, simData.cityTime);
        var powered = tile.isPowered();
        if (powered)
          simData.census.poweredZoneCount += 1;
        else
          simData.census.unpoweredZoneCount += 1;
      }

      for (var i = 0, l = this._actions.length; i < l; i++) {
        var current = this._actions[i];
        var callable = isCallable(current.criterion);

        if (callable && current.criterion.call(null, tile)) {
          current.action.call(null, this._map, x, y, simData);
          break;
        } else if (!callable && current.criterion === tileValue) {
          current.action.call(null, this._map, x, y, simData);
          break;
        }
      }
    }
  }
};


export { MapScanner };
