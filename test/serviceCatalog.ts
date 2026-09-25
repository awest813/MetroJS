import { coverageAtDistance } from '../openpublica/src/sim/coveragePaint';
import {
  createServiceTools,
  formatServiceHint,
  POWER_PLANT_COST,
  serviceRadius,
  serviceSpecForTool,
  serviceUpkeepFor,
} from '../openpublica/src/tools/serviceCatalog';
import { ZoneType } from '../openpublica/src/sim/CityTile';

describe('coveragePaint', () => {
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
    // No monthlyCost in the def: the default upkeep applies.
    expect(formatServiceHint(police, true)).toBe('police reach 10 road tiles · $50/mo');
    expect(serviceRadius(police)).toBe(10);
  });

  it('should say how many buildings a station covers and what it costs at its funding', () => {
    const police = {
      id: 'small_police_station',
      name: 'Police',
      zoneType: ZoneType.None,
      population: 0,
      jobs: 4,
      isService: true,
      policeRadius: 10,
      monthlyCost: 60,
    };
    expect(formatServiceHint(police, true, true, null, 100, 43)).toBe('police reach 10 road tiles · covers 43 buildings · $60/mo');
    expect(formatServiceHint(police, true, true, null, 100, 1)).toMatch(/covers 1 building ·/);
    expect(formatServiceHint(police, true, true, null, 70, 12)).toBe(
      'police reach 7 road tiles at 70% funding · covers 12 buildings · $42/mo',
    );
    expect(serviceUpkeepFor(police, 70)).toBe(42);
    // Plants, towers, and parks always cost in full.
    expect(serviceUpkeepFor({ ...police, policeRadius: undefined, parkRadius: 6, monthlyCost: 20 }, 50)).toBe(20);
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
    expect(formatServiceHint(fire, true, true)).toBe('fire reach 14 road tiles · $50/mo');
  });

  it('should mark police and fire as road-dispatched, not radius discs', () => {
    expect(serviceSpecForTool('placePoliceStation')?.dispatch).toBe(true);
    expect(serviceSpecForTool('placeFireStation')?.dispatch).toBe(true);
    expect(serviceSpecForTool('placeWaterTower')?.dispatch).toBeFalsy();
    expect(serviceSpecForTool('placePowerPlant')?.dispatch).toBeFalsy();
  });
});
