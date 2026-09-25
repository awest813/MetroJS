// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { RoadTool, type RoadToolBlock } from './RoadTool';
import { ZONE_COST } from './ZoneBrushTool';
import { BULLDOZE_COST } from './BulldozeTool';
import {
  FIRE_STATION_COST,
  PARK_COST,
  POLICE_STATION_COST,
  POWER_PLANT_COST,
  WATER_TOWER_COST,
  serviceSpecForTool,
} from './serviceCatalog';

import type { StrokeSummary } from './ToolController';

/** Status line for the stroke that just ended. Null when nothing was spent or cut. */
export function formatStrokeStatus(toolLabel: string, stroke: StrokeSummary): string | null {
  const name = toolLabel.replace(/^[^\w]+/, '').trim() || toolLabel;
  const parts: string[] = [];
  if (stroke.spent > 0) {
    const spent = `$${Math.round(stroke.spent).toLocaleString()}`;
    const bridges = stroke.bridged > 0
      ? ` — ${stroke.bridged} bridge tile${stroke.bridged === 1 ? '' : 's'}`
      : '';
    parts.push(`${name} spent ${spent}${bridges}.`);
  }
  if (stroke.applied > 0 && stroke.blockedByBridge > 0) {
    parts.push('Bridges run straight — drag straight across the water.');
  }
  if (stroke.applied > 0 && stroke.blockedByFunds > 0) {
    parts.push('Ran out of money partway.');
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function fundsLine(need: number, have: number): string {
  return `Need $${need.toLocaleString()} (have $${have.toLocaleString()})`;
}

const ROAD_TOOL_TYPES: Readonly<Record<string, RoadType>> = {
  road: RoadType.Street,
  highway: RoadType.Highway,
  trolleyAvenue: RoadType.TrolleyAvenue,
};

const ROAD_NOUN: Record<RoadType, string> = {
  [RoadType.None]:          'road',
  [RoadType.Street]:        'street',
  [RoadType.Highway]:       'highway',
  [RoadType.TrolleyAvenue]: 'trolley avenue',
};

function explainRoadFailure(tool: RoadTool, coord: TileCoord, sim: CitySim): string {
  const tile = sim.getTile(coord.x, coord.y);
  const block: RoadToolBlock | null = tool.blockAt(coord, sim);
  const noun = ROAD_NOUN[tool.roadType];
  const bridge = tile?.terrain === TerrainType.Water;
  switch (block) {
    case 'off-map':
      return 'Off the map.';
    case 'building':
      return 'Clear the building before paving.';
    case 'same':
      return bridge ? `Already a ${noun} bridge.` : `Already a ${noun}.`;
    case 'replace': {
      if (tool.roadType === RoadType.TrolleyAvenue && tile?.roadType === RoadType.Highway) {
        return 'Trolley lines cross a highway at grade — lay the line up to it on both sides.';
      }
      const existing = tile ? ROAD_NOUN[tile.roadType] : 'road';
      return `Already a ${existing} — bulldoze it first to lay a ${noun}.`;
    }
    case 'bridge-turn':
      return 'Bridges run straight — no turns or junctions over water.';
    case 'bridge-branch':
      return 'Nothing can join a bridge from the side — connect at its ends.';
    case 'bridge-stranded':
      return 'Bridges start from a road — drag from the shore straight across the water.';
    case 'funds': {
      const need = tool.costAt(coord, sim);
      if (!bridge) return fundsLine(need, sim.stats.money);
      return `Need $${need.toLocaleString()} for a bridge tile (have $${sim.stats.money.toLocaleString()})`;
    }
    default:
      return bridge ? 'Could not bridge the water here.' : `Could not place a ${noun} here.`;
  }
}

/** Player-facing reason a tool did not change the tile. */
export function explainToolFailure(
  toolName: string,
  coord: TileCoord,
  sim: CitySim,
): string {
  const tile = sim.getTile(coord.x, coord.y);
  if (!tile) return 'Off the map.';

  const roadType = ROAD_TOOL_TYPES[toolName];
  if (roadType !== undefined) return explainRoadFailure(new RoadTool(roadType), coord, sim);

  if (tile.terrain === TerrainType.Water && toolName !== 'inspect' && toolName !== 'bulldoze') {
    return 'Cannot build on water.';
  }

  switch (toolName) {

    case 'zoneResidentialLow':
    case 'zoneCommercialLow':
    case 'zoneIndustrialLight':
    case 'zoneMixedUse':
      if (tile.zoneType === ZoneType.Residential && toolName === 'zoneResidentialLow') {
        return 'Already this zone.';
      }
      if (tile.zoneType === ZoneType.Commercial && toolName === 'zoneCommercialLow') {
        return 'Already this zone.';
      }
      if (tile.zoneType === ZoneType.Industrial && toolName === 'zoneIndustrialLight') {
        return 'Already this zone.';
      }
      if (tile.zoneType === ZoneType.MixedUse && toolName === 'zoneMixedUse') {
        return 'Already this zone.';
      }
      if (tile.buildingId !== null) return 'Bulldoze the building before rezoning.';
      if (tile.roadType !== RoadType.None) {
        return 'Zone the empty lot beside the street, not the road.';
      }
      if (!sim.canAfford(ZONE_COST)) return fundsLine(ZONE_COST, sim.stats.money);
      return 'Could not zone this lot.';

    case 'zoneClear':
      if (tile.zoneType === ZoneType.None) return 'Nothing to dezone.';
      if (tile.buildingId !== null) return 'Bulldoze the building before dezoning.';
      return 'Could not dezone this lot.';

    case 'bulldoze': {
      const empty =
        tile.roadType === RoadType.None &&
        tile.zoneType === ZoneType.None &&
        tile.buildingId === null;
      if (empty) return 'Nothing to bulldoze.';
      if (!sim.canAfford(BULLDOZE_COST)) return fundsLine(BULLDOZE_COST, sim.stats.money);
      return 'Could not bulldoze.';
    }

    case 'placePowerPlant':
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return 'Clear the road before placing a plant.';
      if (!sim.canAfford(POWER_PLANT_COST)) return fundsLine(POWER_PLANT_COST, sim.stats.money);
      return 'Could not place a power plant.';

    case 'placePark':
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return 'Clear the road before placing a park.';
      if (!sim.canAfford(PARK_COST)) return fundsLine(PARK_COST, sim.stats.money);
      return 'Could not place a park.';

    case 'placePoliceStation':
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return 'Clear the road before placing a station.';
      if (!sim.canAfford(POLICE_STATION_COST)) {
        return fundsLine(POLICE_STATION_COST, sim.stats.money);
      }
      return 'Could not place a police station.';

    case 'placeFireStation':
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return 'Clear the road before placing a station.';
      if (!sim.canAfford(FIRE_STATION_COST)) {
        return fundsLine(FIRE_STATION_COST, sim.stats.money);
      }
      return 'Could not place a fire station.';

    case 'placeWaterTower':
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return 'Clear the road before placing a tower.';
      if (!sim.canAfford(WATER_TOWER_COST)) {
        return fundsLine(WATER_TOWER_COST, sim.stats.money);
      }
      return 'Could not place a water tower.';

    case 'placeWaterPump':
    case 'placePolicePost':
    case 'placeFireHall': {
      const spec = serviceSpecForTool(toolName)!;
      if (tile.buildingId !== null) return 'That lot already has a building.';
      if (tile.roadType !== RoadType.None) return `Clear the road before placing a ${spec.label.toLowerCase()}.`;
      if (!sim.canAfford(spec.cost)) return fundsLine(spec.cost, sim.stats.money);
      return `Could not place a ${spec.label.toLowerCase()}.`;
    }

    default:
      return 'Nothing happened.';
  }
}
