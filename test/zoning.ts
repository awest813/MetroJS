import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../openpublica/src/sim/CityTile';
import { MONTH_SECONDS } from '../openpublica/src/data/constants';
import { isLandRoad, ROAD_STEPS } from '../openpublica/src/sim/roadConnections';
import {
  CRIME_STRESS_THRESHOLD,
  GROWTH_BUDGET_BASE,
  POLLUTION_STRESS_THRESHOLD,
  formatGrowthHint,
  lotTooHostile,
  monthlyGrowthBudget,
} from '../openpublica/src/sim/zoneGrowthHints';
import { ToolController } from '../openpublica/src/tools/ToolController';
import { RoadTool, ROAD_COST } from '../openpublica/src/tools/RoadTool';
import {
  ZONE_COST,
  createClearZoneBrush,
  createResidentialLowBrush,
} from '../openpublica/src/tools/ZoneBrushTool';
import {
  autoStreetLayout,
  formatAreaPlan,
  formatAreaResult,
  planZoneArea,
  zoneAreaTiles,
} from '../openpublica/src/tools/zoneArea';
import type { TileCoord } from '../openpublica/src/data/types';
import { GROVE_THRESHOLD, groveStrengths } from '../openpublica/src/sim/woods';

function makeSim(size = 24, money = 100_000): CitySim {
  const sim = CitySim.createCity(size, size);
  sim.stats.money = money;
  return sim;
}

function streetRow(sim: CitySim, y: number, x0 = 0, x1 = sim.map.width - 1): void {
  sim.batch(() => {
    for (let x = x0; x <= x1; x++) sim.placeRoad(x, y, RoadType.Street);
  });
}

function makeSimWithStreet(): CitySim {
  const sim = makeSim();
  streetRow(sim, 3);
  return sim;
}

/** Road tiles reachable from `start` over land roads. */
function reachable(sim: CitySim, start: TileCoord): Set<string> {
  const seen = new Set([`${start.x},${start.y}`]);
  const stack = [start];
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of ROAD_STEPS) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && isLandRoad(sim.getTile(x + dx, y + dy))) {
        seen.add(k);
        stack.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return seen;
}

describe('batched edits', () => {
  it('should refresh derived state once and match per-tile edits', () => {
    const one = makeSim();
    const many = makeSim();
    for (const sim of [one, many]) streetRow(sim, 5);
    let refreshes = 0;
    many.onLandValueChanged = () => { refreshes += 1; };
    const lots = zoneAreaTiles({ x: 2, y: 6 }, { x: 12, y: 9 });
    for (const t of lots) one.setZone(t.x, t.y, ZoneType.Residential);
    many.batch(() => {
      for (const t of lots) many.setZone(t.x, t.y, ZoneType.Residential);
    });
    expect(refreshes).toBe(1);
    expect(many.stats.advisory).toBe(one.stats.advisory);
    many.map.forEach((tile) => {
      const other = one.getTile(tile.x, tile.y)!;
      expect(tile.landValue).toBe(other.landValue);
      expect(tile.trafficPressure).toBe(other.trafficPressure);
    });
  });

  it('should report one change list per apply', () => {
    const sim = makeSim();
    streetRow(sim, 5);
    const ctrl = new ToolController(createResidentialLowBrush());
    const calls: number[] = [];
    ctrl.onTilesChanged((coords) => calls.push(coords.length));
    const n = ctrl.applyTiles(zoneAreaTiles({ x: 0, y: 6 }, { x: 9, y: 7 }), sim);
    expect(n).toBe(20);
    expect(calls).toEqual([20]);
    expect(ctrl.resetDrag().spent).toBe(20 * ZONE_COST);
  });

  it('should apply a named tool without switching the active one', () => {
    const sim = makeSim();
    const ctrl = new ToolController(createResidentialLowBrush());
    ctrl.applyTiles([{ x: 3, y: 3 }, { x: 4, y: 3 }], sim, new RoadTool());
    expect(sim.getTile(4, 3)!.roadType).toBe(RoadType.Street);
    expect(ctrl.activeTool.name).toBe('zoneResidentialLow');
  });
});

describe('zone areas', () => {
  it('should cover the rectangle row by row from either corner', () => {
    expect(zoneAreaTiles({ x: 3, y: 2 }, { x: 2, y: 1 })).toEqual([
      { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    ]);
  });

  it('should leave roads and water alone and skip lots with buildings', () => {
    const sim = makeSim();
    streetRow(sim, 5);
    sim.getTile(3, 6)!.terrain = TerrainType.Water;
    expect(sim.placeServiceBuilding(5, 6, 'small_park', 0)).toBe(true);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 5 }, { x: 6, y: 6 }, sim, true);
    expect(plan.lots).toHaveLength(3);
    expect(plan.blocked.map((t) => t.reason)).toEqual(['building']);
    expect(plan.tiles.some((t) => t.y === 5)).toBe(false);
    expect(plan.cost).toBe(3 * ZONE_COST);
  });

  it('should keep lots already zoned and clear them with Dezone', () => {
    const sim = makeSim();
    streetRow(sim, 5);
    sim.setZone(2, 6, ZoneType.Residential);
    const zone = planZoneArea(createResidentialLowBrush(), { x: 2, y: 6 }, { x: 3, y: 6 }, sim, true);
    expect(zone.tiles.map((t) => t.verdict)).toEqual(['keep', 'zone']);
    const clear = planZoneArea(createClearZoneBrush(), { x: 2, y: 6 }, { x: 3, y: 6 }, sim, true);
    expect(clear.tiles.map((t) => t.verdict)).toEqual(['clear']);
    expect(clear.cost).toBe(0);
    expect(formatAreaPlan('Dezone', clear, true, true)).toMatch(/^Dezone: 1 lot cleared · release to clear/);
  });

  it('should stop at the money, as release would', () => {
    const sim = makeSim(24, ZONE_COST * 4);
    streetRow(sim, 5);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 0, y: 6 }, { x: 9, y: 6 }, sim, true);
    expect(plan.lots).toHaveLength(4);
    expect(plan.blocked).toHaveLength(6);
    expect(plan.blocked.every((t) => t.reason === 'funds')).toBe(true);
  });

  it('should mark lots with no street beside them', () => {
    const sim = makeSim();
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 2 }, { x: 13, y: 3 }, sim, true);
    expect(plan.streets).toHaveLength(0);
    expect(plan.noStreet).toBe(24);
    expect(plan.streetsHelp).toBe(false);
    expect(formatAreaPlan('R Zone', plan, true, false)).toMatch(
      /^R Zone: 24 lots · \$120 · 24 without a street won't grow yet( · clears woods on \d+ tiles?)? · release to zone · Esc cancels · Shift paints freehand$/,
    );
  });
});

describe('streets through big zones', () => {
  it('should give every lot of an open area a street, joined into one network', () => {
    const sim = makeSim();
    const a = { x: 2, y: 2 };
    const b = { x: 13, y: 11 };
    const streets = autoStreetLayout(sim.map, a, b);
    expect(streets.length).toBeGreaterThan(0);
    const plan = planZoneArea(createResidentialLowBrush(), a, b, sim, true);
    expect(plan.noStreet).toBe(0);
    expect(plan.cost).toBe(plan.streets.length * ROAD_COST[RoadType.Street] + plan.lots.length * ZONE_COST);
    const ctrl = new ToolController(createResidentialLowBrush());
    ctrl.applyTiles(plan.streets, sim, new RoadTool());
    expect(reachable(sim, plan.streets[0]).size).toBe(plan.streets.length);
  });

  it('should tie the new streets to the road the area was drawn beside', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 4 }, { x: 17, y: 10 }, sim, true);
    expect(plan.noStreet).toBe(0);
    new ToolController(createResidentialLowBrush()).applyTiles(plan.streets, sim, new RoadTool());
    const network = reachable(sim, { x: 0, y: 3 });
    for (const t of plan.streets) expect(network.has(`${t.x},${t.y}`)).toBe(true);
  });

  it('should add a back street to a block three lots deep', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 4 }, { x: 15, y: 6 }, sim, true);
    expect(plan.noStreet).toBe(0);
    expect(plan.streets.filter((t) => t.y === 6)).toHaveLength(14);
  });

  it('should not pave through a finished street grid or a thin strip', () => {
    const sim = makeSim();
    sim.batch(() => {
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) if (x % 4 === 0 || y % 4 === 0) sim.placeRoad(x, y, RoadType.Street);
      }
    });
    expect(autoStreetLayout(sim.map, { x: 1, y: 1 }, { x: 19, y: 15 })).toEqual([]);
    expect(autoStreetLayout(makeSim().map, { x: 2, y: 4 }, { x: 13, y: 5 })).toEqual([]);
  });

  it('should let S turn the streets off and say what that leaves', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 4 }, { x: 15, y: 6 }, sim, false);
    expect(plan.streets).toHaveLength(0);
    expect(plan.noStreet).toBe(28);
    expect(plan.streetsHelp).toBe(true);
    expect(formatAreaPlan('R Zone', plan, false, false)).toMatch(/28 without a street won't grow yet( · clears woods on \d+ tiles?)? · release to zone · S: lay streets/);
  });

  it('should drop street pieces a lake cuts off from the roads', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    for (let x = 0; x < 24; x++) for (const y of [9, 10]) sim.getTile(x, y)!.terrain = TerrainType.Water;
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 4 }, { x: 13, y: 16 }, sim, true);
    new ToolController(createResidentialLowBrush()).applyTiles(plan.streets, sim, new RoadTool());
    const network = reachable(sim, { x: 0, y: 3 });
    expect(plan.streets.length).toBeGreaterThan(0);
    for (const t of plan.streets) expect(network.has(`${t.x},${t.y}`)).toBe(true);
    expect(plan.noStreet).toBeGreaterThan(0);
  });

  it('should lay a short stub to a road a few tiles off instead of an island', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    // Drawn two tiles below the street: the grid alone would not touch it.
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 6 }, { x: 17, y: 13 }, sim, true);
    new ToolController(createResidentialLowBrush()).applyTiles(plan.streets, sim, new RoadTool());
    const network = reachable(sim, { x: 0, y: 3 });
    for (const t of plan.streets) expect(network.has(`${t.x},${t.y}`)).toBe(true);
    const stub = plan.streets.filter((t) => t.y < 6);
    expect(stub.length).toBeGreaterThan(0);
    expect(stub.length).toBeLessThanOrEqual(4);
    // Too far for a stub: the area keeps its own grid and lays nothing outside.
    const far = planZoneArea(createResidentialLowBrush(), { x: 2, y: 9 }, { x: 17, y: 16 }, makeSimWithStreet(), true);
    expect(far.streets.length).toBeGreaterThan(0);
    expect(far.streets.every((t) => t.y >= 9)).toBe(true);
  });

  it('should never bridge or pave through a building', () => {
    const sim = makeSim();
    for (let y = 2; y <= 11; y++) sim.getTile(8, y)!.terrain = TerrainType.Water;
    expect(sim.placeServiceBuilding(4, 5, 'small_park', 0)).toBe(true);
    for (const t of autoStreetLayout(sim.map, { x: 2, y: 2 }, { x: 13, y: 11 })) {
      const tile = sim.getTile(t.x, t.y)!;
      expect(tile.terrain).not.toBe(TerrainType.Water);
      expect(tile.buildingId).toBeNull();
    }
  });

  it('should not plan a side street onto a bridge span', () => {
    const sim = makeSim();
    // A north–south bridge on x = 8 across a channel.
    sim.batch(() => {
      for (let y = 0; y < 24; y++) sim.getTile(8, y)!.terrain = TerrainType.Water;
      for (let y = 0; y < 24; y++) sim.placeRoad(8, y, RoadType.Street);
    });
    const streets = autoStreetLayout(sim.map, { x: 2, y: 2 }, { x: 7, y: 13 });
    expect(streets.length).toBeGreaterThan(0);
    for (const t of streets) expect(t.x).toBeLessThan(7);
  });

  it('should say how many wooded tiles the area clears', () => {
    const sim = makeSim(32);
    const a = { x: 0, y: 0 };
    const b = { x: 31, y: 31 };
    const plan = planZoneArea(createResidentialLowBrush(), a, b, sim, false);
    const strengths = groveStrengths(sim.terrainSeed, 32, 32);
    const wooded = Array.from(strengths).filter((n) => n > GROVE_THRESHOLD).length;
    expect(wooded).toBeGreaterThan(0);
    expect(plan.woods).toBe(wooded);
    expect(formatAreaPlan('R Zone', plan, false, false)).toContain(`clears woods on ${wooded} tiles`);
  });

  it('should report what release built', () => {
    const sim = makeSim();
    streetRow(sim, 3);
    const plan = planZoneArea(createResidentialLowBrush(), { x: 2, y: 4 }, { x: 15, y: 6 }, sim, true);
    expect(formatAreaResult('R Zone', 290, plan, false)).toBe('R Zone: 26 lots and 16 street tiles for $290.');
  });
});

describe('growth pace', () => {
  it('should scale the monthly budget with demand and city size', () => {
    expect(monthlyGrowthBudget(0, 0, 0)).toBe(0);
    expect(monthlyGrowthBudget(40, 0, 0)).toBe(GROWTH_BUDGET_BASE + 10);
    expect(monthlyGrowthBudget(40, 800, 200)).toBe(2 * (GROWTH_BUDGET_BASE + 10));
  });

  function withRandom<T>(value: number, run: () => T): T {
    const original = Math.random;
    Math.random = () => value;
    try {
      return run();
    } finally {
      Math.random = original;
    }
  }

  it('should fill a huge zone at the budget, not all at once', () => {
    const sim = makeSim(48);
    sim.batch(() => {
      for (let x = 0; x < 48; x += 3) {
        for (let y = 0; y < 48; y++) sim.placeRoad(x, y, RoadType.Street);
      }
      sim.map.forEach((t) => sim.setZone(t.x, t.y, ZoneType.Residential));
    });
    const budget = monthlyGrowthBudget(sim.stats.residentialDemand, 0, 0);
    withRandom(0, () => sim.tick(MONTH_SECONDS));
    expect(sim.growth.buildings.size).toBe(budget);
  });

  it('should fill lots beside existing buildings first', () => {
    const sim = makeSim(32);
    streetRow(sim, 4);
    expect(sim.placeServiceBuilding(20, 5, 'small_park', 0)).toBe(true);
    sim.batch(() => {
      for (let x = 0; x < 32; x++) if (x !== 20) sim.setZone(x, 5, ZoneType.Residential);
    });
    withRandom(0.1, () => sim.tick(MONTH_SECONDS));
    expect(sim.getTile(19, 5)!.buildingId).not.toBeNull();
    expect(sim.getTile(21, 5)!.buildingId).not.toBeNull();
    expect(sim.growth.buildings.size - 1).toBeLessThanOrEqual(monthlyGrowthBudget(40, 0, 0));
  });

  it('should not build where smog or crime would drive the building out', () => {
    const sim = makeSim();
    streetRow(sim, 5);
    sim.batch(() => {
      for (let x = 2; x <= 4; x++) sim.setZone(x, 6, ZoneType.Residential);
    });
    const smoggy = sim.getTile(2, 6)!;
    const risky = sim.getTile(3, 6)!;
    // Hold the conditions through the month's own refreshes.
    type Ticker = { tick: (...args: unknown[]) => void };
    const pollution = (sim as unknown as { pollution: Ticker }).pollution;
    const crime = (sim as unknown as { crime: Ticker }).crime;
    const origPollution = pollution.tick.bind(pollution);
    const origCrime = crime.tick.bind(crime);
    pollution.tick = (...args) => { origPollution(...args); smoggy.pollution = POLLUTION_STRESS_THRESHOLD; };
    crime.tick = (...args) => { origCrime(...args); risky.crime = CRIME_STRESS_THRESHOLD; };
    risky.crime = CRIME_STRESS_THRESHOLD; // growth reads last month's crime
    withRandom(0, () => sim.tick(MONTH_SECONDS));
    expect(smoggy.buildingId).toBeNull();
    expect(risky.buildingId).toBeNull();
    expect(sim.getTile(4, 6)!.buildingId).not.toBeNull();
    expect(lotTooHostile(smoggy)).toBe('smog');
    expect(formatGrowthHint(smoggy, sim.map, sim.stats)).toMatch(/^too smoggy to settle/);
    expect(formatGrowthHint(risky, sim.map, sim.stats)).toMatch(/^too much crime to settle/);
  });

  it('should let factories settle in smog that keeps homes away', () => {
    const lot = makeSim().getTile(2, 6)!;
    lot.pollution = 90;
    lot.zoneType = ZoneType.Industrial;
    expect(lotTooHostile(lot)).toBeNull();
    lot.zoneType = ZoneType.Residential;
    expect(lotTooHostile(lot)).toBe('smog');
  });

  it('should tell a waiting lot how fast lots fill', () => {
    const sim = makeSim();
    streetRow(sim, 5);
    sim.setZone(3, 6, ZoneType.Residential);
    expect(formatGrowthHint(sim.getTile(3, 6)!, sim.map, sim.stats)).toMatch(/up to 14 new buildings a month/);
  });
});
