import { TerrainType, RoadType, ZoneType } from '../sim/CityTile';
import type { CityTile } from '../sim/CityTile';

const TERRAIN: Record<TerrainType, string> = {
  [TerrainType.Grass]: 'Grass',
  [TerrainType.Water]: 'Water',
  [TerrainType.Dirt]:  'Dirt',
};

const ROAD: Record<RoadType, string> = {
  [RoadType.None]:          'No road',
  [RoadType.Street]:        'Street',
  [RoadType.Highway]:       'Highway',
  [RoadType.TrolleyAvenue]: 'Trolley',
};

const ZONE: Record<ZoneType, string> = {
  [ZoneType.None]:        'Unzoned',
  [ZoneType.Residential]: 'Residential',
  [ZoneType.Commercial]:  'Commercial',
  [ZoneType.Industrial]:  'Industrial',
  [ZoneType.MixedUse]:    'Mixed-use',
};

export function prettyDefId(defId: string): string {
  return defId.replace(/_/g, ' ');
}

/**
 * One-line inspect copy for the status bar. Omits money/pop (those live in the HUD).
 */
export function formatInspectStatus(
  toolLabel: string,
  tile: CityTile | undefined,
  buildingId: string | null,
  growthHint?: string | null,
): string {
  const parts: string[] = [toolLabel.replace(/^[^\w]+/, '').trim() || toolLabel];
  if (!tile) {
    parts.push('off map');
    return parts.join('  ·  ');
  }

  parts.push(`${tile.x}, ${tile.y}`);
  parts.push(TERRAIN[tile.terrain] ?? 'Terrain');
  if (tile.zoneType !== ZoneType.None) parts.push(ZONE[tile.zoneType]);
  if (tile.roadType !== RoadType.None) parts.push(ROAD[tile.roadType]);
  if (buildingId) {
    parts.push(prettyDefId(buildingId));
  } else if (tile.buildingId === 'small_park') {
    parts.push('park');
  }
  parts.push(`LV ${tile.landValue}`);
  if (tile.populationDensity > 0) parts.push(`density ${tile.populationDensity}`);
  if (tile.policeCoverage > 0) parts.push(`police ${tile.policeCoverage}`);
  if (tile.crime > 0) parts.push(`crime ${tile.crime}`);
  if (tile.pollution > 0) parts.push(`pollution ${tile.pollution}`);
  if (growthHint) parts.push(growthHint);
  return parts.join('  ·  ');
}
