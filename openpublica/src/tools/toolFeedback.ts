// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { ROAD_COST } from './RoadTool';
import { TROLLEY_AVENUE_COST } from './TrolleyAvenueTool';
import { ZONE_COST } from './ZoneBrushTool';
import { BULLDOZE_COST } from './BulldozeTool';
import { POWER_PLANT_COST } from './PlacePowerPlantTool';
import { PARK_COST } from './PlaceParkTool';
import { POLICE_STATION_COST } from './PlacePoliceStationTool';
import { FIRE_STATION_COST } from './PlaceFireStationTool';
import { WATER_TOWER_COST } from './PlaceWaterTowerTool';

import type { StrokeSummary } from './ToolController';

/** Status line for the stroke that just ended. Null when nothing was spent or cut. */
export function formatStrokeStatus(toolLabel: string, stroke: StrokeSummary): string | null {
  const cut = stroke.blockedByWater > 0 && stroke.applied > 0;
  if (stroke.spent <= 0 && !cut) return null;
  const name = toolLabel.replace(/^[^\w]+/, '').trim() || toolLabel;
  const spent = `$${Math.round(stroke.spent).toLocaleString()}`;
  if (stroke.spent > 0 && cut) return `${name} spent ${spent}. The street was cut by water.`;
  if (cut) return 'The street was cut by water.';
  return `${name} spent ${spent}.`;
}

function fundsLine(need: number, have: number): string {
  return `Need $${need.toLocaleString()} (have $${have.toLocaleString()})`;
}

/** Player-facing reason a tool did not change the tile. */
export function explainToolFailure(
  toolName: string,
  coord: TileCoord,
  sim: CitySim,
): string {
  const tile = sim.getTile(coord.x, coord.y);
  if (!tile) return 'Off the map.';

  if (tile.terrain === TerrainType.Water && toolName !== 'inspect' && toolName !== 'bulldoze') {
    return 'Cannot build on water.';
  }

  switch (toolName) {
    case 'road':
      if (tile.buildingId !== null) return 'Clear the building before paving.';
      if (tile.roadType === RoadType.Street) return 'Already a street.';
      if (!sim.canAfford(ROAD_COST[RoadType.Street])) {
        return fundsLine(ROAD_COST[RoadType.Street], sim.stats.money);
      }
      return 'Could not place a street here.';

    case 'highway':
      if (tile.buildingId !== null) return 'Clear the building before paving.';
      if (tile.roadType === RoadType.Highway) return 'Already a highway.';
      if (!sim.canAfford(ROAD_COST[RoadType.Highway])) {
        return fundsLine(ROAD_COST[RoadType.Highway], sim.stats.money);
      }
      return 'Could not place a highway here.';

    case 'trolleyAvenue':
      if (tile.buildingId !== null) return 'Clear the building before paving.';
      if (tile.roadType === RoadType.TrolleyAvenue) return 'Already a trolley avenue.';
      if (!sim.canAfford(TROLLEY_AVENUE_COST)) {
        return fundsLine(TROLLEY_AVENUE_COST, sim.stats.money);
      }
      return 'Could not place a trolley avenue here.';

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

    default:
      return 'Nothing happened.';
  }
}
