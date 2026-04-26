// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { ZoneType } from '../sim/CityTile';

/** Cost in city funds to zone one tile (any zone type). */
export const ZONE_COST = 5;

/** Tool names for each zone mode — usable as toolbar keys. */
export const ZONE_TOOL_NAMES = {
  [ZoneType.Residential]: 'zoneResidentialLow',
  [ZoneType.Commercial]:  'zoneCommercialLow',
  [ZoneType.Industrial]:  'zoneIndustrialLight',
  [ZoneType.None]:        'zoneClear',
} as const;

/** Labels shown in the toolbar for each zone type. */
const ZONE_LABELS: Record<ZoneType, string> = {
  [ZoneType.None]:        '✖ Clear Zone',
  [ZoneType.Residential]: '🏠 Residential',
  [ZoneType.Commercial]:  '🏢 Commercial',
  [ZoneType.Industrial]:  '🏭 Industrial',
};

/**
 * A brush tool that paints a specific zone type onto tiles.
 * Supports click-and-drag placement over multiple tiles.
 * Deducts ZONE_COST per tile; rejects if funds are insufficient.
 */
export class ZoneBrushTool implements Tool {
  readonly name: string;
  readonly label: string;
  private readonly _zoneType: ZoneType;

  constructor(zoneType: ZoneType) {
    this._zoneType = zoneType;
    this.name      = ZONE_TOOL_NAMES[zoneType];
    this.label     = ZONE_LABELS[zoneType];
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return false;

    // Skip if tile already has the correct zone — no cost, no mutation.
    if (tile.zoneType === this._zoneType) return false;

    const cost = this._zoneType === ZoneType.None ? 0 : ZONE_COST;
    if (cost > 0 && !sim.deductMoney(cost)) {
      console.warn(
        `[ZoneBrush] Insufficient funds (need $${cost}, have $${sim.stats.money})`,
      );
      return false;
    }

    sim.setZone(coord.x, coord.y, this._zoneType);
    return true;
  }
}

// ── Convenience factories ─────────────────────────────────────────────────────

/** Low-density residential zone brush. */
export function createResidentialLowBrush(): ZoneBrushTool {
  return new ZoneBrushTool(ZoneType.Residential);
}

/** Low-density commercial zone brush. */
export function createCommercialLowBrush(): ZoneBrushTool {
  return new ZoneBrushTool(ZoneType.Commercial);
}

/** Light industrial zone brush. */
export function createIndustrialLightBrush(): ZoneBrushTool {
  return new ZoneBrushTool(ZoneType.Industrial);
}
