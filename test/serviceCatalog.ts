import { CityMap } from '../openpublica/src/sim/CityMap';
import { coverageAtDistance, forEachTileInRadius } from '../openpublica/src/sim/coveragePaint';
import {
  createServiceTools,
  formatServiceHint,
  POWER_PLANT_COST,
  serviceRadius,
  serviceSpecForTool,
} from '../openpublica/src/tools/serviceCatalog';
import { ZoneType } from '../openpublica/src/sim/CityTile';

describe('coveragePaint', () => {
  it('should visit tiles in a circular radius only', () => {
    const map = new CityMap(9, 9);
    const seen: string[] = [];
    forEachTileInRadius(map, 4, 4, 2, (tile, dist) => {
      seen.push(`${tile.x},${tile.y}:${dist}`);
    });
    expect(seen.some((s) => s.startsWith('4,4:'))).toBe(true);
    expect(seen.some((s) => s.startsWith('6,4:'))).toBe(true);
    expect(seen.some((s) => s.startsWith('7,4:'))).toBe(false);
  });

  it('should fall coverage off to zero at the rim', () => {
    expect(coverageAtDistance(0, 10)).toBe(100);
    expect(coverageAtDistance(10, 10)).toBe(0);
    expect(coverageAtDistance(5, 10)).toBe(50);
  });
});

describe('serviceCatalog', () => {
  it('should keep plant placement at $500', () => {
    expect(POWER_PLANT_COST).toBe(500);
    expect(serviceSpecForTool('placePowerPlant')?.defId).toBe('small_power_plant');
  });

  it('should build one tool per catalog spec', () => {
    expect(createServiceTools().map((tool) => tool.name)).toEqual([
      'placePowerPlant',
      'placePark',
      'placePoliceStation',
      'placeFireStation',
      'placeWaterTower',
    ]);
  });

  it('should describe dark stations vs live radii', () => {
    const police = {
      id: 'small_police_station',
      name: 'Police',
      zoneType: ZoneType.None,
      population: 0,
      jobs: 4,
      isService: true,
      policeRadius: 10,
    };
    expect(formatServiceHint(police, false)).toMatch(/coverage off/i);
    expect(formatServiceHint(police, true)).toBe('police reach 10 road tiles');
    expect(serviceRadius(police)).toBe(10);
  });

  it('should tell the player a station needs a street before it covers anyone', () => {
    const fire = {
      id: 'small_fire_station',
      name: 'Fire',
      zoneType: ZoneType.None,
      population: 0,
      jobs: 4,
      isService: true,
      fireRadius: 14,
    };
    expect(formatServiceHint(fire, true, false)).toMatch(/no street/i);
    expect(formatServiceHint(fire, false, false)).toMatch(/no street/i);
    expect(formatServiceHint(fire, true, true)).toBe('fire reach 14 road tiles');
  });

  it('should mark police and fire as road-dispatched, not radius discs', () => {
    expect(serviceSpecForTool('placePoliceStation')?.dispatch).toBe(true);
    expect(serviceSpecForTool('placeFireStation')?.dispatch).toBe(true);
    expect(serviceSpecForTool('placeWaterTower')?.dispatch).toBeFalsy();
    expect(serviceSpecForTool('placePowerPlant')?.dispatch).toBeFalsy();
  });
});
