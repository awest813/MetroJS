import { CityMap } from '../openpublica/src/sim/CityMap';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  INDUSTRY_DECLINE_DEMAND,
  formatGrowthHint,
  SHRINK_MONTHS,
  demandExodusCap,
  outgrownLot,
} from '../openpublica/src/sim/zoneGrowthHints';

const defs = CitySim.createCity(4, 4).growth.defs;
const zone = (z: ZoneType) => [...defs.values()].filter((d) => d.zoneType === z);
const def = (id: string) => defs.get(id)!;

describe('outgrown lots', () => {
  function lot(zoneType: ZoneType, landValue: number, highway = false): { map: CityMap; x: number; y: number } {
    const map = new CityMap(12, 12);
    const tile = map.getTile(5, 5)!;
    tile.zoneType = zoneType;
    tile.landValue = landValue;
    if (highway) map.getTile(5, 7)!.roadType = RoadType.Highway;
    return { map, x: 5, y: 5 };
  }
  const outgrown = (id: string, zoneType: ZoneType, landValue: number, demand: number, highway = false): boolean => {
    const { map, x, y } = lot(zoneType, landValue, highway);
    return outgrownLot(map, map.getTile(x, y)!, zone(zoneType), def(id), demand);
  };

  it('should keep a building on land within its slack of the bar that grew it', () => {
    expect(outgrown('office_block', ZoneType.Commercial, 62, 100)).toBe(false);
    expect(outgrown('office_block', ZoneType.Commercial, 55, 100)).toBe(true);
    expect(outgrown('rowhouse', ZoneType.Residential, 36, 50)).toBe(false);
    expect(outgrown('rowhouse', ZoneType.Residential, 30, 50)).toBe(true);
    expect(outgrown('small_house', ZoneType.Residential, 0, 0)).toBe(false);
  });

  it('should leave weak demand to the stress pass for homes and shops', () => {
    expect(outgrown('office_block', ZoneType.Commercial, 90, 5)).toBe(false);
  });

  it('should keep industry at the baseline, and shrink it in decline or without its highway', () => {
    expect(outgrown('industrial_works', ZoneType.Industrial, 0, 20, true)).toBe(false);
    expect(outgrown('industrial_works', ZoneType.Industrial, 0, 20, false)).toBe(true);
    expect(outgrown('industrial_works', ZoneType.Industrial, 0, INDUSTRY_DECLINE_DEMAND - 5, true)).toBe(true);
    expect(outgrown('factory', ZoneType.Industrial, 0, 20)).toBe(false);
    expect(outgrown('factory', ZoneType.Industrial, 0, 2)).toBe(true);
    expect(outgrown('light_workshop', ZoneType.Industrial, 0, 0)).toBe(false);
  });
});

describe('shrinking in the sim', () => {
  /** A lit street of office blocks on cheap land, with shop demand held full. */
  function offices(count: number): CitySim {
    const sim = CitySim.createCity(64, 8, 3);
    sim.stats.money = 1_000_000;
    sim.pinWeather('clear');
    sim.batch(() => {
      for (let x = 0; x < 64; x++) sim.placeRoad(x, 4, RoadType.Street);
      sim.placeServiceBuilding(0, 5, 'small_power_plant', 0);
      sim.placeServiceBuilding(1, 3, 'small_power_plant', 0);
      for (let i = 0; i < count; i++) {
        // Well clear of the plants' smog.
        const x = 24 + i;
        const tile = sim.getTile(x, 5)!;
        tile.zoneType = ZoneType.Commercial;
        tile.buildingId = 'office_block';
        sim.growth.buildings.set(`${x},5`, { defId: 'office_block', x, y: 5 });
      }
    });
    sim.refreshDerivedState({ notify: false });
    return sim;
  }
  const count = (sim: CitySim, id: string): number => {
    let n = 0;
    sim.map.forEach((t) => { if (t.buildingId === id) n += 1; });
    return n;
  };
  const month = (sim: CitySim): void => {
    sim.stats.commercialDemand = 100;
    sim.stats.population = 10_000;
    sim.tick(MONTH_SECONDS);
  };

  it('should step an office block on cheap land down after its outgrown months', () => {
    const sim = offices(1);
    expect(sim.getTile(24, 5)!.landValue).toBeLessThan(60);
    for (let m = 1; m < SHRINK_MONTHS; m++) month(sim);
    expect(sim.getTile(24, 5)!.buildingId).toBe('office_block');
    expect(sim.growth.outgrownMonths(24, 5)).toBe(SHRINK_MONTHS - 1);
    expect(formatGrowthHint(sim.getTile(24, 5)!, sim.map, sim.stats, { outgrownMonths: sim.growth.outgrownMonths(24, 5) }))
      .toBe('outgrown — its land value has fallen under what this size needs; it steps down in 1 month');
    month(sim);
    expect(sim.getTile(24, 5)!.buildingId).toBe('shop_row');
    expect(sim.growth.outgrownMonths(24, 5)).toBe(0);
  });

  it('should step a district down a few buildings a month, not all at once', () => {
    // Thirty works on a street with no highway: every one has outgrown its lot.
    const sim = CitySim.createCity(64, 8, 3);
    sim.stats.money = 1_000_000;
    sim.pinWeather('clear');
    sim.batch(() => {
      for (let x = 0; x < 64; x++) sim.placeRoad(x, 4, RoadType.Street);
      sim.placeServiceBuilding(0, 5, 'small_power_plant', 0);
      sim.placeServiceBuilding(1, 3, 'small_power_plant', 0);
      for (let i = 0; i < 30; i++) {
        const x = 24 + i;
        const tile = sim.getTile(x, 5)!;
        tile.zoneType = ZoneType.Industrial;
        tile.buildingId = 'industrial_works';
        sim.growth.buildings.set(`${x},5`, { defId: 'industrial_works', x, y: 5 });
      }
    });
    sim.refreshDerivedState({ notify: false });
    const works = (): number => count(sim, 'industrial_works');
    const factoryMonth = (): void => {
      sim.stats.industrialDemand = 20;
      sim.tick(MONTH_SECONDS);
    };
    for (let m = 1; m < SHRINK_MONTHS; m++) factoryMonth();
    expect(works()).toBe(30);
    factoryMonth();
    expect(works()).toBe(30 - demandExodusCap(30));
    factoryMonth();
    expect(works()).toBe(30 - 2 * demandExodusCap(30));
    expect(count(sim, 'factory')).toBe(2 * demandExodusCap(30));
  });
});
