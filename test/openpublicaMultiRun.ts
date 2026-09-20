import { CitySim } from '../openpublica/src/sim/CitySim';
import { TerrainType } from '../openpublica/src/sim/CityTile';
import { generateTerrain } from '../openpublica/src/sim/TerrainGenerator';
import { HeightField } from '../openpublica/src/sim/HeightField';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { ToolController } from '../openpublica/src/tools/ToolController';
import { InspectTool } from '../openpublica/src/tools/InspectTool';
import { RoadTool } from '../openpublica/src/tools/RoadTool';
import { createResidentialLowBrush } from '../openpublica/src/tools/ZoneBrushTool';
import { PlacePowerPlantTool } from '../openpublica/src/tools/PlacePowerPlantTool';
import { PlaceParkTool } from '../openpublica/src/tools/PlaceParkTool';
import { sfxForTool, FAIL_VOICE, GROWTH_VOICE } from '../openpublica/src/audio/voices';

const RUNS = 5;
const SEEDS = [2026, 7, 99, 1337, 4242];

function firstBuildable(sim: CitySim): { x: number; y: number } {
  let found: { x: number; y: number } | null = null;
  sim.map.forEach((tile) => {
    if (found) return;
    if (tile.terrain !== TerrainType.Water) found = { x: tile.x, y: tile.y };
  });
  if (!found) throw new Error('map has no land');
  return found;
}

function finiteStats(sim: CitySim): void {
  const s = sim.stats;
  const numeric: Array<keyof typeof s> = [
    'population', 'jobs', 'money', 'residentialDemand', 'commercialDemand',
    'industrialDemand', 'resTaxRate', 'comTaxRate', 'indTaxRate',
    'monthlyIncome', 'monthlyExpenses', 'happiness', 'walkability',
    'transitAccess', 'pollutionAverage',
  ];
  for (const key of numeric) {
    expect(Number.isFinite(s[key] as number)).toBe(true);
  }
  expect(s.population).toBeGreaterThanOrEqual(0);
  expect(s.jobs).toBeGreaterThanOrEqual(0);
  expect(typeof s.bankruptcyWarning).toBe('boolean');
}

function playCity(seed: number): CitySim {
  const sim = CitySim.createCity(32, 32);
  generateTerrain(sim.map, seed);
  const heights = HeightField.fromMap(sim.map, seed);
  const origin = firstBuildable(sim);
  expect(Number.isFinite(heights.tileCenter(origin.x, origin.y))).toBe(true);

  const ctrl = new ToolController(new InspectTool());
  ctrl.register(new RoadTool());
  ctrl.register(createResidentialLowBrush());
  ctrl.register(new PlacePowerPlantTool());
  ctrl.register(new PlaceParkTool());

  ctrl.setActiveTool('road');
  let streetTiles = 0;
  for (let i = 0; i < 8; i++) {
    const coord = { x: origin.x + i, y: origin.y };
    if (!sim.isBuildable(coord.x, coord.y)) continue;
    ctrl.resetDrag();
    const result = ctrl.applyToTile(coord, sim);
    if (result === 'applied') streetTiles += 1;
  }
  expect(streetTiles).toBeGreaterThan(0);

  const firstStreet = { x: origin.x, y: origin.y };
  ctrl.resetDrag();
  expect(ctrl.applyToTile(firstStreet, sim)).toBe('unchanged');
  expect(ctrl.applyToTile(firstStreet, sim)).toBe('repeat');

  ctrl.setActiveTool('zoneResidentialLow');
  ctrl.resetDrag();
  const zoneY = origin.y + 1;
  if (sim.isBuildable(origin.x, zoneY)) {
    expect(ctrl.applyToTile({ x: origin.x, y: zoneY }, sim)).toBe('applied');
  }

  ctrl.setActiveTool('placePowerPlant');
  ctrl.resetDrag();
  const plant = { x: origin.x, y: origin.y + 2 };
  if (sim.isBuildable(plant.x, plant.y) && sim.getTile(plant.x, plant.y)?.roadType === 0) {
    ctrl.applyToTile(plant, sim);
  }

  ctrl.setActiveTool('placePark');
  ctrl.resetDrag();
  const park = { x: origin.x + 1, y: origin.y + 2 };
  if (sim.isBuildable(park.x, park.y)) {
    ctrl.applyToTile(park, sim);
  }

  for (let month = 0; month < 18; month++) {
    sim.tick(MONTH_SECONDS);
    finiteStats(sim);
  }

  const save = SaveCodec.encode(sim);
  const restored = CitySim.createCity(32, 32);
  SaveCodec.decode(save, restored);
  expect(restored.stats.money).toBe(sim.stats.money);
  expect(restored.stats.population).toBe(sim.stats.population);
  expect(restored.clock.totalSeconds).toBe(sim.clock.totalSeconds);
  return sim;
}

describe('OpenPublica multiple runs', () => {
  it('should play, save, and restore five independent cities', () => {
    const moneys: number[] = [];
    for (const seed of SEEDS) {
      const sim = playCity(seed);
      moneys.push(sim.stats.money);
    }
    expect(moneys).toHaveLength(RUNS);
    expect(moneys.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('should round-trip the same city five times without drift', () => {
    const sim = playCity(2026);
    let current = sim;
    for (let i = 0; i < RUNS; i++) {
      const save = SaveCodec.encode(current);
      const next = CitySim.createCity(32, 32);
      SaveCodec.decode(save, next);
      expect(next.stats.money).toBe(sim.stats.money);
      expect(next.stats.population).toBe(sim.stats.population);
      current = next;
    }
  });

  it('should keep inspect silent and give every build tool a voice', () => {
    expect(sfxForTool('inspect')).toBeNull();
    expect(sfxForTool('road')?.kind).toBe('blip');
    expect(sfxForTool('bulldoze')?.kind).toBe('noise');
    expect(FAIL_VOICE.gain).toBeGreaterThan(0);
    expect(GROWTH_VOICE.kind).toBe('chord');
  });
});
