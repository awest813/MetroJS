// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import { MAP_SIZE, MONTH_SECONDS } from '../data/constants';
import { createSeededRng } from '../math/seededNoise';
import { CitySim } from '../sim/CitySim';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { STARTING_MONEY } from '../sim/EconomySystem';
import { DEFAULT_TERRAIN_SEED, generateTerrain } from '../sim/TerrainGenerator';
import { lotTooHostile, tileHasAdjacentRoad } from '../sim/zoneGrowthHints';
import { smogReach } from '../sim/smogReach';
import { MILESTONES } from '../sim/milestones';
import { SERVICE_TIERS, tierToBuild, type TieredService } from '../sim/serviceTiers';
import { InspectTool } from '../tools/InspectTool';
import type { PlaceServiceTool } from '../tools/PlaceServiceTool';
import { RoadTool } from '../tools/RoadTool';
import { ToolController } from '../tools/ToolController';
import { ZoneBrushTool } from '../tools/ZoneBrushTool';
import { planRoadLine, roadLinePath } from '../tools/roadLine';
import { createServiceTools, serviceSpecForDef } from '../tools/serviceCatalog';
import { planZoneArea } from '../tools/zoneArea';

/**
 * A scripted player for comparing strategies (docs/STRATEGY_AND_GAMEFLOW.md).
 *
 * It starts a new city on the default map with the default treasury and plays
 * it with the real tools and prices: a grid of 8-tile blocks on the north-west
 * bank, each ringed by an arterial and zoned as one area (the zone tool lays
 * its streets), with one strip per block kept for civic buildings. It adds a
 * block when fewer than a dozen empty lots could grow and it can pay; plants,
 * water, fire, and police when the city needs them and the budget carries
 * their upkeep. Factories and plants go in a district on the south bank,
 * joined to town along the west edge, unless the strategy is `naive`.
 *
 * Growth rolls use a seeded die, so a strategy plays out the same every time.
 * The layout is laid out for the default map (seed 2026).
 */

export type BlockKind = 'R' | 'C' | 'I' | 'M';

export interface Strategy {
  readonly id: string;
  /** One line for the report. */
  readonly label: string;
  /** Zone of each town block, cycled. */
  readonly mix: readonly BlockKind[];
  /** Every Nth block is a factory block in the south district (0 or absent: never). */
  readonly industryEvery?: number;
  /** Road type of each block's ring. */
  readonly arterial: RoadType;
  /** Residential, commercial, industrial tax (percent). */
  readonly taxes: readonly [number, number, number];
  /** Parks placed in each town block's strip. */
  readonly parksPerBlock?: number;
  readonly police?: boolean;
  readonly fire?: boolean;
  readonly water?: boolean;
  /** Stop after this many blocks. */
  readonly maxBlocks?: number;
  /** Plant beside the first street and factories among the houses, as a new player does. */
  readonly naive?: boolean;
  /** Build every service the advisories ask for, whatever the budget. */
  readonly followAdvice?: boolean;
  /** Name of the growth dice (default: the id), so variants can roll the same dice. */
  readonly dice?: string;
  /** Heed the smog warnings: plants go where their smog reaches the fewest homes, even the first. */
  readonly heedSmog?: boolean;
}

/** One simulated month of a strategy's city. */
export interface StrategyMonth {
  readonly month: number;
  readonly population: number;
  readonly jobs: number;
  readonly money: number;
  /** Projected income less expenses. */
  readonly net: number;
  readonly approval: number;
  readonly happiness: number;
  readonly blocks: number;
  /** The player placed, zoned, or borrowed something this month. */
  readonly acted: boolean;
  readonly advisory: string;
  /** Milestones reached by the month's end. */
  readonly milestones: number;
}

export interface StrategyRun {
  readonly strategy: Strategy;
  readonly months: readonly StrategyMonth[];
  /** What the player did, in order ("block R@12,42", "plant@13,43", "bond@m40"). */
  readonly actions: readonly string[];
  readonly sim: CitySim;
}

const ZONE: Record<BlockKind, ZoneType> = {
  R: ZoneType.Residential,
  C: ZoneType.Commercial,
  I: ZoneType.Industrial,
  M: ZoneType.MixedUse,
};

/** Monthly upkeep the player weighs before adding a civic building. */
const UPKEEP: Record<string, number> = {
  placePowerPlant: 80,
  placeWaterTower: 40,
  placeFireStation: 60,
  placePoliceStation: 60,
  placePark: 20,
  placeWaterPump: 15,
  placeFireHall: 20,
  placePolicePost: 25,
};

/** The tool for a service's tier the advice names now: the full one once the budget carries it (G4). */
function tierTool(service: TieredService, stats: CitySim['stats']): string {
  return serviceSpecForDef(tierToBuild(service, stats).defId)!.toolName;
}

/** Rough price of zoning one block: its lots plus the streets the zone tool lays. */
const BLOCK_ZONE_COST = 42 * 5 + 14 * 10;

/** Keep this much in hand. */
const RESERVE = 300;

/** Upgrade a village service only with this much to spare. */
const UPGRADE_SPARE = 3000;

/** Add a block when fewer empty lots than this could grow. */
const EXPAND_BELOW_LOTS = 12;

interface Block {
  readonly X: number;
  readonly Y: number;
}

/** Play `strategy` for `months` from a new city on `seed`. */
export function playStrategy(strategy: Strategy, months = 240, seed = DEFAULT_TERRAIN_SEED): StrategyRun {
  const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE, seed);
  generateTerrain(sim.map, seed);
  sim.stats.money = STARTING_MONEY;
  sim.growth.random = createSeededRng(`strategy-${strategy.dice ?? strategy.id}`);
  [sim.stats.resTaxRate, sim.stats.comTaxRate, sim.stats.indTaxRate] = strategy.taxes;

  const tools = new ToolController(new InspectTool());
  const services = new Map<string, PlaceServiceTool>(createServiceTools().map((t) => [t.name, t]));
  const arterial = new RoadTool(strategy.arterial);
  const street = new RoadTool(RoadType.Street);
  const actions: string[] = [];
  let acted = false;

  const dryBlock = (X: number, Y: number): boolean => {
    for (let y = Y; y <= Y + 8; y++) {
      for (let x = X; x <= X + 8; x++) {
        const tile = sim.getTile(x, y);
        if (!tile || tile.terrain === TerrainType.Water) return false;
      }
    }
    return true;
  };
  const grid = (xs: number[], ys: number[], cx: number, cy: number): Block[] =>
    xs.flatMap((X) => ys.map((Y) => ({ X, Y })))
      .filter((b) => dryBlock(b.X, b.Y))
      .sort((a, b) => Math.hypot(a.X - cx, a.Y - cy) - Math.hypot(b.X - cx, b.Y - cy));
  const townBlocks = grid([4, 12, 20, 28], [34, 42, 50], 12, 42);
  const factoryBlocks = grid([4, 12, 20, 28, 36, 44, 52], [2], 4, 2);
  const town: Block[] = [];
  const factories: Block[] = [];
  let linked = false;
  let expansions = 0;
  let hasPlant = false;

  const apply = (tiles: readonly TileCoord[], tool: RoadTool | ZoneBrushTool | PlaceServiceTool): number => {
    tools.applyTiles(tiles, sim, tool);
    return tools.resetDrag().applied;
  };
  const did = (what: string): void => {
    actions.push(what);
    acted = true;
  };

  const ringPaths = (b: Block): TileCoord[][] => {
    const corners: Array<[number, number]> = [[b.X, b.Y], [b.X + 8, b.Y], [b.X + 8, b.Y + 8], [b.X, b.Y + 8], [b.X, b.Y]];
    return corners.slice(1).map(([x, y], i) => roadLinePath({ x: corners[i][0], y: corners[i][1] }, { x, y }));
  };
  /** The first free strip slot of `blocks`, or the free one nearest `near`. */
  const freeSlot = (blocks: readonly Block[], near?: TileCoord | null): TileCoord | null => {
    let best: TileCoord | null = null;
    let bestD = Infinity;
    for (const b of blocks) {
      for (let x = b.X + 1; x <= b.X + 7; x++) {
        const tile = sim.getTile(x, b.Y + 1)!;
        if (!tile.buildingId && tile.roadType === RoadType.None && tileHasAdjacentRoad(sim.map, x, b.Y + 1)) {
          if (!near) return { x, y: b.Y + 1 };
          const d = Math.abs(x - near.x) + Math.abs(b.Y + 1 - near.y);
          if (d < bestD) {
            best = { x, y: b.Y + 1 };
            bestD = d;
          }
        }
      }
    }
    return best;
  };
  /** Where the advice of this id points, if it is listed and has a place. */
  const advisedAt = (...ids: string[]): TileCoord | null =>
    sim.evaluation.advisories.find((a) => ids.includes(a.id) && a.at)?.at ?? null;
  /** Place a civic building in the first free strip slot of `blocks`, or the one nearest `near`. */
  const place = (toolName: string, blocks: readonly Block[], what: string, near?: TileCoord | null): boolean => {
    const tool = services.get(toolName)!;
    const slot = freeSlot(blocks, near);
    if (!slot || sim.stats.money - RESERVE < tool.spec.cost) return false;
    if (apply([slot], tool) === 0) return false;
    did(`${what}@${slot.x},${slot.y}`);
    return true;
  };
  /** A careful player adds upkeep only while the budget, or five years of savings, carries it. */
  const affordable = (toolName: string): boolean => {
    if (strategy.followAdvice) return true;
    const after = sim.stats.projectedIncome - sim.stats.projectedExpenses - (UPKEEP[toolName] ?? 0);
    return after >= 0 || sim.stats.money >= -after * 60;
  };

  const buildBlock = (b: Block, kind: BlockKind, into: Block[]): boolean => {
    const paths = ringPaths(b);
    const roadCost = paths.reduce((sum, p) => sum + planRoadLine(arterial, p, sim).cost, 0);
    if (sim.stats.money - RESERVE < roadCost + BLOCK_ZONE_COST) return false;
    for (const p of paths) apply(p, arterial);
    const brush = new ZoneBrushTool(ZONE[kind]);
    const plan = planZoneArea(brush, { x: b.X + 1, y: b.Y + 2 }, { x: b.X + 7, y: b.Y + 7 }, sim, true);
    if (plan.streets.length > 0) apply(plan.streets, street);
    apply(plan.lots, brush);
    into.push(b);
    did(`block ${kind}@${b.X},${b.Y}`);
    return true;
  };

  /** A road down the west bank joins the factory district to town. False if it cannot be paid for with `spare` left. */
  const link = (spare: number): boolean => {
    // From the first town block's corner west to the bank, then south.
    const start = town[0] ?? { X: 4, Y: 42 };
    const path = [
      ...roadLinePath({ x: start.X, y: start.Y }, { x: 4, y: start.Y }),
      ...roadLinePath({ x: 4, y: start.Y }, { x: 4, y: 10 }).slice(1),
    ];
    if (sim.stats.money - RESERVE < planRoadLine(arterial, path, sim).cost + spare) return false;
    apply(path, arterial);
    linked = true;
    did('link');
    return true;
  };
  /** Lots beside the link road's far end, well away from town. */
  const linkSlots: Block[] = [{ X: 4, Y: 10 }];

  /**
   * Place a power plant. A player who heeds the smog warning puts it where its
   * smog reaches the fewest homes, laying the link road out of town for the
   * first one if every lot in town is too close.
   */
  const placePlant = (): boolean => {
    const tool = services.get('placePowerPlant')!;
    if (!strategy.heedSmog) {
      const where = hasPlant ? (strategy.naive || factories.length === 0 ? [...town].reverse() : factories) : town;
      return place('placePowerPlant', where, 'plant');
    }
    const def = sim.growth.defs.get(tool.spec.defId)!;
    const candidates: TileCoord[] = [];
    const consider = (blocks: readonly Block[]): void => {
      for (const b of blocks) {
        for (let x = b.X + 1; x <= b.X + 7; x++) {
          const tile = sim.getTile(x, b.Y + 1);
          if (tile && !tile.buildingId && tile.roadType === RoadType.None && tileHasAdjacentRoad(sim.map, x, b.Y + 1)) {
            candidates.push({ x, y: b.Y + 1 });
          }
        }
      }
    };
    consider(factories);
    consider(town);
    if (linked) consider(linkSlots);
    const homesIn = (c: TileCoord): number =>
      smogReach(sim.map, [c], def.pollutionOutput ?? 0, def.pollutionRadius ?? 0, new Set([`${c.x},${c.y}`])).homes;
    candidates.sort((a, b) => homesIn(a) - homesIn(b));
    let best = candidates[0];
    if ((!best || homesIn(best) > 0) && !linked && link(tool.spec.cost)) {
      candidates.length = 0;
      consider(linkSlots);
      best = candidates[0];
    }
    if (!best || sim.stats.money - RESERVE < tool.spec.cost) return false;
    if (apply([best], tool) === 0) return false;
    did(`plant@${best.x},${best.y}`);
    return true;
  };

  const expand = (): boolean => {
    if (town.length + factories.length >= (strategy.maxBlocks ?? Infinity)) return false;
    const every = strategy.industryEvery ?? 0;
    const factoryTurn = every > 0 && expansions % every === every - 1;
    if (factoryTurn && !strategy.naive) {
      const b = factoryBlocks[factories.length];
      if (!b) return false;
      if (!linked && !link(BLOCK_ZONE_COST)) return false;
      if (!buildBlock(b, 'I', factories)) return false;
      expansions += 1;
      return true;
    }
    const b = townBlocks[town.length];
    if (!b) return false;
    const townIndex = every > 0 ? expansions - Math.floor(expansions / every) : expansions;
    const kind: BlockKind = factoryTurn ? 'I' : strategy.mix[townIndex % strategy.mix.length];
    if (!buildBlock(b, kind, town)) return false;
    expansions += 1;
    for (let k = 0; k < (strategy.parksPerBlock ?? 0); k++) {
      if (affordable('placePark')) place('placePark', [...town].reverse(), 'park');
    }
    return true;
  };

  const growableLots = (): number => {
    let n = 0;
    sim.map.forEach((t) => {
      if (t.zoneType !== ZoneType.None && !t.buildingId && tileHasAdjacentRoad(sim.map, t.x, t.y) && !lotTooHostile(t)) n += 1;
    });
    return n;
  };

  const log: StrategyMonth[] = [];
  let hasTower = false;
  let lastFire = -Infinity;
  let lastPolice = -Infinity;
  for (let month = 1; month <= months; month++) {
    acted = false;
    const s = sim.stats;
    if (town.length === 0) expand();
    if (!hasPlant) hasPlant = placePlant();
    else if ((s.powerHeld ?? 0) > 0 || s.powerShort > 0 || s.powerLoad > 0.85 * s.powerSupply) placePlant();
    const water = tierTool('water', s);
    if ((strategy.water ?? true) && s.population >= 40 && (!hasTower || s.waterShort >= 5) && affordable(water)) {
      if (place(water, town, water === 'placeWaterPump' ? 'pump' : 'tower', advisedAt('water-full', 'water'))) hasTower = true;
    }
    const fire = tierTool('fire', s);
    const fireAdvised = sim.evaluation.advisories.some((a) => a.id === 'fire');
    if ((strategy.fire ?? true) && fireAdvised && month - lastFire >= 12 && affordable(fire)) {
      if (place(fire, town, fire === 'placeFireHall' ? 'hall' : 'fire', advisedAt('fire'))) lastFire = month;
    }
    const crimeBar = strategy.followAdvice ? 25 : 30;
    const police = tierTool('police', s);
    if ((strategy.police ?? true) && s.crimeAverage >= crimeBar && month - lastPolice >= 12 && affordable(police)) {
      if (place(police, town, police === 'placePolicePost' ? 'post' : 'police', advisedAt('crime', 'abandon:crime'))) lastPolice = month;
    }
    // Once the budget carries it, upgrade a village service in place (one a
    // month), from money to spare: the next block comes first.
    const upgrade = sim.evaluation.advisories.find((a) => a.id.startsWith('upgrade:') && a.at);
    if (upgrade?.at) {
      const full = serviceSpecForDef(SERVICE_TIERS[upgrade.id.slice('upgrade:'.length) as TieredService].full.defId)!;
      const tool = services.get(full.toolName)!;
      if (sim.stats.money - UPGRADE_SPARE >= tool.costAt(upgrade.at, sim) && apply([upgrade.at], tool) > 0) {
        did(`upgrade ${full.toolName}@${upgrade.at.x},${upgrade.at.y}`);
      }
    }
    if (growableLots() < EXPAND_BELOW_LOTS) expand();
    // Two years in debt: take the state's bailout.
    if (s.bailoutOffered && sim.acceptBailout()) did(`bailout@m${month}`);
    // In debt, borrow (the game allows three bonds at a time).
    if (!strategy.followAdvice && s.money < 0 && sim.issueBond()) did(`bond@m${month}`);

    sim.tick(MONTH_SECONDS);
    log.push({
      month,
      population: s.population,
      jobs: s.jobs,
      money: Math.round(s.money),
      net: Math.round(s.projectedIncome - s.projectedExpenses),
      approval: s.approval,
      happiness: s.happiness,
      blocks: town.length + factories.length,
      acted,
      advisory: s.advisory,
      milestones: s.milestones ?? 0,
    });
  }
  return { strategy, months: log, actions, sim };
}

const T9: readonly [number, number, number] = [9, 9, 9];
const taxes = (r: number, c = r, i = r): readonly [number, number, number] => [r, c, i];

/** The strategies the audit compares (section 3 of docs/STRATEGY_AND_GAMEFLOW.md). */
export const STRATEGIES: readonly Strategy[] = [
  { id: 'balanced', label: 'Houses and shops in town, factories across a link road, 9% taxes', mix: ['R', 'C', 'R'], industryEvery: 3, arterial: RoadType.Street, taxes: T9 },
  { id: 'advice', label: 'The same, building every service the advisories ask for', mix: ['R', 'C', 'R'], industryEvery: 3, arterial: RoadType.Street, taxes: T9, followAdvice: true },
  { id: 'suburb', label: 'Mostly houses, highway rings', mix: ['R', 'R', 'C'], industryEvery: 4, arterial: RoadType.Highway, taxes: T9 },
  { id: 'mixed', label: 'Houses first, then mixed use and shops', mix: ['R', 'M', 'M', 'C'], industryEvery: 4, arterial: RoadType.Street, taxes: T9 },
  { id: 'mixed-trolley', label: 'The same on trolley avenues, a park a block', mix: ['R', 'M', 'M', 'C'], industryEvery: 4, arterial: RoadType.TrolleyAvenue, taxes: T9, parksPerBlock: 1 },
  { id: 'mixed-first', label: 'Mixed use from the first block', mix: ['M', 'M', 'R', 'C'], industryEvery: 4, arterial: RoadType.Street, taxes: T9 },
  { id: 'industry-late', label: 'A factory block every third block, industry tax 5%', mix: ['R', 'R', 'C'], industryEvery: 3, arterial: RoadType.Street, taxes: taxes(9, 9, 5) },
  { id: 'industry-early', label: 'The factory district as the second block', mix: ['R', 'C'], industryEvery: 2, arterial: RoadType.Street, taxes: taxes(9, 9, 5) },
  { id: 'no-services', label: 'No police, fire, or water', mix: ['R', 'C', 'R'], industryEvery: 3, arterial: RoadType.Street, taxes: T9, police: false, fire: false, water: false },
  { id: 'naive', label: 'Plant beside the first street, factories next to the houses', mix: ['R', 'C', 'R', 'I'], arterial: RoadType.Street, taxes: T9, naive: true, followAdvice: true },
  { id: 'naive-heeds', label: 'The naive player heeding the smog warnings: plants and factories away from the houses', mix: ['R', 'C', 'R'], industryEvery: 4, arterial: RoadType.Street, taxes: T9, followAdvice: true, heedSmog: true },
  { id: 'tiny', label: 'Two blocks, then stop', mix: ['R', 'C'], arterial: RoadType.Street, taxes: T9, maxBlocks: 2 },
  { id: 'houses-only', label: 'No shops or factories', mix: ['R'], arterial: RoadType.Street, taxes: T9 },
];

/** The balanced town at each tax rate (section 3's tax table). */
export function taxStrategy(rate: number, housingOnly = false): Strategy {
  const base = STRATEGIES[0];
  return {
    ...base,
    id: housingOnly ? `tax-res-${rate}` : `tax-${rate}`,
    dice: base.id,
    label: housingOnly ? `Balanced, ${rate}% housing tax` : `Balanced, ${rate}% taxes`,
    taxes: housingOnly ? taxes(rate, 9, 9) : taxes(rate),
  };
}

/** What the report and tests read from a run. */
export interface StrategySummary {
  readonly id: string;
  readonly populationY5: number;
  readonly populationY10: number;
  readonly moneyY10: number;
  readonly netY10: number;
  readonly approvalY10: number;
  /** Population, treasury, happiness, and walkability in the run's last month. */
  readonly endPopulation: number;
  readonly endMoney: number;
  readonly endHappiness: number;
  readonly endWalkability: number;
  /** City rating in the run's last month. */
  readonly endRating: number;
  /** Highest rating in any month spent in debt (null if never in debt). */
  readonly bestRatingInDebt: number | null;
  /** First month with 100 residents (Infinity if never). */
  readonly monthTo100: number;
  /** Months in debt over the run. */
  readonly monthsInDebt: number;
  /** The longest run of months in debt in a row. */
  readonly longestDebt: number;
  /** State bailouts taken. */
  readonly bailouts: number;
  /** Month the treasury was lowest, and how low. */
  readonly lowMonth: number;
  readonly lowMoney: number;
  /** Months in each of years 1, 2, 3, 5, 10, and 20 in which the player acted. */
  readonly activeMonths: readonly number[];
  /** The month each milestone was reached (Village, Town, City, Capital), Infinity if not. */
  readonly milestoneMonths: readonly number[];
}

export function summarize(run: StrategyRun): StrategySummary {
  const at = (month: number): StrategyMonth => run.months[Math.min(run.months.length, month) - 1];
  const low = run.months.reduce((a, b) => (b.money < a.money ? b : a));
  const debt = run.months.filter((m) => m.money < 0);
  const active = (year: number): number =>
    run.months.slice((year - 1) * 12, year * 12).filter((m) => m.acted).length;
  return {
    id: run.strategy.id,
    populationY5: at(60).population,
    populationY10: at(120).population,
    moneyY10: at(120).money,
    netY10: at(120).net,
    approvalY10: at(120).approval,
    endPopulation: run.months[run.months.length - 1].population,
    endMoney: run.months[run.months.length - 1].money,
    endHappiness: run.months[run.months.length - 1].happiness,
    endWalkability: run.sim.stats.walkability,
    endRating: run.months[run.months.length - 1].approval,
    bestRatingInDebt: debt.length > 0 ? Math.max(...debt.map((m) => m.approval)) : null,
    monthTo100: run.months.find((m) => m.population >= 100)?.month ?? Infinity,
    monthsInDebt: debt.length,
    longestDebt: run.months.reduce(
      (acc, m) => {
        const now = m.money < 0 ? acc.now + 1 : 0;
        return { now, most: Math.max(acc.most, now) };
      },
      { now: 0, most: 0 },
    ).most,
    bailouts: run.sim.stats.bailouts ?? 0,
    lowMonth: low.month,
    lowMoney: low.money,
    activeMonths: [1, 2, 3, 5, 10, 20].map(active),
    milestoneMonths: MILESTONES.map((_, i) => run.months.find((m) => m.milestones > i)?.month ?? Infinity),
  };
}
