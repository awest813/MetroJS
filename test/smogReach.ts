import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { SMOG_NOTICED, formatSmogReach, smogReach } from '../openpublica/src/sim/smogReach';
import { POLLUTION_STRESS_THRESHOLD } from '../openpublica/src/sim/zoneGrowthHints';
import { createResidentialLowBrush, ZoneBrushTool } from '../openpublica/src/tools/ZoneBrushTool';
import { formatAreaPlan, planZoneArea } from '../openpublica/src/tools/zoneArea';

describe('smog reach (G5)', () => {
  function street(): CitySim {
    const sim = CitySim.createCity(40, 40);
    sim.stats.money = 100_000;
    for (let x = 2; x < 38; x++) sim.placeRoad(x, 10, RoadType.Street);
    for (let x = 4; x < 12; x++) sim.setZone(x, 11, ZoneType.Residential);
    return sim;
  }

  it('should count the homes a plant beside them would smog, and those it would drive out', () => {
    const sim = street();
    const plant = sim.growth.defs.get('small_power_plant')!;
    const beside = smogReach(sim.map, [{ x: 8, y: 9 }], plant.pollutionOutput!, plant.pollutionRadius!);
    expect(beside.homes).toBe(8);
    expect(beside.tiles.every((t) => t.added >= SMOG_NOTICED)).toBe(true);
    expect(beside.drivenOut).toBe(0);
    expect(formatSmogReach(beside, 'its')).toBe('its smog would reach 8 homes');
    // Where the air is already thick, the same plant drives homes out.
    for (let x = 4; x < 12; x++) sim.getTile(x, 11)!.pollution = POLLUTION_STRESS_THRESHOLD - 20;
    const thick = smogReach(sim.map, [{ x: 8, y: 9 }], plant.pollutionOutput!, plant.pollutionRadius!);
    expect(thick.drivenOut).toBeGreaterThan(0);
    expect(formatSmogReach(thick, 'its')).toMatch(/, enough to drive \d+ out$/);
  });

  it('should find no homes in the smog of a plant well away from town', () => {
    const sim = street();
    const plant = sim.growth.defs.get('small_power_plant')!;
    const away = smogReach(sim.map, [{ x: 36, y: 9 }], plant.pollutionOutput!, plant.pollutionRadius!);
    expect(away.tiles).toHaveLength(0);
    expect(formatSmogReach(away, 'its')).toBeNull();
  });

  it("should show a factory area's smog on the homes beside it, and none for a housing area", () => {
    const sim = street();
    const factories = new ZoneBrushTool(ZoneType.Industrial);
    const plan = planZoneArea(factories, { x: 4, y: 7 }, { x: 11, y: 9 }, sim, false);
    expect(plan.smog!.homes).toBe(8);
    expect(formatAreaPlan(factories.label, plan, false, false)).toMatch(/its factories' smog would reach 8 homes/);
    const houses = planZoneArea(createResidentialLowBrush(), { x: 20, y: 11 }, { x: 25, y: 12 }, sim, false);
    expect(houses.smog).toBeUndefined();
  });

  it('should tell a new player to keep the plant away from the houses', () => {
    const sim = CitySim.createCity(8, 8);
    expect(sim.stats.advisory).toMatch(/away from the houses/);
  });
});
