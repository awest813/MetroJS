import {
  STRATEGIES,
  playStrategy,
  summarize,
  taxStrategy,
  type StrategySummary,
} from '../openpublica/src/scenarios/strategyPlayer';

/**
 * Balance bands for the scripted strategies (docs/STRATEGY_AND_GAMEFLOW.md,
 * section 6). Six years of each: the careful towns have filled most of their
 * land by then. Later slices add their own bands here. (`npm run strategies`
 * in openpublica/ prints the full twenty-year tables.)
 */

const MONTHS = 72;
const cache = new Map<string, StrategySummary>();

function run(id: string): StrategySummary {
  let summary = cache.get(id);
  if (!summary) {
    const strategy = STRATEGIES.find((s) => s.id === id);
    if (!strategy) throw new Error(`no strategy ${id}`);
    summary = summarize(playStrategy(strategy, MONTHS));
    cache.set(id, summary);
  }
  return summary;
}

describe('strategy balance', () => {
  it('should let a careful player build a thriving town from the default start', () => {
    const balanced = run('balanced');
    expect(balanced.endPopulation).toBeGreaterThanOrEqual(500);
    expect(balanced.monthsInDebt).toBe(0);
    // The first year is tight, but never broke.
    expect(balanced.lowMoney).toBeGreaterThan(0);
    expect(balanced.endMoney).toBeGreaterThan(10_000);
  });

  it('should keep the other careful strategies viable, each with its own shape', () => {
    const balanced = run('balanced');
    for (const id of ['suburb', 'industry-late']) {
      const other = run(id);
      expect(other.monthsInDebt).toBeLessThanOrEqual(3);
      expect(other.endPopulation).toBeGreaterThan(0.6 * balanced.endPopulation);
      expect(other.endPopulation).toBeLessThan(1.6 * balanced.endPopulation);
    }
  });

  it('should reward care: the naive layout stalls, and services matter', () => {
    const balanced = run('balanced');
    expect(run('naive').endPopulation).toBeLessThan(0.6 * balanced.endPopulation);
    expect(run('no-services').endPopulation).toBeLessThan(0.8 * balanced.endPopulation);
  });

  it('should make taxes a smooth trade of people for money, with no cliff (G2)', () => {
    const nine = run('balanced');
    const tax = (rate: number): StrategySummary => {
      const id = `tax-${rate}`;
      let summary = cache.get(id);
      if (!summary) {
        summary = summarize(playStrategy(taxStrategy(rate), MONTHS));
        cache.set(id, summary);
      }
      return summary;
    };
    for (const rate of [11, 13]) {
      const high = tax(rate);
      expect(high.monthsInDebt).toBe(0);
      // Fewer people than at 9%, but at most 12% fewer a point: a slope, not a cliff.
      expect(high.endPopulation).toBeLessThan(nine.endPopulation);
      expect(high.endPopulation).toBeGreaterThan(nine.endPopulation * (1 - 0.12 * (rate - 9)));
      // And more money for it.
      expect(high.endMoney).toBeGreaterThan(nine.endMoney);
    }
  });

  it('should give mixed use a trade-off: ahead, but in a band, and walkable (G3)', () => {
    const balanced = run('balanced');
    const mixed = run('mixed');
    expect(mixed.endPopulation).toBeGreaterThan(balanced.endPopulation);
    expect(mixed.endPopulation).toBeLessThan(1.5 * balanced.endPopulation);
    expect(mixed.endWalkability).toBeGreaterThan(balanced.endWalkability + 20);
    expect(mixed.endHappiness).toBeGreaterThan(balanced.endHappiness);
  });

  it('should let a town start with mixed use (G3b)', () => {
    const first = summarize(playStrategy(STRATEGIES.find((s) => s.id === 'mixed-first')!, 12));
    expect(first.monthTo100).toBeLessThanOrEqual(12);
  });

  it('should reward heeding the smog warnings: the naive player who does grows like a careful one (G5)', () => {
    const balanced = run('balanced');
    const heeds = run('naive-heeds');
    expect(heeds.endPopulation).toBeGreaterThan(0.8 * balanced.endPopulation);
    expect(heeds.endPopulation).toBeGreaterThan(1.5 * run('naive').endPopulation);
  });

  it('should rate thriving towns above the naive one, and the naive one above bankrupt towns (G7)', () => {
    const naive = run('naive');
    for (const id of ['balanced', 'suburb', 'mixed', 'industry-late']) {
      expect(run(id).endRating).toBeGreaterThan(naive.endRating);
    }
    // The small towns run out of money slowly; twenty years of them (cheap to play).
    for (const id of ['tiny', 'houses-only']) {
      const broke = summarize(playStrategy(STRATEGIES.find((s) => s.id === id)!, 240));
      expect(broke.monthsInDebt).toBeGreaterThan(24);
      expect(broke.endRating).toBeLessThan(naive.endRating);
      // A town in debt never rates above 40.
      expect(broke.bestRatingInDebt).not.toBeNull();
      expect(broke.bestRatingInDebt!).toBeLessThanOrEqual(40);
    }
  });

  it('should bring careful towns through Village, Town, and City on time, and stop the naive one early (G8)', () => {
    const [village, town, city] = [0, 1, 2];
    for (const id of ['balanced', 'suburb', 'industry-late']) {
      const m = run(id).milestoneMonths;
      expect(m[village]).toBeLessThanOrEqual(12);
      expect(m[town]).toBeLessThanOrEqual(36);
      expect(m[city]).toBeLessThanOrEqual(72);
    }
    // The naive town and the houses-only town never make Town.
    expect(run('naive').milestoneMonths[town]).toBe(Infinity);
    expect(run('naive').milestoneMonths[village]).toBeLessThanOrEqual(12);
    expect(summarize(playStrategy(STRATEGIES.find((s) => s.id === 'houses-only')!, MONTHS)).milestoneMonths[town]).toBe(Infinity);
  });

  it('should roll the same dice for the tax sweep as for the balanced town', () => {
    const a = playStrategy(taxStrategy(9), 12);
    const b = playStrategy(STRATEGIES.find((s) => s.id === 'balanced')!, 12);
    expect(a.months.map((m) => m.population)).toEqual(b.months.map((m) => m.population));
  });
});
