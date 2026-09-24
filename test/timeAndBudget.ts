import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType } from '../openpublica/src/sim/CityTile';
import { SimulationClock } from '../openpublica/src/sim/SimulationClock';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { MAX_FRAME_SECONDS, simSecondsForFrame } from '../openpublica/src/ui/SpeedBar';
import { formatRunway } from '../openpublica/src/ui/chromeCopy';

describe('calendar', () => {
  it('should count the days of each month across its 30 simulated seconds', () => {
    const clock = new SimulationClock();
    expect(clock.dateLabel).toBe('Jan 1, 2000');
    clock.tick(MONTH_SECONDS / 2);
    expect(clock.monthProgress).toBeCloseTo(0.5);
    expect(clock.dayOfMonth).toBe(16);
    clock.tick(MONTH_SECONDS / 2 - 0.01);
    expect(clock.dateLabel).toBe('Jan 31, 2000');
    clock.tick(0.01);
    expect(clock.dateLabel).toBe('Feb 1, 2000');
    clock.tick(MONTH_SECONDS - 0.01);
    expect(clock.dayOfMonth).toBe(28);
    clock.restore(MONTH_SECONDS * 23 + 1);
    expect(clock.dateLabel).toBe('Dec 2, 2001');
    expect(clock.monthOfYear).toBe(11);
  });
});

describe('frame time', () => {
  it('should advance the sim by the frame at the chosen speed', () => {
    expect(simSecondsForFrame(16, 1)).toBeCloseTo(0.016);
    expect(simSecondsForFrame(16, 4)).toBeCloseTo(0.064);
    expect(simSecondsForFrame(16, 0)).toBe(0);
  });

  it('should not age the city for time the tab spent hidden', () => {
    // Ten minutes away is one short step, not twenty months.
    expect(simSecondsForFrame(600_000, 1)).toBe(MAX_FRAME_SECONDS);
    expect(simSecondsForFrame(600_000, 4)).toBe(MAX_FRAME_SECONDS * 4);
    expect(simSecondsForFrame(-5, 1)).toBe(0);
    expect(simSecondsForFrame(Number.NaN, 1)).toBe(0);
  });
});

describe('budget runway', () => {
  it('should say how long the money lasts in the red, and nothing when in the black', () => {
    expect(formatRunway(5000, 100)).toBeNull();
    expect(formatRunway(5000, 0)).toBeNull();
    expect(formatRunway(5000, -1000)).toBe('Money runs out in about 5 months at this rate.');
    expect(formatRunway(900, -1000)).toBe('Money runs out this month at this rate.');
    expect(formatRunway(1500, -1000)).toBe('Money runs out in about 1 month at this rate.');
    expect(formatRunway(100_000, -100)).toBeNull();
    expect(formatRunway(-20, 50)).toMatch(/^In debt/);
  });

  it('should warn before a deficit empties the treasury, not years ahead', () => {
    const sim = CitySim.createCity(8, 8);
    sim.pinWeather('clear');
    sim.batch(() => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) sim.placeRoad(x, y, RoadType.Street);
    });
    // 64 streets × $3 = $192 a month and no taxpayers.
    sim.stats.money = 1000;
    sim.evaluate();
    expect(sim.stats.advisory).toBe(
      'The budget is $192/mo in the red — money runs out in about 5 months. Raise taxes or cut upkeep.',
    );
    sim.stats.money = 100_000;
    sim.evaluate();
    expect(sim.stats.advisory).not.toMatch(/in the red/);
  });

  it('should split the tax take by zone and add it up', () => {
    const sim = CitySim.createCity(8, 8);
    const b = sim.budget;
    expect(b.income).toBe(b.resIncome + b.comIncome + b.indIncome);
    expect(b.expenses).toBe(b.roadExpenses + b.serviceExpenses);
  });
});
