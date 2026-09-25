// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import type { CityMap } from './CityMap';
import type { CityTile } from './CityTile';
import { ZoneType } from './CityTile';
import { POLLUTION_STRESS_THRESHOLD, smogStresses } from './zoneGrowthHints';

/**
 * What a new source of smog would do to the homes and shops around it, before
 * it is built: the plant tool's hover and the factory area preview use it so
 * a player sees the smog before the town stalls in it. Smog spreads the way
 * PollutionSystem spreads it (strength × (1 − distance / (radius + 1)) within
 * the radius), added to what each tile breathes now.
 */

/** Smog a lot notices: less than this is a haze nobody moves out over. */
export const SMOG_NOTICED = 10;

export interface SmogTile extends TileCoord {
  /** The smog this source would add here. */
  readonly added: number;
  /** Past the level that drives homes and shops out (with the smog already here). */
  readonly drivesOut: boolean;
}

export interface SmogReach {
  /** Homes and shops (built or zoned) the smog would reach noticeably. */
  readonly tiles: readonly SmogTile[];
  /** Of those, homes (housing and mixed use). */
  readonly homes: number;
  /** Homes and shops it would push past the level that drives them out. */
  readonly drivenOut: number;
}

/** Lots smog troubles: homes, shops, and mixed use, built or zoned (factories do not mind). */
function troubledBySmog(tile: CityTile): boolean {
  return tile.zoneType !== ZoneType.None && smogStresses(tile.zoneType);
}

function isHome(tile: CityTile): boolean {
  return tile.zoneType === ZoneType.Residential || tile.zoneType === ZoneType.MixedUse;
}

/**
 * The smog `sources` (each at `strength`, spreading `radius` tiles) would add
 * to the homes and shops around them. Lots in `exclude` (the sources' own
 * lots) are left out.
 */
export function smogReach(
  map: CityMap,
  sources: readonly TileCoord[],
  strength: number,
  radius: number,
  exclude: ReadonlySet<string> = new Set(),
): SmogReach {
  const added = new Map<number, number>();
  if (strength > 0 && radius > 0) {
    for (const source of sources) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > radius * radius) continue;
          const x = source.x + dx;
          const y = source.y + dy;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const amount = Math.round(strength * Math.max(0, 1 - Math.sqrt(d2) / (radius + 1)));
          if (amount <= 0) continue;
          const i = y * map.width + x;
          added.set(i, (added.get(i) ?? 0) + amount);
        }
      }
    }
  }
  const tiles: SmogTile[] = [];
  let homes = 0;
  let drivenOut = 0;
  for (const [i, amount] of added) {
    if (amount < SMOG_NOTICED) continue;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (exclude.has(`${x},${y}`)) continue;
    const tile = map.getTile(x, y);
    if (!tile || !troubledBySmog(tile)) continue;
    const drivesOut = tile.pollution + amount >= POLLUTION_STRESS_THRESHOLD;
    tiles.push({ x, y, added: amount, drivesOut });
    if (isHome(tile)) homes += 1;
    if (drivesOut) drivenOut += 1;
  }
  return { tiles, homes, drivenOut };
}

/** "its smog would reach 12 homes and push 3 lots out", or null when it troubles nobody. */
export function formatSmogReach(reach: SmogReach, what: string): string | null {
  if (reach.tiles.length === 0) return null;
  const lots = reach.tiles.length;
  const reached = reach.homes > 0
    ? `${reach.homes} home${reach.homes === 1 ? '' : 's'}${lots > reach.homes ? ` and ${lots - reach.homes} shop lot${lots - reach.homes === 1 ? '' : 's'}` : ''}`
    : `${lots} shop lot${lots === 1 ? '' : 's'}`;
  const out = reach.drivenOut > 0
    ? `, enough to drive ${reach.drivenOut} out`
    : '';
  return `${what} smog would reach ${reached}${out}`;
}
