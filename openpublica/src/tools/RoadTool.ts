// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType } from '../sim/CityTile';

/** Cost in city funds to place one road tile on land. */
export const ROAD_COST: Record<RoadType, number> = {
  [RoadType.None]:          0,
  [RoadType.Street]:        10,
  [RoadType.Highway]:       25,
  [RoadType.TrolleyAvenue]: 30,
};

/** A road tile over water is a bridge span and costs this many times the land price. */
export const BRIDGE_COST_MULTIPLIER = 5;

/** Build cost for one tile of `type`, as a bridge when `overWater`. */
export function roadBuildCost(type: RoadType, overWater: boolean): number {
  const land = ROAD_COST[type] ?? 0;
  return overWater ? land * BRIDGE_COST_MULTIPLIER : land;
}

/** Why a road tool left a tile alone, or null when it can pave it. */
export type RoadToolBlock =
  | 'off-map'
  | 'building'
  | 'same'
  /** A highway or trolley line is only replaced after a bulldoze. */
  | 'replace'
  | 'bridge-turn'
  | 'bridge-branch'
  | 'funds';

const TOOL_NAMES: Record<RoadType, string> = {
  [RoadType.None]:          'road',
  [RoadType.Street]:        'road',
  [RoadType.Highway]:       'highway',
  [RoadType.TrolleyAvenue]: 'trolleyAvenue',
};

const TOOL_LABELS: Record<RoadType, string> = {
  [RoadType.None]:          'Road',
  [RoadType.Street]:        'Road',
  [RoadType.Highway]:       'Highway',
  [RoadType.TrolleyAvenue]: '🚃 Trolley Ave',
};

/**
 * Paves one road tile and deducts the cost. Over water the tile is a bridge
 * at {@link BRIDGE_COST_MULTIPLIER}× the price, and bridges run straight.
 *
 * Painting a highway or trolley avenue over a street upgrades it. Nothing
 * paints over a highway or trolley line, so a street dragged across one
 * leaves an intersection instead of a downgraded gap.
 */
export class RoadTool implements Tool {
  readonly name: string;
  readonly label: string;
  readonly stroke = true;
  readonly roadType: RoadType;

  constructor(roadType: RoadType = RoadType.Street) {
    this.roadType = roadType;
    this.name = TOOL_NAMES[roadType];
    this.label = TOOL_LABELS[roadType];
  }

  /** What this tile would cost to pave, bridge surcharge included. */
  costAt(coord: TileCoord, sim: CitySim): number {
    const tile = sim.getTile(coord.x, coord.y);
    return roadBuildCost(this.roadType, tile?.terrain === TerrainType.Water);
  }

  blockAt(coord: TileCoord, sim: CitySim): RoadToolBlock | null {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return 'off-map';
    if (tile.buildingId !== null) return 'building';
    if (tile.roadType === this.roadType) return 'same';
    if (tile.roadType !== RoadType.None && tile.roadType !== RoadType.Street) return 'replace';
    const block = sim.roadPlacementBlock(coord.x, coord.y);
    if (block !== null) return block;
    if (!sim.canAfford(this.costAt(coord, sim))) return 'funds';
    return null;
  }

  canApply(coord: TileCoord, sim: CitySim): boolean {
    return this.blockAt(coord, sim) === null;
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    const block = this.blockAt(coord, sim);
    if (block !== null) {
      if (block === 'funds') {
        const cost = this.costAt(coord, sim);
        console.warn(`[${this.label}] Insufficient funds (need $${cost}, have $${sim.stats.money})`);
      }
      return false;
    }
    const cost = this.costAt(coord, sim);
    if (!sim.deductMoney(cost)) return false;
    if (!sim.placeRoad(coord.x, coord.y, this.roadType)) {
      sim.stats.money += cost;
      return false;
    }
    return true;
  }
}

/** Lets the controller and feedback ask a road tool why it skipped a tile. */
export function isRoadTool(tool: Tool): tool is RoadTool {
  return tool instanceof RoadTool;
}
