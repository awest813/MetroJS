import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { CrimeSystem } from '../openpublica/src/sim/CrimeSystem';
import { composeHappiness } from '../openpublica/src/sim/happiness';
import { PopulationDensitySystem } from '../openpublica/src/sim/PopulationDensitySystem';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { dispatchDistances, stationHasRoad } from '../openpublica/src/sim/roadDispatch';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { PlacePoliceStationTool, POLICE_STATION_COST } from '../openpublica/src/tools/PlacePoliceStationTool';
import { PlaceFireStationTool, FIRE_STATION_COST } from '../openpublica/src/tools/PlaceFireStationTool';
import { PlaceWaterTowerTool, WATER_TOWER_COST } from '../openpublica/src/tools/PlaceWaterTowerTool';

function tickOneMonth(sim: CitySim): void {
  sim.tick(MONTH_SECONDS);
}

function emptyStats() {
  return {
    population: 0, darkPopulation: 0, jobs: 0, money: 0, residentialDemand: 0, commercialDemand: 0,
    industrialDemand: 0, resTaxRate: 9, comTaxRate: 9, indTaxRate: 9,
    monthlyIncome: 0, monthlyExpenses: 0, serviceExpenses: 0,
    projectedIncome: 0, projectedExpenses: 0, bankruptcyWarning: false,
    happiness: 100, walkability: 0, transitAccess: 0, pollutionAverage: 0,
    crimeAverage: 0, fireAverage: 0, waterAverage: 0, powerSupply: 0, powerLoad: 0, powerShort: 0, waterSupply: 0, waterLoad: 0, waterShort: 0, approval: 100, advisory: '',
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
    map.getTile(8, 8)!.powered = true;
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

  it('should count unpowered residents at the same factor as the census', () => {
    const map = new CityMap(8, 8);
    const system = new PopulationDensitySystem();
    const buildings = new Map([['4,4', { defId: 'small_house', x: 4, y: 4 }]]);
    const defs = new Map([
      ['small_house', { id: 'small_house', name: '', zoneType: ZoneType.Residential, population: 4, jobs: 0 }],
    ]);

    system.tick(map, buildings, defs);

    // 4 × 0.75 × 6 = 18 at the dark house.
    expect(map.getTile(4, 4)!.populationDensity).toBe(18);
  });

  it('should clamp stacked density at 100', () => {
    const map = new CityMap(8, 8);
    const system = new PopulationDensitySystem();
    const buildings = new Map<string, { defId: string; x: number; y: number }>();
    for (let i = 0; i < 4; i++) {
      map.getTile(3 + i, 4)!.powered = true;
      buildings.set(`${3 + i},4`, { defId: 'rowhouse', x: 3 + i, y: 4 });
    }
    const defs = new Map([
      ['rowhouse', { id: 'rowhouse', name: '', zoneType: ZoneType.Residential, population: 8, jobs: 0 }],
    ]);

    system.tick(map, buildings, defs);
    expect(map.getTile(4, 4)!.populationDensity).toBe(100);
  });
});

/** Powered station at (12, 13) fronting a north-south street on x = 13, y 13..31. */
function stationOnStreet(defId: string): CitySim {
  const sim = CitySim.createCity(32, 32);
  sim.stats.money = 100_000;
  sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
  sim.placeServiceBuilding(12, 13, defId, 0);
  for (let y = 13; y < 32; y++) sim.placeRoad(13, y, RoadType.Street);
  return sim;
}

describe('PoliceCoverageSystem', () => {
  it('should ignore an unpowered station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_police_station', 0);
    sim.placeRoad(13, 12, RoadType.Street);

    expect(sim.getTile(12, 12)!.powered).toBe(false);
    expect(sim.getTile(12, 12)!.policeCoverage).toBe(0);
    expect(sim.getTile(12, 13)!.policeCoverage).toBe(0);
  });

  it('should cover nothing until a street touches the station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_police_station', 0);

    expect(sim.getTile(12, 13)!.powered).toBe(true);
    expect(sim.getTile(12, 13)!.policeCoverage).toBe(0);
    expect(sim.getTile(12, 14)!.policeCoverage).toBe(0);

    sim.placeRoad(13, 13, RoadType.Street);
    expect(sim.getTile(12, 13)!.policeCoverage).toBe(100);
    expect(sim.getTile(12, 14)!.policeCoverage).toBeGreaterThan(0);
  });

  it('should patrol along the street and fade with road distance', () => {
    const sim = stationOnStreet('small_police_station');

    expect(sim.getTile(12, 13)!.policeCoverage).toBe(100);
    expect(sim.getTile(12, 14)!.policeCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 14)!.policeCoverage).toBeLessThan(100);
    // policeRadius = 14 road steps: one step to the curb, then one per tile.
    expect(sim.getTile(13, 25)!.policeCoverage).toBeGreaterThan(0);
    expect(sim.getTile(13, 26)!.policeCoverage).toBe(0);
    // Lots on the street are covered; lots far from any reached road are not,
    // even when they sit well inside the old straight-line radius.
    expect(sim.getTile(14, 20)!.policeCoverage).toBeGreaterThan(0);
    expect(sim.getTile(5, 13)!.policeCoverage).toBe(0);
    expect(sim.getTile(0, 0)!.policeCoverage).toBe(0);
  });
});

describe('road dispatch', () => {
  it('should cross a river only over a bridge', () => {
    const sim = CitySim.createCity(32, 32);
    sim.stats.money = 100_000;
    for (let y = 0; y < 32; y++) {
      sim.getTile(16, y)!.terrain = TerrainType.Water;
      sim.getTile(17, y)!.terrain = TerrainType.Water;
    }
    sim.placeServiceBuilding(12, 12, 'small_power_plant', 0);
    sim.placeServiceBuilding(12, 13, 'small_fire_station', 0);
    for (let x = 12; x <= 22; x++) {
      if (x === 16 || x === 17) continue;
      sim.placeRoad(x, 14, RoadType.Street);
    }
    // Far bank: six tiles east of the station, no bridge yet.
    expect(sim.getTile(19, 14)!.fireCoverage).toBe(0);
    expect(sim.getTile(19, 15)!.fireCoverage).toBe(0);

    expect(sim.placeRoad(16, 14, RoadType.Street)).toBe(true);
    expect(sim.placeRoad(17, 14, RoadType.Street)).toBe(true);
    expect(sim.getTile(19, 14)!.fireCoverage).toBeGreaterThan(0);
    expect(sim.getTile(19, 15)!.fireCoverage).toBeGreaterThan(0);
  });

  it('should reach farther along a highway than a street', () => {
    const street = stationOnStreet('small_fire_station');
    const highway = stationOnStreet('small_fire_station');
    for (let y = 14; y < 32; y++) highway.placeRoad(13, y, RoadType.Highway);

    expect(highway.getTile(13, 24)!.fireCoverage).toBeGreaterThan(street.getTile(13, 24)!.fireCoverage);
    expect(street.getTile(13, 28)!.fireCoverage).toBe(0);
    expect(highway.getTile(13, 28)!.fireCoverage).toBeGreaterThan(0);
  });

  it('should not walk responders across water from the curb', () => {
    const map = new CityMap(8, 8);
    map.getTile(3, 3)!.roadType = RoadType.Street;
    map.getTile(3, 4)!.terrain = TerrainType.Water;
    const dist = dispatchDistances(map, 2, 3, 14);
    expect(dist[3 * 8 + 3]).toBe(1);
    expect(dist[4 * 8 + 3]).toBe(Infinity);
    expect(dist[5 * 8 + 3]).toBe(Infinity);
    expect(dist[2 * 8 + 3]).toBe(2);
  });

  it('should flag a station with no street in the advisory', () => {
    const sim = CitySim.createCity(16, 16);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(4, 4, 'small_power_plant', 0);
    sim.placeServiceBuilding(4, 5, 'small_police_station', 0);
    expect(stationHasRoad(sim.map, 4, 5)).toBe(false);
    sim.setZone(8, 8, ZoneType.Residential);
    sim.placeRoad(8, 9, RoadType.Street);
    expect(sim.stats.advisory).toMatch(/no street/i);
  });
});

describe('FireCoverageSystem', () => {
  it('should ignore an unpowered fire station', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.placeServiceBuilding(12, 12, 'small_fire_station', 0);
    sim.placeRoad(13, 12, RoadType.Street);

    expect(sim.getTile(12, 12)!.powered).toBe(false);
    expect(sim.getTile(12, 12)!.fireCoverage).toBe(0);
    expect(sim.stats.fireAverage).toBe(0);
  });

  it('should send engines along the street from a powered station', () => {
    const sim = stationOnStreet('small_fire_station');

    expect(sim.getTile(12, 13)!.powered).toBe(true);
    expect(sim.getTile(12, 13)!.fireCoverage).toBe(100);
    expect(sim.getTile(12, 14)!.fireCoverage).toBeGreaterThan(0);
    expect(sim.getTile(12, 14)!.fireCoverage).toBeLessThan(100);
    expect(sim.getTile(13, 25)!.fireCoverage).toBeGreaterThan(0);
    expect(sim.getTile(13, 26)!.fireCoverage).toBe(0);
  });

  it('should average fire coverage only on occupied tiles', () => {
    const sim = stationOnStreet('small_fire_station');
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

  it('should water zoned lots beside a powered tower', () => {
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
    // Mains serve lots; bare ground is not one.
    expect(sim.getTile(12, 14)!.watered).toBe(false);
  });

  it('should run mains along the streets a powered tower touches', () => {
    const sim = CitySim.createCity(24, 24);
    sim.stats.money = 100_000;
    sim.batch(() => {
      for (let x = 0; x < 24; x++) sim.placeRoad(x, 5, RoadType.Street);
      sim.setZone(22, 6, ZoneType.Residential);
      sim.setZone(12, 12, ZoneType.Residential);
    });
    sim.placeServiceBuilding(0, 6, 'small_power_plant', 0);
    sim.placeServiceBuilding(1, 6, 'small_water_tower', 0);
    expect(sim.getTile(1, 6)!.powered).toBe(true);
    expect(sim.getTile(22, 6)!.watered).toBe(true);   // far along the street
    expect(sim.getTile(12, 12)!.watered).toBe(false); // off the mains
    expect(sim.stats.waterSupply).toBe(600);
  });
});

describe('CrimeSystem', () => {
  it('should keep empty tiles at crime 0', () => {
    const map = new CityMap(4, 4);
    const stats = emptyStats();
    new CrimeSystem().tick(map, stats);
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
    new CrimeSystem().tick(map, stats);

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
    new CrimeSystem().tick(map, stats);
    expect(tile.crime).toBe(0);
    expect(stats.crimeAverage).toBe(0);
  });

  it('should not write happiness — CitySim composes that separately', () => {
    const map = new CityMap(2, 2);
    map.getTile(0, 0)!.populationDensity = 40;
    map.getTile(0, 0)!.landValue = 50;

    const stats = emptyStats();
    new CrimeSystem().tick(map, stats);
    expect(stats.crimeAverage).toBeGreaterThan(0);
    expect(stats.happiness).toBe(100);
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
    new CrimeSystem().tick(map, stats);
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

  it('should drop happiness as soon as a street is jammed', () => {
    const sim = CitySim.createCity(16, 16);
    for (let i = 0; i < 4; i++) {
      const x = 4 + i;
      sim.growth.buildings.set(`${x},4`, { defId: 'small_shop', x, y: 4 });
      sim.getTile(x, 4)!.buildingId = 'small_shop';
      sim.getTile(x, 4)!.zoneType = ZoneType.Commercial;
    }
    expect(sim.stats.happiness).toBe(100);
    for (let x = 4; x <= 7; x++) sim.placeRoad(x, 5, RoadType.Street);
    expect(sim.getTile(5, 5)!.trafficPressure).toBeGreaterThanOrEqual(8);
    expect(sim.stats.happiness).toBeLessThan(100);
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

  it('should compose happiness once from traffic, walk, transit, and crime', () => {
    const map = new CityMap(4, 4);
    for (let x = 0; x < 4; x++) {
      const tile = map.getTile(x, 0)!;
      tile.roadType = RoadType.Street;
      tile.trafficPressure = 8;
    }
    const stats = emptyStats();
    stats.walkability = 25;
    stats.transitAccess = 15;
    stats.crimeAverage = 20;
    composeHappiness(map, stats, true);
    const first = stats.happiness;
    composeHappiness(map, stats, true);
    expect(stats.happiness).toBe(first);
    // 4 extreme roads (−8) + walk +5 + transit +3 − crime 5 = 95
    expect(first).toBe(100 - 8 + 5 + 3 - 5);
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
