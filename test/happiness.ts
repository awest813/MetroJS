import { CitySim } from '../openpublica/src/sim/CitySim';
import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { HAPPY_DRAW, UNHAPPY_FLOOR, composeHappiness, happinessDraw } from '../openpublica/src/sim/happiness';
import { demandForZone, formatGrowthHint, housingDemand } from '../openpublica/src/sim/zoneGrowthHints';
import { happinessTooltip } from '../openpublica/src/ui/chromeCopy';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';

/** Run a month with every growth roll succeeding. */
function growMonth(sim: CitySim): void {
  const original = Math.random;
  Math.random = () => 0;
  try {
    sim.tick(MONTH_SECONDS);
  } finally {
    Math.random = original;
  }
}

describe('happiness draws residents', () => {
  it('should let everyone in from 80, nobody at 30, and a share between', () => {
    expect(happinessDraw(100)).toBe(1);
    expect(happinessDraw(HAPPY_DRAW)).toBe(1);
    expect(happinessDraw(55)).toBeCloseTo(0.5);
    expect(happinessDraw(UNHAPPY_FLOOR)).toBe(0);
    expect(happinessDraw(0)).toBe(0);
    expect(happinessDraw(Number.NaN)).toBe(1);
  });

  it('should turn part of the housing demand away, for houses and mixed use alike', () => {
    const sim = CitySim.createCity(4, 4);
    Object.assign(sim.stats, { residentialDemand: 60, commercialDemand: 20, happiness: 55 });
    expect(housingDemand(sim.stats)).toBe(30);
    expect(demandForZone(ZoneType.Residential, sim.stats)).toBe(30);
    expect(demandForZone(ZoneType.MixedUse, sim.stats)).toBe(20);
    expect(demandForZone(ZoneType.Commercial, sim.stats)).toBe(20);
    sim.stats.happiness = 25;
    expect(demandForZone(ZoneType.Residential, sim.stats)).toBe(0);
    expect(demandForZone(ZoneType.MixedUse, sim.stats)).toBe(0);
  });

  it('should keep the cost and the bonuses of this month apart for the HUD', () => {
    const map = new CityMap(4, 4);
    for (let x = 0; x < 4; x++) {
      const tile = map.getTile(x, 0)!;
      tile.roadType = RoadType.Street;
      tile.trafficPressure = 8;
    }
    const stats = { walkability: 25, transitAccess: 15, crimeAverage: 20, happiness: 100 } as {
      walkability: number; transitAccess: number; crimeAverage: number; happiness: number;
      happinessParts?: { jams: number; crime: number; walk: number; transit: number };
    };
    composeHappiness(map, stats, true);
    expect(stats.happinessParts).toEqual({ jams: 16, crime: 5, walk: 5, transit: 3 });
    expect(stats.happiness).toBe(100 - 16 + 5 + 3 - 5);
  });

  it('should grow no houses while the city is miserable, and grow them once it cheers up', () => {
    const sim = CitySim.createCity(16, 16);
    sim.placeRoad(4, 4, RoadType.Street);
    sim.placeRoad(5, 4, RoadType.Street);
    sim.setZone(4, 5, ZoneType.Residential);
    growMonth(sim);
    expect(sim.getTile(4, 5)!.buildingId).toBe('small_house');

    sim.setZone(5, 5, ZoneType.Residential);
    sim.stats.residentialDemand = 60;
    sim.stats.happiness = UNHAPPY_FLOOR - 5;
    const lot = sim.getTile(5, 5)!;
    expect(formatGrowthHint(lot, sim.map, sim.stats, {})).toMatch(/people are staying away — happiness is 25/);
    growMonth(sim);
    expect(lot.buildingId).toBeNull();

    sim.stats.residentialDemand = 60;
    sim.stats.happiness = 100;
    growMonth(sim);
    expect(lot.buildingId).toBe('small_house');
  });

  it('should explain what made happiness and how many it lets in', () => {
    const parts = { jams: 12, crime: 8, walk: 4, transit: 0 };
    expect(happinessTooltip(72, parts)).toBe(
      'Happiness 72: jammed roads −12, crime −8; walkable streets +4 and transit +0 win some back. ' +
      'Below 80 fewer people move in: 84% of the housing demand now; none at 30.',
    );
    expect(happinessTooltip(90, parts)).toMatch(/everyone the housing demand calls for moves in/);
    expect(happinessTooltip(20, parts)).toMatch(/nobody moves in, and residents leave/);
    expect(happinessTooltip(100, undefined)).toMatch(/^Happiness 100: jammed roads and crime cost it/);
  });
});
