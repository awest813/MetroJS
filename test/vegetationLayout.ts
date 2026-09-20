import { RoadType } from '../openpublica/src/sim/CityTile';
import { parkTreeSlots, streetTreeSlot, POWER_PLANT_SMOKE } from '../openpublica/src/render/vegetationLayout';
import { cityTileColor } from '../openpublica/src/data/cityTileColors';
import { CityTile, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';

describe('vegetationLayout', () => {
  it('should plant 2–4 trees on a park tile', () => {
    for (let i = 0; i < 20; i++) {
      const slots = parkTreeSlots(i, i * 3);
      expect(slots.length).toBeGreaterThanOrEqual(2);
      expect(slots.length).toBeLessThanOrEqual(4);
      for (const s of slots) {
        expect(Math.hypot(s.dx, s.dz)).toBeLessThan(0.5);
        expect(s.scale).toBeGreaterThan(0.5);
      }
    }
  });

  it('should be deterministic', () => {
    expect(parkTreeSlots(4, 7)).toEqual(parkTreeSlots(4, 7));
  });

  it('should skip street trees on trolley, busy streets, and junctions', () => {
    expect(streetTreeSlot(2, 2, RoadType.TrolleyAvenue, 0, 0)).toBeNull();
    expect(streetTreeSlot(2, 2, RoadType.Street, 9, 0)).toBeNull();
    expect(streetTreeSlot(2, 2, RoadType.Street, 0, 0, 4)).toBeNull();
  });

  it('should expose two smoke stacks for the plant kit', () => {
    expect(POWER_PLANT_SMOKE).toHaveLength(2);
  });
});

describe('park ground colour', () => {
  it('should tint park tiles greener than grass', () => {
    const park = new CityTile(0, 0);
    park.terrain = TerrainType.Grass;
    park.zoneType = ZoneType.None;
    park.buildingId = 'small_park';
    const grass = new CityTile(1, 0);
    grass.terrain = TerrainType.Grass;
    const pc = cityTileColor(park);
    const gc = cityTileColor(grass);
    expect(pc.g).toBeGreaterThan(pc.r);
    expect(pc.g / (pc.r + 0.001)).toBeGreaterThan(gc.g / (gc.r + 0.001));
  });
});
