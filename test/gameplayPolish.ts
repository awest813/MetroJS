import { CityMap } from '../openpublica/src/sim/CityMap';
import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType, TerrainType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  STARTER_RESIDENTIAL_DEMAND,
  demandForZone,
  formatGrowthHint,
  tileHasAdjacentRoad,
} from '../openpublica/src/sim/zoneGrowthHints';
import { explainToolFailure } from '../openpublica/src/tools/toolFeedback';
import { RoadTool } from '../openpublica/src/tools/RoadTool';
import { BulldozeTool } from '../openpublica/src/tools/BulldozeTool';

describe('zoneGrowthHints', () => {
  it('should keep starter residential demand on an empty city after a month', () => {
    const sim = CitySim.createCity(8, 8);
    expect(sim.stats.residentialDemand).toBe(STARTER_RESIDENTIAL_DEMAND);
    sim.tick(MONTH_SECONDS);
    expect(sim.stats.residentialDemand).toBe(STARTER_RESIDENTIAL_DEMAND);
    expect(sim.stats.commercialDemand).toBe(0);
  });

  it('should flag lots that need a neighbouring road', () => {
    const map = new CityMap(8, 8);
    map.getTile(2, 2)!.zoneType = ZoneType.Residential;
    expect(tileHasAdjacentRoad(map, 2, 2)).toBe(false);
    const hint = formatGrowthHint(map.getTile(2, 2)!, map, {
      ...CitySim.createCity(8, 8).stats,
    });
    expect(hint).toBe('needs a road next door');
  });

  it('should tell the player not to wait for houses on the road itself', () => {
    const map = new CityMap(8, 8);
    const tile = map.getTile(2, 2)!;
    tile.zoneType = ZoneType.Residential;
    tile.roadType = RoadType.Street;
    const hint = formatGrowthHint(tile, map, CitySim.createCity(8, 8).stats);
    expect(hint).toMatch(/beside the street/);
  });

  it('should use the weaker demand for mixed-use', () => {
    const stats = CitySim.createCity(8, 8).stats;
    stats.residentialDemand = 40;
    stats.commercialDemand = 0;
    expect(demandForZone(ZoneType.MixedUse, stats)).toBe(0);
  });
});

describe('explainToolFailure', () => {
  it('should name water instead of failing silently', () => {
    const sim = CitySim.createCity(8, 8);
    sim.getTile(1, 1)!.terrain = TerrainType.Water;
    expect(explainToolFailure('road', { x: 1, y: 1 }, sim)).toMatch(/water/i);
  });

  it('should mention funds for a street', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 0;
    expect(explainToolFailure('road', { x: 0, y: 0 }, sim)).toMatch(/Need \$10/);
  });

  it('should mention funds for a highway', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 0;
    expect(explainToolFailure('highway', { x: 0, y: 0 }, sim)).toMatch(/Need \$25/);
  });

  it('should skip charging a second street on the same tile', () => {
    const sim = CitySim.createCity(8, 8);
    const tool = new RoadTool();
    expect(tool.apply({ x: 0, y: 0 }, sim)).toBe(true);
    expect(tool.apply({ x: 0, y: 0 }, sim)).toBe(false);
  });

  it('should refuse a police station without funds', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 0;
    expect(explainToolFailure('placePoliceStation', { x: 0, y: 0 }, sim)).toMatch(/Need \$400/);
  });

  it('should refuse a fire station without funds', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 0;
    expect(explainToolFailure('placeFireStation', { x: 0, y: 0 }, sim)).toMatch(/Need \$400/);
  });

  it('should refuse a water tower without funds', () => {
    const sim = CitySim.createCity(8, 8);
    sim.stats.money = 0;
    expect(explainToolFailure('placeWaterTower', { x: 0, y: 0 }, sim)).toMatch(/Need \$350/);
  });

  it('should refuse a power plant on an occupied lot', () => {
    const sim = CitySim.createCity(8, 8);
    expect(sim.placeServiceBuilding(2, 2, 'small_park', 0)).toBe(true);
    expect(sim.placeServiceBuilding(2, 2, 'small_power_plant', 0)).toBe(false);
  });

  it('should not bulldoze empty grass', () => {
    const sim = CitySim.createCity(8, 8);
    const money = sim.stats.money;
    expect(new BulldozeTool().apply({ x: 0, y: 0 }, sim)).toBe(false);
    expect(sim.stats.money).toBe(money);
  });

  it('should refuse to zone a street', () => {
    const sim = CitySim.createCity(8, 8);
    sim.placeRoad(0, 0, RoadType.Street);
    expect(explainToolFailure('zoneResidentialLow', { x: 0, y: 0 }, sim)).toMatch(/beside the street/);
  });
});
