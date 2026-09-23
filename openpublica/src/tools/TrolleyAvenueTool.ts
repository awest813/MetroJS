// ⚠️  This file must NOT import anything from @babylonjs/core.
//     Tool logic is renderer-agnostic; the renderer reacts via onTileChanged.

import { RoadType } from '../sim/CityTile';
import { ROAD_COST, RoadTool } from './RoadTool';

/**
 * Cost in city funds to place one trolley avenue tile on land.
 * Higher than a normal street ($10) to reflect track and overhead wire
 * installation. Over water it is a bridge at the usual multiplier.
 */
export const TROLLEY_AVENUE_COST = ROAD_COST[RoadType.TrolleyAvenue];

/**
 * Placement tool for trolley / streetcar avenues.
 *
 * Paints `RoadType.TrolleyAvenue`, upgrading streets it crosses. A line needs
 * a few connected tiles before a trolley runs it (see TransitSystem).
 *
 * Monthly maintenance ($5/tile) is handled separately by EconomySystem.
 */
export class TrolleyAvenueTool extends RoadTool {
  constructor() {
    super(RoadType.TrolleyAvenue);
  }
}
