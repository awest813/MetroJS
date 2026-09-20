import { CityMap } from '../openpublica/src/sim/CityMap';
import { averageColors, tileCornerColors, cityTileColor } from '../openpublica/src/data/cityTileColors';
import { TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';

describe('terrain colour blending', () => {
  it('should average neighbouring tile colours at shared corners', () => {
    const map = new CityMap(4, 4);
    map.getTile(0, 0)!.terrain = TerrainType.Dirt;
    map.getTile(1, 0)!.terrain = TerrainType.Grass;
    const [sw] = tileCornerColors(map, 1, 0);
    const dirt = cityTileColor(map.getTile(0, 0)!);
    const grass = cityTileColor(map.getTile(1, 0)!);
    expect(sw.r).toBeGreaterThan(Math.min(dirt.r, grass.r) - 0.001);
    expect(sw.r).toBeLessThan(Math.max(dirt.r, grass.r) + 0.001);
  });

  it('should average colours component-wise', () => {
    const mid = averageColors([
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 0.5, b: 0 },
    ]);
    expect(mid.r).toBeCloseTo(0.5);
    expect(mid.g).toBeCloseTo(0.25);
  });

  it('should keep park lawn darker than open grass', () => {
    const map = new CityMap(2, 2);
    const park = map.getTile(0, 0)!;
    park.zoneType = ZoneType.None;
    park.buildingId = 'small_park';
    const grass = map.getTile(1, 0)!;
    grass.terrain = TerrainType.Grass;
    expect(cityTileColor(park).g).toBeLessThan(cityTileColor(grass).g);
  });

  it('should keep a police lot bluer than grass', () => {
    const map = new CityMap(2, 2);
    const station = map.getTile(0, 0)!;
    station.buildingId = 'small_police_station';
    const grass = map.getTile(1, 0)!;
    grass.terrain = TerrainType.Grass;
    expect(cityTileColor(station).b).toBeGreaterThan(cityTileColor(grass).b);
  });

  it('should keep a fire lot redder than grass', () => {
    const map = new CityMap(2, 2);
    const station = map.getTile(0, 0)!;
    station.buildingId = 'small_fire_station';
    const grass = map.getTile(1, 0)!;
    grass.terrain = TerrainType.Grass;
    expect(cityTileColor(station).r).toBeGreaterThan(cityTileColor(grass).r);
  });

  it('should keep a water tower lot cooler than grass', () => {
    const map = new CityMap(2, 2);
    const tower = map.getTile(0, 0)!;
    tower.buildingId = 'small_water_tower';
    const grass = map.getTile(1, 0)!;
    grass.terrain = TerrainType.Grass;
    expect(cityTileColor(tower).b).toBeGreaterThan(cityTileColor(grass).b);
  });

  it('should paint empty zone plats with hard corners', () => {
    const map = new CityMap(4, 4);
    const lot = map.getTile(1, 1)!;
    lot.zoneType = ZoneType.Residential;
    const plat = cityTileColor(lot);
    const corners = tileCornerColors(map, 1, 1);
    for (const c of corners) {
      expect(c.r).toBeCloseTo(plat.r);
      expect(c.g).toBeCloseTo(plat.g);
      expect(c.b).toBeCloseTo(plat.b);
    }
    const grassCorner = tileCornerColors(map, 2, 1)[0];
    expect(grassCorner.b).toBeLessThan(plat.b);
  });
});
