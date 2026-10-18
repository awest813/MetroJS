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
const MONTHS_PER_YEAR = 12;
const SIM_MONTHS = SIM_YEARS * MONTHS_PER_YEAR;
const START_YEAR = 2000;
const GRID_SPACING = 6;
const SEED = 2026;

interface CityCensus {
  year: number;
  monthName: string;
  monthsPassed: number;
  population: number;
  darkPopulation: number;
  jobs: number;
  money: number;
  buildings: number;
  houses: number;
  shops: number;
  workshops: number;
  mixed: number;
  services: number;
  happiness: number;
  approval: number;
  walkability: number;
  crimeAverage: number;
  pollutionAverage: number;
  fireAverage: number;
  waterAverage: number;
  bankruptcyWarning: boolean;
  advisory: string;
}

const SERVICE_IDS = new Set([
  'small_power_plant',
  'small_park',
  'small_police_station',
  'small_fire_station',
  'small_water_tower',
]);

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

function takeCensus(sim: CitySim): CityCensus {
  const buildings = { houses: 0, shops: 0, workshops: 0, mixed: 0, services: 0, total: 0 };
  sim.map.forEach((tile) => {
    if (tile.buildingId === null) return;
    buildings.total += 1;
    if (SERVICE_IDS.has(tile.buildingId)) buildings.services += 1;
    else if (tile.buildingId === 'small_house' || tile.buildingId === 'rowhouse') buildings.houses += 1;
    else if (tile.buildingId === 'small_shop') buildings.shops += 1;
    else if (tile.buildingId === 'light_workshop') buildings.workshops += 1;
    else buildings.mixed += 1;
  });
  return {
    year: sim.clock.year,
    monthName: sim.clock.monthName,
    monthsPassed: sim.clock.monthsPassed,
    population: sim.stats.population,
    darkPopulation: sim.stats.darkPopulation,
    jobs: sim.stats.jobs,
    money: sim.stats.money,
    buildings: buildings.total,
    houses: buildings.houses,
    shops: buildings.shops,
    workshops: buildings.workshops,
    mixed: buildings.mixed,
    services: buildings.services,
    happiness: sim.stats.happiness,
    approval: sim.stats.approval,
    walkability: sim.stats.walkability,
    crimeAverage: sim.stats.crimeAverage,
    pollutionAverage: sim.stats.pollutionAverage,
    fireAverage: sim.stats.fireAverage,
    waterAverage: sim.stats.waterAverage,
    bankruptcyWarning: sim.stats.bankruptcyWarning,
    advisory: sim.stats.advisory,
  };
}

function isAdjacentToRoad(sim: CitySim, x: number, y: number): boolean {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const neighbour = sim.getTile(x + dx, y + dy);
    if (neighbour && neighbour.roadType !== RoadType.None) return true;
  }
  return false;
}

function pickServiceSite(
  sim: CitySim,
  cx: number,
  cy: number,
  used: Set<string>,
): { x: number; y: number } | null {
  for (let radius = 1; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const key = `${x},${y}`;
        if (used.has(key)) continue;
        const tile = sim.getTile(x, y);
        if (!tile || tile.terrain === TerrainType.Water) continue;
        if (tile.roadType !== RoadType.None || tile.buildingId !== null) continue;
        if (!isAdjacentToRoad(sim, x, y)) continue;
        used.add(key);
        return { x, y };
      }
    }
  }
  return null;
}

function placeService(
  sim: CitySim,
  used: Set<string>,
  cx: number,
  cy: number,
  defId: string,
  cost: number,
): boolean {
  const coord = pickServiceSite(sim, cx, cy, used);
  if (!coord) return false;
  return sim.placeServiceBuilding(coord.x, coord.y, defId, cost);
}

/** Street grid, civic coverage, then zoned lots on a full 64×64 map. */
function buildLargeCity(sim: CitySim): { roads: number; zones: number; services: number } {
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

  const used = new Set<string>();
  let services = 0;
  const civicStep = GRID_SPACING * 3;

  for (let x = GRID_SPACING; x < sim.map.width; x += civicStep) {
    for (let y = GRID_SPACING; y < sim.map.height; y += civicStep) {
      if (placeService(sim, used, x, y, 'small_power_plant', POWER_PLANT_COST)) services += 1;
      if (placeService(sim, used, x + 2, y, 'small_water_tower', WATER_TOWER_COST)) services += 1;
    }
  }
  for (let x = GRID_SPACING * 2; x < sim.map.width; x += civicStep) {
    for (let y = GRID_SPACING * 2; y < sim.map.height; y += civicStep) {
      if (placeService(sim, used, x, y, 'small_police_station', POLICE_STATION_COST)) services += 1;
      if (placeService(sim, used, x, y + 2, 'small_fire_station', FIRE_STATION_COST)) services += 1;
      if (placeService(sim, used, x + 2, y + 2, 'small_park', PARK_COST)) services += 1;
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

  return { roads, zones, services };
}

/** Mulberry32 so the 48-month growth pass is deterministic. */
function seedRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateFourYears(sim: CitySim): CityCensus[] {
  const years: CityCensus[] = [];
  for (let month = 0; month < SIM_MONTHS; month++) {
    sim.tick(MONTH_SECONDS);
    finiteStats(sim);
    if ((month + 1) % MONTHS_PER_YEAR === 0) {
      years.push(takeCensus(sim));
    }
  }
  return years;
}

describe('OpenPublica large city (4 years)', () => {
  it('should fully simulate a grid city for four in-game years', () => {
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE, SEED);
    generateTerrain(sim.map, SEED);

    const layout = buildLargeCity(sim);
    expect(layout.roads).toBeGreaterThan(400);
    expect(layout.zones).toBeGreaterThan(200);
    expect(layout.services).toBeGreaterThan(10);

    const originalRandom = Math.random;
    Math.random = seedRandom(SEED);
    let years: CityCensus[];
    try {
      years = simulateFourYears(sim);
    } finally {
      Math.random = originalRandom;
    }

    expect(years).toHaveLength(SIM_YEARS);
    expect(sim.clock.monthsPassed).toBe(SIM_MONTHS);
    expect(sim.clock.year).toBe(START_YEAR + SIM_YEARS);

    console.log('4-year large city layout', layout);
    console.log('4-year large city census', years);

    for (let i = 0; i < years.length; i++) {
      const census = years[i];
      expect(census.monthsPassed).toBe((i + 1) * MONTHS_PER_YEAR);
      expect(census.year).toBe(START_YEAR + i + 1);
      expect(census.population).toBeGreaterThan(200);
      expect(census.jobs).toBeGreaterThan(50);
      expect(census.buildings).toBeGreaterThan(layout.services);
      expect(census.bankruptcyWarning).toBe(false);
    }

    const year4 = years[years.length - 1];
    expect(year4.houses + year4.shops + year4.workshops + year4.mixed).toBeGreaterThan(40);

    const save = SaveCodec.encode(sim);
    const restored = CitySim.createCity(MAP_SIZE, MAP_SIZE);
    SaveCodec.decode(save, restored);
    expect(restored.clock.totalSeconds).toBe(sim.clock.totalSeconds);
    expect(restored.stats.population).toBe(sim.stats.population);
    expect(restored.stats.jobs).toBe(sim.stats.jobs);
    expect(takeCensus(restored).buildings).toBe(year4.buildings);
  }, 120_000);
});
