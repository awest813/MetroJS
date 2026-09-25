import { CitySim } from '../openpublica/src/sim/CitySim';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import {
  MILESTONES,
  milestoneReady,
  milestoneShortfall,
  milestonesByPopulation,
  nextMilestone,
  tierName,
  type Milestone,
} from '../openpublica/src/sim/milestones';
import { milestoneBanner, milestoneLabel, milestoneTooltip, ratingDrag } from '../openpublica/src/ui/chromeCopy';

const [VILLAGE, TOWN, CITY, CAPITAL] = MILESTONES;

/** A city whose stats meet `m` (set by hand: the check reads only stats). */
function cityAt(m: Milestone, overrides: Partial<CitySim['stats']> = {}): CitySim {
  const sim = CitySim.createCity(16, 16);
  Object.assign(sim.stats, {
    population: m.population,
    jobs: Math.ceil(m.population * m.jobsShare),
    approval: m.rating,
    money: 5_000,
    bankruptcyWarning: false,
    ...overrides,
  });
  return sim;
}

describe('milestones', () => {
  it('should climb Village, Town, City, Capital, each bigger and harder than the last', () => {
    expect(MILESTONES.map((m) => m.name)).toEqual(['Village', 'Town', 'City', 'Capital']);
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].population).toBeGreaterThan(MILESTONES[i - 1].population);
      expect(MILESTONES[i].rating).toBeGreaterThanOrEqual(MILESTONES[i - 1].rating);
      expect(MILESTONES[i].grant).toBeGreaterThan(MILESTONES[i - 1].grant);
    }
    expect(tierName(0)).toBe('Hamlet');
    expect(tierName(2)).toBe('Town');
    expect(nextMilestone(2)).toBe(CITY);
    expect(nextMilestone(4)).toBeNull();
  });

  it('should need people, a rating, no debt, and from Town on work for half the people', () => {
    const stats = { population: 400, jobs: 200, approval: 60, money: 100, bankruptcyWarning: false };
    expect(milestoneReady(stats, TOWN)).toBe(true);
    expect(milestoneShortfall({ ...stats, population: 350, jobs: 175 }, TOWN).people).toBe(50);
    expect(milestoneShortfall({ ...stats, approval: 57 }, TOWN).rating).toBe(3);
    expect(milestoneShortfall({ ...stats, jobs: 0 }, TOWN).jobs).toBe(200);
    expect(milestoneShortfall({ ...stats, money: -1 }, TOWN).debt).toBe(true);
    // A village of commuters with no jobs yet still counts.
    expect(milestoneReady({ ...stats, population: 150, jobs: 0, approval: 50 }, VILLAGE)).toBe(true);
  });

  it('should count a milestone once and pay its grant', () => {
    const sim = cityAt(VILLAGE);
    expect(sim.reachMilestone()).toBe(VILLAGE);
    expect(sim.stats.milestones).toBe(1);
    expect(sim.stats.money).toBe(5_000 + VILLAGE.grant);
    // Not again: the next one is Town, which this village does not meet.
    expect(sim.reachMilestone()).toBeNull();
    expect(sim.stats.money).toBe(5_000 + VILLAGE.grant);
  });

  it('should pass one milestone a month, so a big city climbs one tier at a time', () => {
    const sim = cityAt(CAPITAL);
    const reached: string[] = [];
    for (let month = 0; month < 6; month++) {
      const m = sim.reachMilestone();
      if (m) reached.push(m.name);
      Object.assign(sim.stats, { population: CAPITAL.population, jobs: CAPITAL.population, approval: CAPITAL.rating });
    }
    expect(reached).toEqual(['Village', 'Town', 'City', 'Capital']);
    expect(sim.stats.milestones).toBe(4);
  });

  it('should hold a milestone back while the city is in debt or short of work', () => {
    expect(cityAt(VILLAGE, { money: -10 }).reachMilestone()).toBeNull();
    const town = cityAt(TOWN, { jobs: 0 });
    town.stats.milestones = 1;
    expect(town.reachMilestone()).toBeNull();
  });

  it('should reach milestones at a month end and tell the app', () => {
    const sim = CitySim.createCity(16, 16);
    const seen: Milestone[] = [];
    sim.onMilestone = (m) => seen.push(m);
    // Nobody lives here: a month passes without a milestone.
    sim.tick(30);
    expect(seen).toEqual([]);
    expect(sim.stats.milestones).toBe(0);
  });

  it('should save the milestones reached, and give an old save the ones its size has passed, unpaid', () => {
    const sim = cityAt(TOWN);
    sim.stats.milestones = 2;
    const save = SaveCodec.encode(sim);
    expect(save.stats.milestones).toBe(2);
    const restored = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, restored);
    expect(restored.stats.milestones).toBe(2);

    delete (save.stats as { milestones?: number }).milestones;
    save.stats.population = 700;
    const old = CitySim.createCity(save.mapWidth, save.mapHeight);
    SaveCodec.decode(save, old);
    expect(old.stats.milestones).toBe(milestonesByPopulation(700));
    expect(old.stats.milestones).toBe(3);
  });

  describe('HUD copy', () => {
    const parts = { size: 16, happiness: 22, services: 24, budget: 25, smog: 9, taxes: 0, other: 0 };

    it('should show progress in people, then what else is missing', () => {
      const base = { jobs: 300, approval: 70, money: 100, bankruptcyWarning: false, ratingParts: parts };
      expect(milestoneLabel({ ...base, population: 312 }, 1)).toBe('Town 312/400');
      expect(milestoneLabel({ ...base, population: 412, approval: 58 }, 1)).toBe('Town 412/400 · rating 58/60');
      expect(milestoneLabel({ ...base, population: 412, jobs: 100 }, 1)).toBe('Town 412/400 · jobs 100/206');
      expect(milestoneLabel({ ...base, population: 412, money: -5 }, 1)).toBe('Town 412/400 · in debt');
      expect(milestoneLabel({ ...base, population: 1200 }, 4)).toBe('Capital');
    });

    it('should say in the tooltip what is still needed and why', () => {
      const tip = milestoneTooltip({ population: 312, jobs: 60, approval: 55, money: -5, bankruptcyWarning: true, ratingParts: parts }, 1);
      expect(tip).toMatch(/^Village → Town: 400 people, a rating of 60, jobs for 50% of them, and no debt\./);
      expect(tip).toMatch(/88 more people/);
      expect(tip).toMatch(/5 more rating points \(smog costs 9\)/);
      expect(tip).toMatch(/96 more jobs/);
      expect(tip).toMatch(/get out of debt/);
      expect(tip).toMatch(/\$5,000 state grant/);
      const ready = milestoneTooltip({ population: 400, jobs: 200, approval: 60, money: 5, bankruptcyWarning: false, ratingParts: parts }, 1);
      expect(ready).toMatch(/All met: Town at the month's end/);
    });

    it('should name what holds the rating down most', () => {
      expect(ratingDrag(parts)).toBe('smog costs 9');
      expect(ratingDrag({ ...parts, smog: 0, services: 10 })).toBe('services earn 10 of 25');
      expect(ratingDrag({ size: 25, happiness: 25, services: 25, budget: 25, smog: 0, taxes: 0, other: 0 })).toBeNull();
    });

    it('should announce a milestone with its grant and the next one', () => {
      const banner = milestoneBanner(TOWN, 2, 412);
      expect(banner.title).toBe('Town!');
      expect(banner.body).toMatch(/412 people call this place home\. The state sends a \$5,000 grant\. Next: City at 600 people\./);
      expect(milestoneBanner(CAPITAL, 4, 1000).body).toMatch(/top tier/);
    });
  });
});
