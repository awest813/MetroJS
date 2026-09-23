import { CityMap } from '../openpublica/src/sim/CityMap';
import { averageColors, cityTileColor, platCenterColor, terrainColor, tileCornerColors } from '../openpublica/src/data/cityTileColors';
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

  it('should paint empty zone plats with hard, zone-coloured edges and a washed centre', () => {
    const map = new CityMap(4, 4);
    const lot = map.getTile(1, 1)!;
    lot.zoneType = ZoneType.Residential;
    const zone = cityTileColor(lot);
    const corners = tileCornerColors(map, 1, 1);
    for (const c of corners) expect(c).toEqual(corners[0]);
    const grass = terrainColor(lot);
    const share = (c: { b: number }) => (c.b - grass.b) / (zone.b - grass.b);
    expect(share(corners[0])).toBeCloseTo(0.9, 5);
    expect(share(platCenterColor(lot))).toBeCloseTo(0.55, 5);
    const grassCorner = tileCornerColors(map, 2, 1)[0];
    expect(grassCorner.b).toBeLessThan(corners[0].b);
  });

  it('should keep zone and yard colours out of the water', () => {
    const map = new CityMap(4, 4);
    map.getTile(2, 1)!.terrain = TerrainType.Water;
    const lot = map.getTile(1, 1)!;
    lot.zoneType = ZoneType.Commercial;
    const [, se, , ne] = tileCornerColors(map, 1, 1); // east corners touch the water
    const [sw] = tileCornerColors(map, 1, 1);
    expect(se).not.toEqual(sw);
    const waterCorners = tileCornerColors(map, 2, 1);
    const zone = cityTileColor(lot);
    for (const c of [...waterCorners, se, ne]) expect(Math.abs(c.r - zone.r)).toBeGreaterThan(0.2);
  });

  it('should put yards and pavement under grown buildings, not the zone swatch', () => {
    const map = new CityMap(4, 4);
    const house = map.getTile(1, 1)!;
    house.zoneType = ZoneType.Residential;
    house.buildingId = 'small_house';
    const shop = map.getTile(2, 1)!;
    shop.zoneType = ZoneType.Commercial;
    shop.buildingId = 'small_shop';
    const lawn = cityTileColor(house);
    expect(lawn.g).toBeGreaterThan(lawn.b);
    expect(lawn.g).toBeGreaterThan(lawn.r);
    const pavement = cityTileColor(shop);
    expect(Math.max(pavement.r, pavement.g, pavement.b) - Math.min(pavement.r, pavement.g, pavement.b)).toBeLessThan(0.1);
  });
});
