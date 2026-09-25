import { CitySim } from '../openpublica/src/sim/CitySim';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  SCENARIO_GOALS,
  checkScenario,
  formatMonths,
  goalFor,
  monthsLeft,
  scenarioLabel,
  scenarioText,
  startScenario,
} from '../openpublica/src/scenarios/goals';
import { START_TREASURY, newGameSearch, parseNewGame } from '../openpublica/src/scenarios/newGame';
import { TEST_CITIES } from '../openpublica/src/scenarios/testCities';
import { simSecondsForFrame } from '../openpublica/src/ui/SpeedBar';

describe('new game', () => {
  it('should offer three starting treasuries', () => {
    expect(START_TREASURY).toEqual({ easy: 20_000, normal: 10_000, hard: 5_000 });
  });

  it('should carry the choosing flag, the map, and the treasury in the address', () => {
    expect(parseNewGame('')).toEqual({ choosing: false, seed: null, difficulty: 'normal' });
    expect(parseNewGame(newGameSearch(1234, 'hard'))).toEqual({ choosing: true, seed: 1234, difficulty: 'hard' });
    expect(parseNewGame('?new=1&seed=77')).toEqual({ choosing: true, seed: 77, difficulty: 'normal' });
    // Nonsense falls back to a random map and Normal.
    expect(parseNewGame('?seed=abc&start=insane')).toEqual({ choosing: false, seed: null, difficulty: 'normal' });
    expect(newGameSearch(5)).toBe('?new=1&seed=5');
  });

  it('should run a finished city at 8×', () => {
    expect(simSecondsForFrame(100, 8)).toBeCloseTo(0.8);
  });
});

describe('scenarios', () => {
  it('should give every test city a goal and a deadline', () => {
    for (const city of TEST_CITIES) {
      const goal = goalFor(city.id);
      expect(goal).toBeDefined();
      expect(goal!.months).toBeGreaterThanOrEqual(24);
    }
    expect(SCENARIO_GOALS).toHaveLength(TEST_CITIES.length);
  });

  it('should be won when the goal is met in time', () => {
    const sim = CitySim.createCity(12, 12);
    startScenario(sim, 'troubled');
    expect(sim.stats.scenario).toEqual({ id: 'troubled', start: 0, status: 'active' });
    expect(checkScenario(sim)).toBeNull();
    expect(scenarioLabel(sim)).toBe('Goal 0/300 people · 5y 0m');
    sim.stats.population = 312;
    expect(checkScenario(sim)).toBe('won');
    expect(scenarioLabel(sim)).toBe('Goal met');
    expect(scenarioText(sim)!.body).toBe('Get back to 300 people: done, with 312/300 people and 5 years to spare. Keep building, or start a new city.');
    // Won stays won.
    sim.stats.population = 10;
    expect(checkScenario(sim)).toBeNull();
  });

  it('should be lost when the deadline passes first', () => {
    const sim = CitySim.createCity(12, 12);
    startScenario(sim, 'sprawl');
    for (let m = 0; m < 23; m++) sim.tick(MONTH_SECONDS);
    expect(monthsLeft(sim, sim.stats.scenario!)).toBe(1);
    expect(checkScenario(sim)).toBeNull();
    sim.tick(MONTH_SECONDS);
    expect(checkScenario(sim)).toBe('lost');
    expect(scenarioText(sim)!.title).toBe("Time's up");
    expect(scenarioText(sim)!.body).toMatch(/^Water every building on the strip within 2 years: missed, at 0\/0 buildings watered\./);
  });

  it('should keep a scenario across a save', () => {
    const sim = CitySim.createCity(12, 12);
    startScenario(sim, 'riverside');
    sim.tick(MONTH_SECONDS);
    const save = SaveCodec.encode(sim);
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.stats.scenario).toEqual({ id: 'riverside', start: 0, status: 'active' });
    expect(monthsLeft(restored, restored.stats.scenario!)).toBe(47);
    // A plain city has none.
    const plain = CitySim.createCity(12, 12);
    SaveCodec.decode(SaveCodec.encode(plain), plain);
    expect(plain.stats.scenario).toBeUndefined();
    expect(scenarioLabel(plain)).toBeNull();
  });

  it('should say months plainly', () => {
    expect(formatMonths(0)).toBe('0 months');
    expect(formatMonths(1)).toBe('1 month');
    expect(formatMonths(24)).toBe('2 years');
    expect(formatMonths(40)).toBe('3 years 4 months');
  });
});
