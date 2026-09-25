import { CitySim } from '../openpublica/src/sim/CitySim';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import {
  BAILOUT_OFFER_MONTHS,
  BAILOUT_RATING_PENALTY,
  BAILOUT_TAX_RATE,
  BAILOUT_TERM_MONTHS,
  COUNCIL_CUT_MONTHS,
  biggestCosts,
  formatCosts,
  type CouncilEvent,
} from '../openpublica/src/sim/bankruptcy';
import { ROAD_FUNDING_MIN, SAFETY_FUNDING_MIN } from '../openpublica/src/sim/budgetLevers';
import { bailoutRecap, budgetHoldNote } from '../openpublica/src/ui/chromeCopy';
import type { BudgetTally } from '../openpublica/src/sim/EconomySystem';

/** An empty city in debt: nothing earns or costs, so the debt just stands. */
function brokeCity(money = -1_000): { sim: CitySim; events: CouncilEvent[] } {
  const sim = CitySim.createCity(12, 12);
  sim.stats.money = money;
  sim.stats.bankruptcyWarning = money < 0;
  const events: CouncilEvent[] = [];
  sim.onCouncil = (e) => events.push(e);
  return { sim, events };
}

const months = (sim: CitySim, n: number): void => {
  for (let i = 0; i < n; i++) sim.tick(MONTH_SECONDS);
};

describe('bankruptcy', () => {
  it('should name the month\'s biggest costs', () => {
    const tally = { roadExpenses: 783, serviceExpenses: 240, safetyExpenses: 120, bondExpenses: 500 } as BudgetTally;
    const costs = biggestCosts(tally);
    expect(costs.map((c) => c.label)).toEqual(['roads', 'bond repayments']);
    expect(formatCosts(costs)).toBe('roads $783 and bond repayments $500 a month');
    expect(formatCosts(biggestCosts(tally, 3))).toBe('roads $783, bond repayments $500 and police and fire $120 a month');
    expect(formatCosts([])).toBeNull();
  });

  it('should cut funding to the minimum after a year in debt, and hold it there', () => {
    const { sim, events } = brokeCity();
    months(sim, COUNCIL_CUT_MONTHS - 1);
    expect(sim.stats.debtMonths).toBe(COUNCIL_CUT_MONTHS - 1);
    expect(sim.stats.councilCuts).toBeFalsy();
    expect(sim.stats.advisory).toMatch(/In 1 month the council cuts funding/);
    months(sim, 1);
    expect(events).toEqual(['cuts']);
    expect(sim.stats.councilCuts).toBe(true);
    expect(sim.levers.safetyFunding).toBe(SAFETY_FUNDING_MIN);
    expect(sim.levers.roadFunding).toBe(ROAD_FUNDING_MIN);
    sim.setSafetyFunding(100);
    sim.setRoadFunding(100);
    expect(sim.levers.safetyFunding).toBe(SAFETY_FUNDING_MIN);
    expect(sim.levers.roadFunding).toBe(ROAD_FUNDING_MIN);
    expect(sim.stats.advisory).toMatch(/council has cut police, fire, and road funding/);
    expect(budgetHoldNote(sim.stats)).toMatch(/council holds police, fire, and road funding/);
  });

  it('should lift the council\'s hold once the treasury is out of the red', () => {
    const { sim } = brokeCity();
    months(sim, COUNCIL_CUT_MONTHS);
    sim.stats.money = 500;
    months(sim, 1);
    expect(sim.stats.debtMonths).toBe(0);
    expect(sim.stats.councilCuts).toBe(false);
    sim.setSafetyFunding(100);
    expect(sim.levers.safetyFunding).toBe(100);
  });

  it('should offer a bailout after two years in debt, and clear the debt when it is taken', () => {
    const { sim, events } = brokeCity(-5_000);
    months(sim, BAILOUT_OFFER_MONTHS);
    expect(events).toEqual(['cuts', 'bailout']);
    expect(sim.stats.bailoutOffered).toBe(true);
    expect(sim.stats.advisory).toMatch(/state offers a bailout/);
    const beforeRating = sim.stats.ratingParts!;

    sim.issueBond();
    sim.stats.money = -5_000;
    expect(sim.acceptBailout()).toBe(true);
    expect(sim.stats.money).toBe(0);
    expect(sim.levers.bonds).toEqual([]);
    expect(sim.stats.councilCuts).toBe(false);
    expect(sim.stats.bailoutOffered).toBe(false);
    expect(sim.stats.bailoutMonths).toBe(BAILOUT_TERM_MONTHS);
    expect(sim.stats.bailouts).toBe(1);
    expect([sim.stats.resTaxRate, sim.stats.comTaxRate, sim.stats.indTaxRate]).toEqual([12, 12, 12]);
    expect(sim.acceptBailout()).toBe(false);
    // Out of debt, but the rating carries the penalty (and 12% taxes) while the terms run.
    expect(beforeRating.other).toBeGreaterThanOrEqual(15);
    expect(sim.stats.ratingParts!.other).toBe(BAILOUT_RATING_PENALTY);
    expect(sim.stats.ratingParts!.taxes).toBe(9);
  });

  it('should hold every tax at 12% for the bailout\'s term', () => {
    const { sim } = brokeCity(-5_000);
    months(sim, BAILOUT_OFFER_MONTHS);
    sim.acceptBailout();
    expect(sim.setTaxes(7, 7, 7)).toBe(false);
    expect(sim.stats.resTaxRate).toBe(BAILOUT_TAX_RATE);
    expect(budgetHoldNote(sim.stats)).toBe(`The state bailout holds every tax at 12% for ${BAILOUT_TERM_MONTHS} more months.`);
    months(sim, BAILOUT_TERM_MONTHS - 1);
    expect(sim.stats.bailoutMonths).toBe(1);
    expect(sim.stats.indTaxRate).toBe(BAILOUT_TAX_RATE);
    months(sim, 1);
    expect(sim.stats.bailoutMonths).toBe(0);
    expect(sim.stats.ratingParts!.other).toBe(0);
    expect(sim.setTaxes(7, 8, 9)).toBe(true);
    expect([sim.stats.resTaxRate, sim.stats.comTaxRate, sim.stats.indTaxRate]).toEqual([7, 8, 9]);
  });

  it('should keep the city waiting on an offer across a save', () => {
    const { sim } = brokeCity(-5_000);
    months(sim, BAILOUT_OFFER_MONTHS);
    const save = SaveCodec.encode(sim);
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.stats.bailoutOffered).toBe(true);
    expect(restored.stats.councilCuts).toBe(true);
    expect(restored.stats.debtMonths).toBe(BAILOUT_OFFER_MONTHS);
    // An older save: none of it.
    const old = SaveCodec.encode(CitySim.createCity(12, 12));
    delete (old.stats as { bailoutOffered?: boolean }).bailoutOffered;
    const fresh = CitySim.createCity(12, 12);
    SaveCodec.decode(old, fresh);
    expect(fresh.stats.bailoutOffered).toBe(false);
  });

  it('should list the biggest costs in the deficit advice', () => {
    const sim = CitySim.createCity(12, 12);
    const advice = sim.evaluation;
    Object.assign(sim.stats, { money: 1_000, projectedIncome: 100, projectedExpenses: 600, population: 50 });
    advice.tick(sim.map, sim.growth.buildings, sim.growth.defs, sim.stats, undefined, {
      perTaxPoint: 20,
      costs: [{ label: 'roads', amount: 400 }, { label: 'police and fire', amount: 200 }],
    });
    expect(sim.stats.advisory).toMatch(/in the red.*Biggest costs: roads \$400 and police and fire \$200 a month\./);
  });

  it('should recap two years in debt for the offer', () => {
    const text = bailoutRecap(
      { money: -45_184, population: 32, projectedIncome: 300, projectedExpenses: 2_136, debtMonths: 24 },
      [{ label: 'roads', amount: 783 }, { label: 'bond repayments', amount: 1_000 }],
    );
    expect(text.title).toBe('The state steps in');
    expect(text.body).toBe('2 years in debt: the treasury stands at −$45,184, with 32 people in the city. It spends $1,836 a month more than it takes in; the biggest costs are roads $783 and bond repayments $1,000 a month.');
    expect(text.accept).toMatch(/held at 12% for 5 years, and the rating loses 10/);
  });
});
