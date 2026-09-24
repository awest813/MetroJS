import { CityMap } from '../openpublica/src/sim/CityMap';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { PowerRoom } from '../openpublica/src/sim/powerRoom';
import { distributeAlongStreets } from '../openpublica/src/sim/utilityGrid';
import { formatGrowthHint } from '../openpublica/src/sim/zoneGrowthHints';

describe('power room', () => {
  /** A street on y = 1 with a 10-unit source at its west end and lots on y = 2. */
  function grid(loads: number[]): { map: CityMap; room: PowerRoom } {
    const map = new CityMap(12, 4);
    for (let x = 0; x < 12; x++) map.getTile(x, 1)!.roadType = RoadType.Street;
    loads.forEach((load, i) => {
      const tile = map.getTile(i + 1, 2)!;
      tile.zoneType = ZoneType.Residential;
      if (load > 0) tile.buildingId = 'small_house';
    });
    const g = distributeAlongStreets(map, [{ x: 0, y: 0, capacity: 10 }], (tile) => {
      if (tile.roadType !== RoadType.None || tile.zoneType === ZoneType.None) return null;
      return loads[tile.x - 1] ?? 0;
    });
    return { map, room: new PowerRoom(g, map) };
  }

  it('should let a building grow only where its grid can carry it', () => {
    const { map, room } = grid([4, 0, 0]);
    const lot = map.getTile(2, 2)!;
    expect(room.fits(lot, 4)).toBe(true);
    room.take(lot, 4);
    expect(room.fits(map.getTile(3, 2)!, 4)).toBe(false);
    expect(room.fits(map.getTile(3, 2)!, 2)).toBe(true);
  });

  it('should hold all growth on a grid that already leaves a building dark', () => {
    const { map, room } = grid([6, 6, 0]);
    // The second house is short (6 + 6 > 10): nothing more grows on this grid.
    expect(room.fits(map.getTile(3, 2)!, 1)).toBe(false);
  });

  it('should let lots no plant reaches fill (dark) as before', () => {
    const map = new CityMap(8, 4);
    const room = new PowerRoom(null, map);
    expect(room.fits(map.getTile(2, 2)!, 100)).toBe(true);
    const { map: gridMap, room: gridRoom } = grid([0]);
    expect(gridRoom.fits(gridMap.getTile(1, 3)!, 100)).toBe(true);
  });

  it('should scale the load by the weather', () => {
    const map = new CityMap(12, 4);
    for (let x = 0; x < 12; x++) map.getTile(x, 1)!.roadType = RoadType.Street;
    map.getTile(1, 2)!.zoneType = ZoneType.Residential;
    const g = distributeAlongStreets(map, [{ x: 0, y: 0, capacity: 10 }], (tile) =>
      tile.zoneType === ZoneType.Residential ? 0 : null);
    expect(new PowerRoom(g, map, 1).fits(map.getTile(1, 2)!, 9)).toBe(true);
    expect(new PowerRoom(g, map, 1.2).fits(map.getTile(1, 2)!, 9)).toBe(false);
  });
});

describe('growth on a full grid', () => {
  /** One plant (400) on a long street lined with homes: 100 small houses fill it exactly. */
  function fullTown(): CitySim {
    const sim = CitySim.createCity(64, 8, 5);
    sim.stats.money = 1_000_000;
    sim.pinWeather('clear');
    sim.batch(() => {
      for (let x = 0; x < 64; x++) sim.placeRoad(x, 4, RoadType.Street);
      sim.placeServiceBuilding(0, 5, 'small_power_plant', 0);
      let houses = 0;
      for (let x = 1; x < 64; x++) {
        for (const y of [3, 5]) {
          const tile = sim.getTile(x, y)!;
          if (tile.buildingId) continue;
          tile.zoneType = ZoneType.Residential;
          if (houses < 100) {
            tile.buildingId = 'small_house';
            sim.growth.buildings.set(`${x},${y}`, { defId: 'small_house', x, y });
            houses += 1;
          }
        }
      }
    });
    sim.refreshDerivedState({ notify: false });
    return sim;
  }
  const count = (sim: CitySim): number => sim.growth.buildings.size;

  it('should wait for another plant instead of darkening houses', () => {
    const sim = fullTown();
    expect(sim.stats.powerLoad).toBe(400);
    const before = count(sim);
    const emptyLot = (() => {
      let lot = null as { x: number; y: number } | null;
      sim.map.forEach((t) => { if (!lot && t.zoneType === ZoneType.Residential && !t.buildingId) lot = t; });
      return lot!;
    })();
    expect(sim.gridFullAt(emptyLot.x, emptyLot.y)).toBe(true);
    let held = 0;
    for (let m = 0; m < 4; m++) {
      sim.stats.residentialDemand = 100;
      sim.tick(MONTH_SECONDS);
      held += sim.stats.powerHeld ?? 0;
      expect(sim.stats.powerShort).toBe(0);
    }
    // Houses by the plant may leave in its smog, and the room they free fills again; nothing more.
    expect(count(sim)).toBeLessThanOrEqual(before);
    expect(sim.stats.powerLoad).toBeLessThanOrEqual(400);
    expect(held).toBeGreaterThan(0);
    expect(sim.stats.advisory).toMatch(/power grid is full/);
    const atCapacity = count(sim);

    sim.placeServiceBuilding(63, 5, 'small_power_plant', 0);
    expect(sim.gridFullAt(emptyLot.x, emptyLot.y)).toBe(false);
    for (let m = 0; m < 4; m++) {
      sim.stats.residentialDemand = 100;
      sim.tick(MONTH_SECONDS);
    }
    expect(count(sim)).toBeGreaterThan(atCapacity + 1);
    expect(sim.stats.powerShort).toBe(0);
  });

  it('should tell a waiting lot why', () => {
    const sim = fullTown();
    let lot = null as ReturnType<CitySim['getTile']> | null;
    sim.map.forEach((t) => { if (!lot && t.zoneType === ZoneType.Residential && !t.buildingId) lot = t; });
    sim.stats.residentialDemand = 60;
    expect(formatGrowthHint(lot!, sim.map, sim.stats, true)).toBe('waiting for power — its grid is full, so add a plant on these streets');
    expect(formatGrowthHint(lot!, sim.map, sim.stats, false)).toMatch(/^waiting to grow/);
  });
});
