import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import {
  GRID_LINE,
  GRID_SERVED,
  networkReachFrom,
  networkTilesAt,
} from '../openpublica/src/sim/utilityGrid';
import { formatServiceHint } from '../openpublica/src/tools/serviceCatalog';
import { colorForPower, OVERLAY_CLEAR } from '../openpublica/src/render/overlayColors';

function streetTown(): CitySim {
  const sim = CitySim.createCity(16, 16);
  sim.stats.money = 100_000;
  sim.batch(() => {
    for (let x = 0; x < 16; x++) sim.placeRoad(x, 5, RoadType.Street);
    for (let x = 4; x < 8; x++) sim.setZone(x, 6, ZoneType.Residential);
    for (let x = 0; x < 16; x++) sim.placeRoad(x, 12, RoadType.Street);
  });
  return sim;
}

describe('utility hints', () => {
  const defs = CitySim.createCity(4, 4).growth.defs;
  const plant = defs.get('small_power_plant');
  const tower = defs.get('small_water_tower');
  const network = { supply: 400, load: 380, served: 90, shortfall: 6 };

  it('should ask for a street before anything else', () => {
    expect(formatServiceHint(plant, true, false, network)).toMatch(/^no street — power runs along streets/);
    expect(formatServiceHint(tower, true, false, network)).toMatch(/^no street — water mains run along streets/);
  });

  it('should report the grid a plant or tower feeds, and what it cannot', () => {
    expect(formatServiceHint(plant, true, true, network)).toBe(
      'power grid 380/400 load · feeds 90 lots · 6 short — add a plant on this grid',
    );
    expect(formatServiceHint(tower, false, true, network)).toMatch(/^dark — the tower pumps once a powered street reaches it/);
    expect(formatServiceHint(tower, true, true, { ...network, shortfall: 0 })).toBe('water grid 380/400 load · feeds 90 lots');
  });
});

describe('network previews', () => {
  it('should show the streets a new plant would join, or nothing without one', () => {
    const sim = streetTown();
    const beside = networkReachFrom(sim.map, 3, 6);
    expect(beside).toHaveLength(16);
    expect(beside.every((t) => t.y === 5)).toBe(true);
    expect(networkReachFrom(sim.map, 3, 9)).toHaveLength(0);
  });

  it("should list only the lines and lots of the plant's own network", () => {
    const sim = streetTown();
    sim.placeServiceBuilding(0, 6, 'small_power_plant', 0);
    const tiles = networkTilesAt(sim.map, sim.power.grid!, 0, 6);
    expect(tiles.filter((t) => t.state === GRID_LINE)).toHaveLength(17); // 16 street tiles + the plant
    expect(tiles.filter((t) => t.state === GRID_SERVED).map((t) => t.x)).toEqual([4, 5, 6, 7]);
    expect(tiles.some((t) => t.y === 12)).toBe(false);
  });

  it('should not flag parks as dark on the Power map', () => {
    expect(colorForPower(false, false)).toBe(OVERLAY_CLEAR);
    expect(colorForPower(false, true).r).toBeGreaterThan(0.5);
  });
});
