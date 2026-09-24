import { CityMap } from '../openpublica/src/sim/CityMap';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { NO_WORK, distancesToWork, routeCommutes } from '../openpublica/src/sim/commutes';
import { COMMUTE_SHARE, commuteJobs, commuteTrips } from '../openpublica/src/sim/TrafficPressureSystem';

function road(map: CityMap, x0: number, y0: number, x1: number, y1: number, type = RoadType.Street): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) map.getTile(x, y)!.roadType = type;
  }
}

const at = (map: CityMap, x: number, y: number): number => y * map.width + x;

describe('commute routing', () => {
  it('should measure road steps to the nearest workplace street, highways at half a step', () => {
    const map = new CityMap(16, 4);
    road(map, 0, 1, 15, 1);
    const offsets = new Map([[at(map, 15, 1), 0]]);
    const dist = distancesToWork(map, offsets);
    expect(dist[at(map, 15, 1)]).toBe(0);
    expect(dist[at(map, 5, 1)]).toBe(20);
    expect(dist[at(map, 5, 0)]).toBe(NO_WORK);
    road(map, 6, 1, 14, 1, RoadType.Highway);
    expect(distancesToWork(map, offsets)[at(map, 5, 1)]).toBe(11);
  });

  it('should load every road between home and work, and nothing past the job', () => {
    const map = new CityMap(20, 4);
    road(map, 0, 1, 19, 1);
    const { flow, routed } = routeCommutes(map, [{ x: 2, y: 2, trips: 3 }], [{ x: 12, y: 2, jobs: 5 }]);
    expect(routed).toEqual([true]);
    for (let x = 2; x <= 12; x++) expect(flow[at(map, x, 1)]).toBeCloseTo(3);
    expect(flow[at(map, 1, 1)]).toBe(0);
    expect(flow[at(map, 13, 1)]).toBe(0);
  });

  it('should split the flow evenly between two equally short routes', () => {
    const map = new CityMap(12, 9);
    // A loop: home on the west side, work on the east, round the north or the south.
    road(map, 2, 2, 9, 2);
    road(map, 2, 6, 9, 6);
    road(map, 2, 2, 2, 6);
    road(map, 9, 2, 9, 6);
    const { flow } = routeCommutes(map, [{ x: 1, y: 4, trips: 4 }], [{ x: 10, y: 4, jobs: 5 }]);
    expect(flow[at(map, 5, 2)]).toBeCloseTo(2);
    expect(flow[at(map, 5, 6)]).toBeCloseTo(2);
  });

  it('should draw commuters onto a highway that shortens their trip', () => {
    const map = new CityMap(24, 8);
    road(map, 0, 1, 23, 1);
    const trip = { homes: [{ x: 1, y: 2, trips: 2 }], jobs: [{ x: 22, y: 2, jobs: 5 }] };
    expect(routeCommutes(map, trip.homes, trip.jobs).flow[at(map, 11, 1)]).toBeCloseTo(2);
    // A parallel highway two rows up, joined at both ends: fewer steps, so the commute takes it.
    road(map, 1, 1, 1, 4);
    road(map, 22, 1, 22, 4);
    road(map, 2, 4, 21, 4, RoadType.Highway);
    const { flow } = routeCommutes(map, trip.homes, trip.jobs);
    expect(flow[at(map, 11, 4)]).toBeCloseTo(2);
    expect(flow[at(map, 11, 1)]).toBe(0);
  });

  it('should send the overflow from a crowded workplace on to jobs with room', () => {
    const map = new CityMap(32, 4);
    road(map, 0, 1, 31, 1);
    const homes = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0, trips: 1 }));
    const jobs = [{ x: 8, y: 2, jobs: 1 }, { x: 28, y: 2, jobs: 9 }];
    // One round: everyone stops at the nearest job.
    const nearest = routeCommutes(map, homes, jobs, 1);
    expect(nearest.flow[at(map, 20, 1)]).toBe(0);
    // With rounds, the small shop keeps about its share and the rest drive on.
    const shared = routeCommutes(map, homes, jobs);
    expect(shared.flow[at(map, 20, 1)]).toBeGreaterThan(3);
    expect(shared.flow[at(map, 20, 1)]).toBeLessThanOrEqual(6);
  });

  it('should leave a home with no workplace on its network unrouted', () => {
    const map = new CityMap(16, 4);
    road(map, 0, 1, 5, 1);
    road(map, 8, 1, 15, 1);
    const { flow, routed } = routeCommutes(map, [{ x: 2, y: 2, trips: 1 }], [{ x: 12, y: 2, jobs: 3 }]);
    expect(routed).toEqual([false]);
    expect(flow.every((f) => f === 0)).toBe(true);
  });
});

describe('commutes in traffic', () => {
  function build(sim: CitySim, defId: string, x: number, y: number, zone: ZoneType): void {
    sim.growth.buildings.set(`${x},${y}`, { defId, x, y });
    sim.getTile(x, y)!.buildingId = defId;
    sim.getTile(x, y)!.zoneType = zone;
  }

  it('should count residents as commuters and shops, offices, and factories as work', () => {
    const defs = CitySim.createCity(4, 4).growth.defs;
    expect(commuteTrips(defs.get('small_house')!)).toBeCloseTo(4 * 0.15 * COMMUTE_SHARE);
    expect(commuteTrips(defs.get('small_shop')!)).toBe(0);
    expect(commuteJobs(defs.get('office_block')!)).toBe(14);
    expect(commuteJobs(defs.get('small_police_station')!)).toBe(0);
    expect(commuteJobs(defs.get('small_house')!)).toBe(0);
  });

  it('should load the street between homes and far-off jobs, where local trips never reach', () => {
    const sim = CitySim.createCity(40, 8);
    sim.stats.money = 1_000_000;
    sim.batch(() => {
      for (let x = 0; x < 40; x++) sim.placeRoad(x, 3, RoadType.Street);
      for (let x = 1; x <= 8; x++) {
        build(sim, 'rowhouse', x, 2, ZoneType.Residential);
        build(sim, 'rowhouse', x, 4, ZoneType.Residential);
      }
    });
    // Homes alone: their trips stay near home.
    expect(sim.getTile(20, 3)!.trafficPressure).toBe(0);
    for (let x = 32; x <= 36; x++) build(sim, 'office_block', x, 4, ZoneType.Commercial);
    sim.refreshDerivedState({ notify: false });
    // Twelve tiles from the homes and the offices: only commuters drive here.
    expect(sim.getTile(20, 3)!.trafficPressure).toBeGreaterThan(0);
  });
});
