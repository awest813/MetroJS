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
// SYSTEM: Emergency Services (Police & Fire Stations)
// =============================================================================
// EmergencyServices registers map-scan handlers for police station and fire
// station tiles. When the scanner visits one of these tiles it:
//   1. Increments the relevant census counter (policeStationPop / fireStationPop).
//   2. Looks up the current budget effect level (policeEffect / fireEffect),
//      which reflects how well-funded the service is.
//   3. Halves the effect if the building is unpowered.
//   4. Halves the effect again if not connected to the road network.
//   5. Accumulates the resulting effect value into the corresponding block-map
//      (policeStationMap / fireStationMap).
//
// After the scan, BlockMapUtils.crimeScan() reads policeStationMap and spreads
// it via smoothing to produce policeStationEffectMap, which is then subtracted
// from the crime score of each neighbourhood. Likewise, BlockMapUtils.
// fireAnalysis() spreads fireStationMap to form fireStationEffectMap, which
// represents fire protection coverage.
//
// Budget effects are updated each tax period by Budget.updateFundEffects().
// =============================================================================

import { Position } from './position.ts';
import { FIRESTATION, POLICESTATION } from "./tileValues.ts";

var handleService = function(censusStat, budgetEffect, blockMap) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += 1;

    var effect = simData.budget[budgetEffect];
    var isPowered = map.getTile(x, y).isPowered();
    // Unpowered buildings are half as effective
    if (!isPowered)
      effect = Math.floor(effect / 2);

    var pos = new Position(x, y);
    var connectedToRoads = simData.trafficManager.findPerimeterRoad(pos);
    if (!connectedToRoads)
      effect = Math.floor(effect / 2);

    var currentEffect = simData.blockMaps[blockMap].worldGet(x, y);
    currentEffect += effect;
    simData.blockMaps[blockMap].worldSet(x, y, currentEffect);
  };
};


var policeStationFound = handleService('policeStationPop', 'policeEffect', 'policeStationMap');
var fireStationFound = handleService('fireStationPop', 'fireEffect', 'fireStationMap');


var EmergencyServices = {
  registerHandlers: function(mapScanner, repairManager) {
    mapScanner.addAction(POLICESTATION, policeStationFound);
    mapScanner.addAction(FIRESTATION, fireStationFound);
  }
};


export { EmergencyServices };
