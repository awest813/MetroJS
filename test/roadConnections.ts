import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType } from '../openpublica/src/sim/CityTile';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { roadNeighbors, roadHeading, roadProfile, isRoadTile } from '../openpublica/src/sim/roadConnections';

describe('roadConnections', () => {
  it('should report no neighbours on an isolated street', () => {
    const sim = CitySim.createCity(8, 8);
    sim.placeRoad(3, 3, RoadType.Street);
    const n = roadNeighbors(sim.map, 3, 3);
    expect(n).toEqual({ n: false, e: false, s: false, w: false });
    expect(isRoadTile(sim.map, 3, 3)).toBe(true);
    expect(isRoadTile(sim.map, 3, 4)).toBe(false);
  });

  it('should detect cardinal road neighbours', () => {
    const map = new CityMap(8, 8);
    map.getTile(2, 2)!.roadType = RoadType.Street;
    map.getTile(2, 3)!.roadType = RoadType.Street;
    map.getTile(3, 2)!.roadType = RoadType.TrolleyAvenue;
    const n = roadNeighbors(map, 2, 2);
    expect(n.n).toBe(true);
    expect(n.e).toBe(true);
    expect(n.s).toBe(false);
    expect(n.w).toBe(false);
  });

  it('should face cars along an east-west street', () => {
    expect(roadHeading({ n: false, e: true, s: false, w: true })).toBeCloseTo(Math.PI / 2);
    expect(roadHeading({ n: true, e: false, s: true, w: false })).toBe(0);
  });

  it('should give trolley a distinct width from street', () => {
    expect(roadProfile(RoadType.TrolleyAvenue).width).toBeGreaterThan(roadProfile(RoadType.Street).width);
    expect(roadProfile(RoadType.Highway).width).toBeGreaterThan(roadProfile(RoadType.TrolleyAvenue).width);
  });
});
