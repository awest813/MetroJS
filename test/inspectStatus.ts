import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, ZoneType, TerrainType } from '../openpublica/src/sim/CityTile';
import { formatInspectStatus, prettyDefId } from '../openpublica/src/ui/inspectStatus';

describe('formatInspectStatus', () => {
  it('should name zone, road, and building instead of enum numbers', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(1, 2)!;
    tile.terrain = TerrainType.Grass;
    tile.zoneType = ZoneType.Residential;
    tile.roadType = RoadType.None;
    tile.landValue = 40;
    tile.buildingId = 'small_house';
    tile.powered = false;
    const line = formatInspectStatus('🔍 Inspect', tile, 'small_house', 'unpowered — place a power plant nearby');
    expect(line).toContain('1, 2');
    expect(line).toContain('Residential');
    expect(line).toContain('small house');
    expect(line).toContain('unpowered');
    expect(line).toContain('LV 40');
    expect(line).not.toMatch(/zone=1/);
  });

  it('should mention density, police, and crime when they are above zero', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(2, 1)!;
    tile.populationDensity = 24;
    tile.policeCoverage = 80;
    tile.fireCoverage = 40;
    tile.crime = 12;
    const line = formatInspectStatus('Inspect', tile, null);
    expect(line).toContain('density 24');
    expect(line).toContain('police 80');
    expect(line).toContain('fire 40');
    expect(line).toContain('crime 12');
  });

  it('should mention watered lots', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(0, 1)!;
    tile.watered = true;
    expect(formatInspectStatus('Inspect', tile, null)).toContain('watered');
  });

  it('should mention trolley without repeating HUD money', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(0, 0)!;
    tile.roadType = RoadType.TrolleyAvenue;
    const line = formatInspectStatus('Trolley Ave', tile, null);
    expect(line).toContain('Trolley');
    expect(line).not.toContain('$');
  });

  it('should pretty-print building def ids', () => {
    expect(prettyDefId('small_power_plant')).toBe('small power plant');
  });
});
