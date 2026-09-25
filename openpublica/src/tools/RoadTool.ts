// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType } from '../sim/CityTile';
import { ROAD_STEPS, isRoadTile } from '../sim/roadConnections';
import type { CityMap } from '../sim/CityMap';

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

/**
 * What paving `type` over a tile that holds `existing` costs: the full price
 * on open ground, and only the difference when upgrading a street (its own
 * price was paid when it was laid).
 */
export function roadPaveCost(type: RoadType, existing: RoadType, overWater: boolean): number {
  return Math.max(0, roadBuildCost(type, overWater) - roadBuildCost(existing, overWater));
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
  /** A new bridge span would stand alone in the water, joined to no road. */
  | 'bridge-stranded'
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
  [RoadType.TrolleyAvenue]: 'Trolley Ave',
};

/**
 * True when a new road over water at (x, y) would stand alone: no road, laid
 * or `planned`, on any side. Bridges are laid out from a road on the shore,
 * so a stroke that staggers across a lake, or a line drawn out in the water,
 * does not leave spans floating there unconnected.
 */
export function strandedSpan(
  map: CityMap,
  x: number,
  y: number,
  planned: (x: number, y: number) => boolean = () => false,
): boolean {
  const tile = map.getTile(x, y);
  if (!tile || tile.terrain !== TerrainType.Water || tile.roadType !== RoadType.None) return false;
  return !ROAD_STEPS.some(([dx, dy]) => isRoadTile(map, x + dx, y + dy) || planned(x + dx, y + dy));
}

/**
 * Paves one road tile and deducts the cost. Over water the tile is a bridge
 * at {@link BRIDGE_COST_MULTIPLIER}× the price; bridges run straight and
 * start from a road ({@link strandedSpan}).
 *
 * Painting a highway or trolley avenue over a street upgrades it for the
 * difference in price. Nothing paints over a highway or trolley line, so a
 * street dragged across one leaves an intersection instead of a downgraded
 * gap, and a trolley line dragged over a highway crosses it at grade.
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

  /** What this tile would cost to pave, bridge surcharge included; an upgrade pays the difference. */
  costAt(coord: TileCoord, sim: CitySim): number {
    const tile = sim.getTile(coord.x, coord.y);
    return roadPaveCost(this.roadType, tile?.roadType ?? RoadType.None, tile?.terrain === TerrainType.Water);
  }

  blockAt(coord: TileCoord, sim: CitySim): RoadToolBlock | null {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return 'off-map';
    if (tile.buildingId !== null) return 'building';
    if (tile.roadType === this.roadType) return 'same';
    if (tile.roadType !== RoadType.None && tile.roadType !== RoadType.Street) return 'replace';
    const block = sim.roadPlacementBlock(coord.x, coord.y);
    if (block !== null) return block;
    if (strandedSpan(sim.map, coord.x, coord.y)) return 'bridge-stranded';
    if (!sim.canAfford(this.costAt(coord, sim))) return 'funds';
    return null;
  }

  canApply(coord: TileCoord, sim: CitySim): boolean {
    return this.blockAt(coord, sim) === null;
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    // The stroke summary and status line report why a tile was skipped.
    if (this.blockAt(coord, sim) !== null) return false;
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
