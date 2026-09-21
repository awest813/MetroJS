import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { CrimeSystem } from '../openpublica/src/sim/CrimeSystem';
import { PopulationDensitySystem } from '../openpublica/src/sim/PopulationDensitySystem';
import { ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { PlacePoliceStationTool, POLICE_STATION_COST } from '../openpublica/src/tools/PlacePoliceStationTool';
import { PlaceFireStationTool, FIRE_STATION_COST } from '../openpublica/src/tools/PlaceFireStationTool';
import { PlaceWaterTowerTool, WATER_TOWER_COST } from '../openpublica/src/tools/PlaceWaterTowerTool';

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

function emptyStats() {
  return {
    population: 0, jobs: 0, money: 0, residentialDemand: 0, commercialDemand: 0,
    industrialDemand: 0, resTaxRate: 9, comTaxRate: 9, indTaxRate: 9,
    monthlyIncome: 0, monthlyExpenses: 0, serviceExpenses: 0, bankruptcyWarning: false,
    happiness: 100, walkability: 0, transitAccess: 0, pollutionAverage: 0,
    crimeAverage: 0, fireAverage: 0, waterAverage: 0, approval: 100, advisory: '',
  };
}

describe('PopulationDensitySystem', () => {
  it('should leave density at zero with no residents', () => {
    const sim = CitySim.createCity(8, 8);
    tickOneMonth(sim);
    sim.map.forEach((tile) => {
      expect(tile.populationDensity).toBe(0);
    });
  });

  it('should radiate density from a house without Micropolis tables', () => {
    const map = new CityMap(16, 16);
    const system = new PopulationDensitySystem();
    const buildings = new Map([['8,8', { defId: 'small_house', x: 8, y: 8 }]]);
    const defs = new Map([
      ['small_house', { id: 'small_house', name: '', zoneType: ZoneType.Residential, population: 4, jobs: 0 }],
    ]);

    system.tick(map, buildings, defs);

    // 4 residents × 6 = 24 at the building tile.
    expect(map.getTile(8, 8)!.populationDensity).toBe(24);
    expect(map.getTile(8, 9)!.populationDensity).toBeGreaterThan(0);
    expect(map.getTile(8, 9)!.populationDensity).toBeLessThan(24);
    expect(map.getTile(8, 13)!.populationDensity).toBe(0);
  });

  it('should clamp stacked density at 100', () => {
    const map = new CityMap(8, 8);
    const system = new PopulationDensitySystem();
    const buildings = new Map<string, { defId: string; x: number; y: number }>();
    for (let i = 0; i < 4; i++) {
      buildings.set(`${3 + i},4`, { defId: 'rowhouse', x: 3 + i, y: 4 });
    }
    const defs = new Map([
      ['rowhouse', { id: 'rowhouse', name: '', zoneType: ZoneType.Residential, population: 8, jobs: 0 }],
    ]);

    system.tick(map, buildings, defs);
    expect(map.getTile(4, 4)!.populationDensity).toBe(100);
  });
});

describe('PoliceCoverageSystem', () => {
  it('should ignore an unpowered station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_police_station', 0);

    expect(sim.getTile(12, 12)!.powered).toBe(false);
    expect(sim.getTile(12, 12)!.policeCoverage).toBe(0);
    expect(sim.getTile(12, 13)!.policeCoverage).toBe(0);
  });

  it('should radiate coverage from a powered station like a plant radius', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_police_station', 0);

    expect(sim.getTile(12, 13)!.powered).toBe(true);
    expect(sim.getTile(12, 13)!.policeCoverage).toBe(100);
    expect(sim.getTile(12, 14)!.policeCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 14)!.policeCoverage).toBeLessThan(100);
    // policeRadius = 10; nine tiles away still has coverage, ten tiles is 0
    expect(sim.getTile(12, 22)!.policeCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 23)!.policeCoverage).toBe(0);
    expect(sim.getTile(0, 0)!.policeCoverage).toBe(0);
  });
});

describe('FireCoverageSystem', () => {
  it('should ignore an unpowered fire station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_fire_station', 0);

    expect(sim.getTile(12, 12)!.powered).toBe(false);
    expect(sim.getTile(12, 12)!.fireCoverage).toBe(0);
    expect(sim.stats.fireAverage).toBe(0);
  });

  it('should radiate fire coverage from a powered station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_fire_station', 0);

    expect(sim.getTile(12, 13)!.powered).toBe(true);
    expect(sim.getTile(12, 13)!.fireCoverage).toBe(100);
    expect(sim.getTile(12, 14)!.fireCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 14)!.fireCoverage).toBeLessThan(100);
    expect(sim.getTile(12, 22)!.fireCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 23)!.fireCoverage).toBe(0);
  });

  it('should average fire coverage only on occupied tiles', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_fire_station', 0);
    sim.growth.buildings.set('12,14', { defId: 'small_house', x: 12, y: 14 });
    sim.getTile(12, 14)!.buildingId = 'small_house';
    sim.getTile(12, 14)!.zoneType = ZoneType.Residential;
    tickOneMonth(sim);

    expect(sim.stats.fireAverage).toBeGreaterThan(0);
    expect(sim.stats.fireAverage).toBeLessThanOrEqual(100);
  });
});

describe('WaterCoverageSystem', () => {
  it('should ignore an unpowered water tower', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_water_tower', 0);
    expect(sim.getTile(12, 12)!.powered).toBe(false);
    expect(sim.getTile(12, 12)!.watered).toBe(false);
    expect(sim.stats.waterAverage).toBe(0);
  });

  it('should water zoned lots inside a powered tower radius', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_water_tower', 0);
    sim.setZone(12, 14, ZoneType.Residential);
    expect(sim.getTile(12, 14)!.watered).toBe(true);
    expect(sim.stats.waterAverage).toBe(100);
    expect(sim.getTile(0, 0)!.watered).toBe(false);
  });

  it('should drop waterAverage after bulldozing the only zoned lot', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_water_tower', 0);
    sim.setZone(12, 14, ZoneType.Residential);
    expect(sim.stats.waterAverage).toBe(100);
    sim.bulldoze(12, 14);
    expect(sim.stats.waterAverage).toBe(0);
    expect(sim.getTile(12, 14)!.watered).toBe(true);
  });
});

describe('CrimeSystem', () => {
  it('should keep empty tiles at crime 0', () => {
    const map = new CityMap(4, 4);
    const stats = emptyStats();
    new CrimeSystem().tick(map, stats, true);
    map.forEach((tile) => expect(tile.crime).toBe(0));
    expect(stats.crimeAverage).toBe(0);
    expect(stats.happiness).toBe(100);
  });

  it('should compute crime from density, land value, and police', () => {
    const map = new CityMap(2, 2);
    const tile = map.getTile(0, 0)!;
    tile.populationDensity = 100;
    tile.landValue = 0;
    tile.policeCoverage = 0;

    const stats = emptyStats();
    new CrimeSystem().tick(map, stats, false);

    // 100*0.65 + 100*0.20 - 0 = 85
    expect(tile.crime).toBe(85);
    expect(stats.crimeAverage).toBe(85);
    expect(stats.happiness).toBe(100);
  });

  it('should let full police coverage wipe dense crime', () => {
    const map = new CityMap(2, 2);
    const tile = map.getTile(0, 0)!;
    tile.populationDensity = 100;
    tile.landValue = 100;
    tile.policeCoverage = 100;

    const stats = emptyStats();
    new CrimeSystem().tick(map, stats, true);
    expect(tile.crime).toBe(0);
    expect(stats.crimeAverage).toBe(0);
  });

  it('should apply the happiness penalty only when asked', () => {
    const map = new CityMap(2, 2);
    map.getTile(0, 0)!.populationDensity = 40;
    map.getTile(0, 0)!.landValue = 50;

    const stats = emptyStats();
    const system = new CrimeSystem();
    system.tick(map, stats, false);
    const happyBefore = stats.happiness;
    const average = stats.crimeAverage;
    expect(average).toBeGreaterThan(0);
    expect(happyBefore).toBe(100);

    system.tick(map, stats, true);
    expect(stats.happiness).toBe(100 - Math.round(average * 0.25));
  });

  it('should average occupied tiles including fully policed lots at crime 0', () => {
    const map = new CityMap(2, 2);
    const hot = map.getTile(0, 0)!;
    hot.populationDensity = 100;
    hot.landValue = 0;
    hot.policeCoverage = 0;
    const safe = map.getTile(1, 0)!;
    safe.populationDensity = 100;
    safe.landValue = 100;
    safe.policeCoverage = 100;

    const stats = emptyStats();
    new CrimeSystem().tick(map, stats, false);
    expect(hot.crime).toBe(85);
    expect(safe.crime).toBe(0);
    expect(stats.crimeAverage).toBe(Math.round(85 / 2));
  });
});

describe('city health wiring', () => {
  it('should start with a zero crime average', () => {
    expect(CitySim.createCity(8, 8).stats.crimeAverage).toBe(0);
  });

  it('should fire onCrimeChanged after placing a station', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    let fires = 0;
    sim.onCrimeChanged = () => { fires += 1; };
    sim.placeServiceBuilding(4, 4, 'small_police_station', 0);
    expect(fires).toBe(1);
  });

  it('should not stack a crime happiness penalty when placing a park', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.growth.buildings.set('8,8', { defId: 'small_house', x: 8, y: 8 });
    sim.getTile(8, 8)!.buildingId = 'small_house';
    sim.getTile(8, 8)!.zoneType = ZoneType.Residential;
    tickOneMonth(sim);
    const happyAfterMonth = sim.stats.happiness;
    expect(sim.stats.crimeAverage).toBeGreaterThan(0);

    sim.placeServiceBuilding(2, 2, 'small_park', 0);
    expect(sim.stats.happiness).toBe(happyAfterMonth);
  });

  it('should deduct POLICE_STATION_COST via the police tool', () => {
    const sim = CitySim.createCity(8, 8);
    const start = sim.stats.money;
    const tool = new PlacePoliceStationTool();
    expect(tool.apply({ x: 3, y: 3 }, sim)).toBe(true);
    expect(sim.stats.money).toBe(start - POLICE_STATION_COST);
    expect(sim.getTile(3, 3)!.buildingId).toBe('small_police_station');
  });

  it('should deduct FIRE_STATION_COST via the fire tool', () => {
    const sim = CitySim.createCity(8, 8);
    const start = sim.stats.money;
    const tool = new PlaceFireStationTool();
    expect(tool.apply({ x: 3, y: 3 }, sim)).toBe(true);
    expect(sim.stats.money).toBe(start - FIRE_STATION_COST);
    expect(sim.getTile(3, 3)!.buildingId).toBe('small_fire_station');
  });

  it('should deduct WATER_TOWER_COST via the water tool', () => {
    const sim = CitySim.createCity(8, 8);
    const start = sim.stats.money;
    const tool = new PlaceWaterTowerTool();
    expect(tool.apply({ x: 3, y: 3 }, sim)).toBe(true);
    expect(sim.stats.money).toBe(start - WATER_TOWER_COST);
    expect(sim.getTile(3, 3)!.buildingId).toBe('small_water_tower');
  });
});
