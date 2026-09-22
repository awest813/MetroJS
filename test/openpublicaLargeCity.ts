import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { generateTerrain } from '../openpublica/src/sim/TerrainGenerator';
import { MAP_SIZE, MONTH_SECONDS } from '../openpublica/src/data/constants';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import {
  FIRE_STATION_COST,
  PARK_COST,
  POLICE_STATION_COST,
  POWER_PLANT_COST,
  WATER_TOWER_COST,
} from '../openpublica/src/tools/serviceCatalog';

const SIM_YEARS = 4;
const SIM_MONTHS = SIM_YEARS * 12;
const START_YEAR = 2000;
const GRID_SPACING = 6;
const SEED = 2026;

function finiteStats(sim: CitySim): void {
  const s = sim.stats;
  const numeric: Array<keyof typeof s> = [
    'population', 'jobs', 'money', 'residentialDemand', 'commercialDemand',
    'industrialDemand', 'resTaxRate', 'comTaxRate', 'indTaxRate',
    'monthlyIncome', 'monthlyExpenses', 'serviceExpenses', 'projectedIncome',
    'projectedExpenses', 'happiness', 'walkability',
    'transitAccess', 'pollutionAverage', 'crimeAverage', 'fireAverage', 'waterAverage', 'approval',
  ];
  for (const key of numeric) {
    expect(Number.isFinite(s[key] as number)).toBe(true);
  }
  expect(s.population).toBeGreaterThanOrEqual(0);
  expect(s.jobs).toBeGreaterThanOrEqual(0);
  expect(typeof s.bankruptcyWarning).toBe('boolean');
  expect(typeof s.advisory).toBe('string');
}

function countBuildings(sim: CitySim): number {
  let count = 0;
  sim.map.forEach((tile) => {
    if (tile.buildingId !== null) count += 1;
  });
  return count;
}

function countZonedLots(sim: CitySim): number {
  let count = 0;
  sim.map.forEach((tile) => {
    if (tile.zoneType !== ZoneType.None && tile.buildingId === null && tile.roadType === RoadType.None) {
      count += 1;
    }
  });
  return count;
}

function isAdjacentToRoad(sim: CitySim, x: number, y: number): boolean {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const neighbour = sim.getTile(x + dx, y + dy);
    if (neighbour && neighbour.roadType !== RoadType.None) return true;
  }
  return false;
}

function pickServiceSite(sim: CitySim, cx: number, cy: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const tile = sim.getTile(x, y);
        if (!tile || tile.terrain === TerrainType.Water) continue;
        if (tile.roadType !== RoadType.None || tile.buildingId !== null) continue;
        if (tile.zoneType !== ZoneType.None) continue;
        if (!isAdjacentToRoad(sim, x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

/** Lay out a street grid, zone blocks, and civic services on a full-size map. */
function buildLargeCity(sim: CitySim): { roads: number; zones: number } {
  sim.stats.money = 500_000;

  let roads = 0;
  for (let x = GRID_SPACING; x < sim.map.width - GRID_SPACING; x += GRID_SPACING) {
    for (let y = 1; y < sim.map.height - 1; y++) {
      if (!sim.isBuildable(x, y)) continue;
      sim.placeRoad(x, y, RoadType.Street);
      roads += 1;
    }
  }
  for (let y = GRID_SPACING; y < sim.map.height - GRID_SPACING; y += GRID_SPACING) {
    for (let x = 1; x < sim.map.width - 1; x++) {
      if (!sim.isBuildable(x, y)) continue;
      sim.placeRoad(x, y, RoadType.Street);
      roads += 1;
    }
  }

  let zones = 0;
  sim.map.forEach((tile) => {
    if (tile.roadType !== RoadType.None) return;
    if (tile.terrain === TerrainType.Water) return;
    if (tile.buildingId !== null) return;
    if (!isAdjacentToRoad(sim, tile.x, tile.y)) return;

    let zoneType = ZoneType.MixedUse;
    if (tile.x < sim.map.width * 0.55 && tile.y < sim.map.height * 0.55) {
      zoneType = ZoneType.Residential;
    } else if (tile.x >= sim.map.width * 0.55 && tile.y < sim.map.height * 0.6) {
      zoneType = ZoneType.Commercial;
    } else if (tile.y >= sim.map.height * 0.6) {
      zoneType = ZoneType.Industrial;
    }

    sim.setZone(tile.x, tile.y, zoneType);
    zones += 1;
  });

  const serviceSites = [
    { cx: GRID_SPACING * 2, cy: GRID_SPACING * 2, defId: 'small_power_plant', cost: POWER_PLANT_COST },
    { cx: GRID_SPACING * 6, cy: GRID_SPACING * 2, defId: 'small_power_plant', cost: POWER_PLANT_COST },
    { cx: GRID_SPACING * 4, cy: GRID_SPACING * 4, defId: 'small_park', cost: PARK_COST },
    { cx: GRID_SPACING * 2, cy: GRID_SPACING * 6, defId: 'small_police_station', cost: POLICE_STATION_COST },
    { cx: GRID_SPACING * 6, cy: GRID_SPACING * 6, defId: 'small_fire_station', cost: FIRE_STATION_COST },
    { cx: GRID_SPACING * 4, cy: GRID_SPACING * 8, defId: 'small_water_tower', cost: WATER_TOWER_COST },
  ];

  for (const site of serviceSites) {
    const coord = pickServiceSite(sim, site.cx, site.cy);
    if (!coord) continue;
    sim.placeServiceBuilding(coord.x, coord.y, site.defId, site.cost);
  }

  return { roads, zones };
}

function simulateYears(sim: CitySim, months: number): void {
  for (let month = 0; month < months; month++) {
    sim.tick(MONTH_SECONDS);
    finiteStats(sim);
  }
}

describe('OpenPublica large city (4 years)', () => {
  it('should grow a grid city for four in-game years', () => {
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE, SEED);
    generateTerrain(sim.map, SEED);

    const layout = buildLargeCity(sim);
    expect(layout.roads).toBeGreaterThan(400);
    expect(layout.zones).toBeGreaterThan(200);
    expect(countZonedLots(sim)).toBe(layout.zones);

    simulateYears(sim, SIM_MONTHS);

    expect(sim.clock.monthsPassed).toBe(SIM_MONTHS);
    expect(sim.clock.year).toBe(START_YEAR + SIM_YEARS);

    const buildings = countBuildings(sim);
    expect(buildings).toBeGreaterThan(50);
    expect(sim.stats.population).toBeGreaterThan(100);
    expect(sim.stats.jobs).toBeGreaterThan(20);
    expect(sim.stats.residentialDemand).toBeGreaterThan(0);

    const save = SaveCodec.encode(sim);
    const restored = CitySim.createCity(MAP_SIZE, MAP_SIZE);
    SaveCodec.decode(save, restored);
    expect(restored.clock.totalSeconds).toBe(sim.clock.totalSeconds);
    expect(restored.stats.population).toBe(sim.stats.population);
    expect(restored.stats.jobs).toBe(sim.stats.jobs);
    expect(countBuildings(restored)).toBe(buildings);
  });
});
