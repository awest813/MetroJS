import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType } from '../openpublica/src/sim/CityTile';
import { combineCoverage } from '../openpublica/src/sim/coveragePaint';

describe('overlapping coverage', () => {
  it('should add up with diminishing returns', () => {
    expect(combineCoverage(20, 20)).toBe(36);
    expect(combineCoverage(0, 43)).toBe(43);
    expect(combineCoverage(100, 12)).toBe(100);
    expect(combineCoverage(50, 50)).toBe(75);
  });

  it('should cover a street between two stations better than either alone', () => {
    const town = (stations: number[]): CitySim => {
      const sim = CitySim.createCity(40, 8);
      sim.stats.money = 1_000_000;
      sim.batch(() => {
        for (let x = 0; x < 40; x++) sim.placeRoad(x, 4, RoadType.Street);
        sim.placeServiceBuilding(0, 5, 'small_power_plant', 0);
        for (const x of stations) {
          sim.placeServiceBuilding(x, 5, 'small_police_station', 0);
          sim.placeServiceBuilding(x, 3, 'small_fire_station', 0);
        }
      });
      return sim;
    };
    const one = town([10]);
    const two = town([10, 26]);
    const mid = (sim: CitySim) => sim.getTile(18, 4)!;
    expect(mid(one).policeCoverage).toBeGreaterThan(0);
    expect(mid(two).policeCoverage).toBe(combineCoverage(mid(one).policeCoverage, mid(one).policeCoverage));
    expect(mid(two).fireCoverage).toBeGreaterThan(mid(one).fireCoverage);
  });
});
