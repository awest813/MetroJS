import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';
import {
  BOND_AMOUNT,
  BOND_TERM_MONTHS,
  MAX_BONDS,
  bondDebt,
  bondPayments,
  clampFunding,
  fundedReach,
  newBond,
  payBonds,
  roadWearFactor,
} from '../openpublica/src/sim/budgetLevers';
import { bondTerms, formatBonds } from '../openpublica/src/ui/BudgetPanel';

/** A lit street of `length` tiles on y = 4 with a plant at its west end. */
function street(length = 30): CitySim {
  const sim = CitySim.createCity(length + 2, 10);
  sim.stats.money = 100_000;
  sim.pinWeather('clear');
  sim.batch(() => {
    for (let x = 0; x < length; x++) sim.placeRoad(x, 4, RoadType.Street);
    sim.placeServiceBuilding(0, 5, 'small_power_plant', 0);
  });
  return sim;
}

const covered = (sim: CitySim): number => {
  let n = 0;
  sim.map.forEach((t) => { if (t.policeCoverage > 0) n += 1; });
  return n;
};

describe('bonds', () => {
  it('should cost $12,000 over 24 months for $10,000 now', () => {
    const bond = newBond();
    expect(bond.owed).toBe(12_000);
    expect(bond.payment).toBe(500);
    const bonds = [bond];
    let paid = 0;
    for (let m = 0; m < BOND_TERM_MONTHS; m++) {
      expect(bondPayments(bonds)).toBe(500);
      paid += payBonds(bonds);
    }
    expect(paid).toBe(12_000);
    expect(bonds).toEqual([]);
    expect(bondPayments(bonds)).toBe(0);
  });

  it('should charge only what is left on the last payment', () => {
    const bonds = [{ owed: 700, payment: 500 }];
    expect(payBonds(bonds)).toBe(500);
    expect(bondPayments(bonds)).toBe(200);
    expect(payBonds(bonds)).toBe(200);
    expect(bonds).toHaveLength(0);
  });

  it('should put the cash in the treasury, bill the repayments, and stop at the limit', () => {
    const sim = street();
    const before = sim.stats.money;
    for (let i = 0; i < MAX_BONDS; i++) expect(sim.issueBond()).toBe(true);
    expect(sim.issueBond()).toBe(false);
    expect(sim.stats.money).toBe(before + MAX_BONDS * BOND_AMOUNT);
    expect(sim.budget.bondExpenses).toBe(MAX_BONDS * 500);
    expect(sim.budget.expenses).toBe(sim.budget.roadExpenses + sim.budget.serviceExpenses + MAX_BONDS * 500);
    expect(bondDebt(sim.levers.bonds)).toBe(MAX_BONDS * 12_000);
  });

  it('should leave the city $2,000 poorer than a twin once the bond is repaid', () => {
    const withBond = street();
    const without = street();
    withBond.issueBond();
    for (let m = 0; m < BOND_TERM_MONTHS + 2; m++) {
      withBond.tick(MONTH_SECONDS);
      without.tick(MONTH_SECONDS);
    }
    expect(withBond.levers.bonds).toEqual([]);
    expect(withBond.stats.money - without.stats.money).toBe(BOND_AMOUNT - 12_000);
  });

  it('should say what the bonds cost and owe', () => {
    expect(bondTerms()).toBe('A bond: $10,000 now, repaid as $12,000 over 24 months ($500/mo). Up to 3 at once.');
    expect(formatBonds({ bonds: [] })).toBe('No bonds');
    expect(formatBonds({ bonds: [{ owed: 11_500, payment: 500 }, { owed: 12_000, payment: 500 }] }))
      .toBe('2 bonds · $23,500 owed');
  });
});

describe('funding', () => {
  it('should keep funding on the slider steps and inside its range', () => {
    expect(clampFunding(73, 50, 120)).toBe(70);
    expect(clampFunding(200, 50, 120)).toBe(120);
    expect(clampFunding(10, 50, 100)).toBe(50);
    expect(clampFunding(Number.NaN, 50, 100)).toBe(100);
    expect(fundedReach(14, 50)).toBe(7);
    expect(fundedReach(14, 120)).toBe(17);
    expect(fundedReach(1, 50)).toBe(1);
    expect(roadWearFactor(100)).toBe(1);
    expect(roadWearFactor(50)).toBe(1.5);
  });

  it('should scale police reach and upkeep together', () => {
    const sim = street();
    sim.placeServiceBuilding(12, 5, 'small_police_station', 0);
    const full = { reach: covered(sim), upkeep: sim.budget.safetyExpenses };
    expect(full.upkeep).toBe(60);
    sim.setSafetyFunding(50);
    expect(sim.levers.safetyFunding).toBe(50);
    expect(sim.budget.safetyExpenses).toBe(30);
    expect(covered(sim)).toBeLessThan(full.reach);
    sim.setSafetyFunding(120);
    expect(sim.budget.safetyExpenses).toBe(72);
    expect(covered(sim)).toBeGreaterThan(full.reach);
    // Plants always run at full cost.
    expect(sim.budget.serviceExpenses - sim.budget.safetyExpenses).toBe(80);
  });

  it('should save on road upkeep at the price of heavier traffic', () => {
    const sim = street();
    sim.batch(() => {
      for (let x = 10; x <= 16; x++) {
        for (const y of [3, 5]) {
          sim.getTile(x, y)!.zoneType = ZoneType.Residential;
          sim.getTile(x, y)!.buildingId = 'rowhouse';
          sim.growth.buildings.set(`${x},${y}`, { defId: 'rowhouse', x, y });
        }
      }
      sim.placeRoad(31, 4, RoadType.Street);
    });
    const full = { upkeep: sim.budget.roadExpenses, traffic: sim.getTile(13, 4)!.trafficPressure };
    sim.setRoadFunding(50);
    expect(sim.budget.roadExpenses).toBe(Math.floor(full.upkeep / 2));
    expect(sim.getTile(13, 4)!.trafficPressure).toBeGreaterThan(full.traffic);
    sim.setRoadFunding(150);
    expect(sim.levers.roadFunding).toBe(100);
    expect(sim.getTile(13, 4)!.trafficPressure).toBe(full.traffic);
  });
});

describe('levers in saves', () => {
  it('should come back from a save, and default in an older one', () => {
    const sim = street();
    sim.setSafetyFunding(80);
    sim.setRoadFunding(70);
    sim.issueBond();
    sim.tick(MONTH_SECONDS);
    const save = JSON.parse(JSON.stringify(SaveCodec.encode(sim)));
    const restored = CitySim.createCity(sim.map.width, sim.map.height);
    restored.issueBond();
    SaveCodec.decode(save, restored);
    expect(restored.levers.safetyFunding).toBe(80);
    expect(restored.levers.roadFunding).toBe(70);
    expect(restored.levers.bonds).toEqual([{ owed: 11_500, payment: 500 }]);

    delete save.levers;
    SaveCodec.decode(save, restored);
    expect(restored.levers.safetyFunding).toBe(100);
    expect(restored.levers.roadFunding).toBe(100);
    expect(restored.levers.bonds).toEqual([]);
  });
});
