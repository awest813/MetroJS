import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, TerrainType } from '../openpublica/src/sim/CityTile';
import {
  BRIDGE_DECK_MIN_Y,
  deckBaseHeight,
  deckDirtyTiles,
  edgeDeckHeight,
  type GroundHeights,
} from '../openpublica/src/render/roadDeck';

/** Land at `land`, lake bed at -0.5, on a map with a water column x = 3..5. */
function riverMap(): { map: CityMap; ground: (land: (x: number) => number) => GroundHeights } {
  const map = new CityMap(10, 4);
  for (let x = 3; x <= 5; x++) {
    for (let y = 0; y < 4; y++) map.getTile(x, y)!.terrain = TerrainType.Water;
  }
  return {
    map,
    ground: (land) => ({
      tileCenter: (x, y) => (map.getTile(x, y)?.terrain === TerrainType.Water ? -0.5 : land(x)),
    }),
  };
}

function pave(map: CityMap, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) map.getTile(x, y)!.roadType = RoadType.Street;
}

describe('roadDeck', () => {
  it('should follow the ground on land and the lake bed nowhere', () => {
    const { map, ground } = riverMap();
    pave(map, 1, 7, 1);
    const g = ground(() => 0.5);
    expect(deckBaseHeight(map, g, 1, 1)).toBe(0.5);
    // A level span between two banks at 0.5 stays at 0.5 over the water.
    expect(deckBaseHeight(map, g, 3, 1)).toBeCloseTo(0.5);
    expect(deckBaseHeight(map, g, 4, 1)).toBeCloseTo(0.5);
    expect(deckBaseHeight(map, g, 5, 1)).toBeCloseTo(0.5);
  });

  it('should ramp between banks of different height', () => {
    const { map, ground } = riverMap();
    pave(map, 2, 6, 1);
    const g = ground((x) => (x < 3 ? 0.9 : 0.5));
    const a = deckBaseHeight(map, g, 3, 1);
    const b = deckBaseHeight(map, g, 4, 1);
    const c = deckBaseHeight(map, g, 5, 1);
    expect(a).toBeCloseTo(0.8);
    expect(b).toBeCloseTo(0.7);
    expect(c).toBeCloseTo(0.6);
  });

  it('should never dip under the clearance above the water', () => {
    const { map, ground } = riverMap();
    pave(map, 2, 6, 1);
    const g = ground(() => 0.0);
    expect(deckBaseHeight(map, g, 4, 1)).toBeCloseTo(BRIDGE_DECK_MIN_Y);
  });

  it('should hold a dangling span at the clearance or its one bank', () => {
    const { map, ground } = riverMap();
    pave(map, 2, 4, 1);
    const g = ground(() => 0.7);
    expect(deckBaseHeight(map, g, 3, 1)).toBeCloseTo(0.7);
    map.getTile(4, 3)!.roadType = RoadType.Street;
    expect(deckBaseHeight(map, g, 4, 3)).toBeCloseTo(BRIDGE_DECK_MIN_Y);
  });

  it('should mark the whole span dirty when an abutment changes', () => {
    const { map } = riverMap();
    pave(map, 2, 6, 1);
    const dirty = deckDirtyTiles(map, 6, 1).map((t) => `${t.x},${t.y}`);
    for (const key of ['2,1', '3,1', '4,1', '5,1', '6,1', '7,1']) expect(dirty).toContain(key);
  });

  it('should lerp a vehicle along the edge', () => {
    expect(edgeDeckHeight(0.2, 0.6, 0)).toBeCloseTo(0.2);
    expect(edgeDeckHeight(0.2, 0.6, 0.5)).toBeCloseTo(0.4);
    expect(edgeDeckHeight(0.2, 0.6, 1)).toBeCloseTo(0.6);
  });
});
