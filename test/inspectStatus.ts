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

  it('should say when a building is dry or out of fire engines reach', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(1, 1)!;
    tile.zoneType = ZoneType.Residential;
    tile.buildingId = 'small_house';
    const line = formatInspectStatus('Inspect', tile, 'small_house');
    expect(line).toContain('dry');
    expect(line).toContain('no fire cover');
    tile.watered = true;
    tile.fireCoverage = 30;
    const served = formatInspectStatus('Inspect', tile, 'small_house');
    expect(served).toContain('watered');
    expect(served).toContain('fire 30');
    expect(served).not.toContain('dry');
    expect(served).not.toContain('no fire cover');
    // Empty lots and civic buildings are neither.
    const empty = map.getTile(2, 2)!;
    empty.zoneType = ZoneType.Residential;
    expect(formatInspectStatus('Inspect', empty, null)).not.toMatch(/dry|no fire cover/);
  });

  it('should mention watered lots', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(0, 1)!;
    tile.watered = true;
    expect(formatInspectStatus('Inspect', tile, null)).toContain('watered');
  });

  it('should mark a struggling building', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(1, 1)!;
    tile.buildingId = 'small_house';
    tile.neglectMonths = 3;
    expect(formatInspectStatus('Inspect', tile, 'small_house')).toContain('struggling');
  });

  it('should call out an empty zoned lot', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(2, 2)!;
    tile.zoneType = ZoneType.Commercial;
    expect(formatInspectStatus('C Zone', tile, null)).toContain('empty lot');
  });

  it('should mention trolley without repeating HUD money', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(0, 0)!;
    tile.roadType = RoadType.TrolleyAvenue;
    const line = formatInspectStatus('Trolley Ave', tile, null);
    expect(line).toContain('Trolley');
    expect(line).toContain('traffic 0');
    expect(line).not.toContain('$');
  });

  it('should mention transit access near a trolley line', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(1, 1)!;
    expect(formatInspectStatus('Inspect', tile, null)).not.toContain('transit');
    tile.transitAccess = 64;
    expect(formatInspectStatus('Inspect', tile, null)).toContain('transit 64');
  });

  it('should mention traffic pressure on road tiles', () => {
    const map = new CityMap(4, 4);
    const tile = map.getTile(1, 1)!;
    tile.roadType = RoadType.Street;
    tile.trafficPressure = 7;
    const line = formatInspectStatus('Inspect', tile, null);
    expect(line).toContain('Street');
    expect(line).toContain('traffic 7');
  });

  it('should pretty-print building def ids', () => {
    expect(prettyDefId('small_power_plant')).toBe('small power plant');
  });
});
