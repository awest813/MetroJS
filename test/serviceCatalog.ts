import { CityMap } from '../openpublica/src/sim/CityMap';
import { coverageAtDistance, forEachTileInRadius } from '../openpublica/src/sim/coveragePaint';
import {
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
    expect(formatServiceHint(police, true)).toBe('police radius 10');
    expect(serviceRadius(police)).toBe(10);
  });
});
