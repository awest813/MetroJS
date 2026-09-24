// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { TileCoord } from '../data/types';
import { MAP_SIZE, MONTH_SECONDS } from '../data/constants';
import { createSeededRng } from '../math/seededNoise';
import { CitySim } from '../sim/CitySim';
import { RoadType, ZoneType } from '../sim/CityTile';
import { generateTerrain } from '../sim/TerrainGenerator';
import { InspectTool } from '../tools/InspectTool';
import { RoadTool } from '../tools/RoadTool';
import { ToolController } from '../tools/ToolController';
import { ZoneBrushTool } from '../tools/ZoneBrushTool';
import { roadLinePath } from '../tools/roadLine';
import { createServiceTools } from '../tools/serviceCatalog';
import { planZoneArea } from '../tools/zoneArea';
import type { PlaceServiceTool } from '../tools/PlaceServiceTool';

/** Civic buildings a script can place, by short name. */
export type ServiceKind = 'plant' | 'tower' | 'park' | 'police' | 'fire';

const SERVICE_TOOL: Record<ServiceKind, string> = {
  plant: 'placePowerPlant',
  tower: 'placeWaterTower',
  park: 'placePark',
  police: 'placePoliceStation',
  fire: 'placeFireStation',
};

/**
 * Builds a city the way a player does: the same tools, prices, and rules (a
 * road over water is a bridge and must run straight, zoning costs $5 a lot,
 * a deep zone area lays its own streets). Growth rolls use a seeded die, so a
 * scripted city comes out the same every time.
 *
 * Anything a tool refuses is logged in {@link refused}; a sound script leaves
 * it empty, so a test can tell when a rule change breaks a test city.
 */
export class CityBuilder {
  readonly sim: CitySim;
  /** What the tools would not build, e.g. `road 12,40`. */
  readonly refused: string[] = [];
  private readonly _tools: ToolController;
  private readonly _roads = new Map<RoadType, RoadTool>();
  private readonly _brushes = new Map<ZoneType, ZoneBrushTool>();
  private readonly _services = new Map<string, PlaceServiceTool>();

  private constructor(sim: CitySim, private readonly _watch?: (sim: CitySim) => void) {
    this.sim = sim;
    this._tools = new ToolController(new InspectTool());
    for (const type of [RoadType.Street, RoadType.Highway, RoadType.TrolleyAvenue]) {
      this._roads.set(type, new RoadTool(type));
    }
    for (const service of createServiceTools()) this._services.set(service.name, service);
  }

  /**
   * A fresh map from `seed`, with `money` in the treasury and seeded growth.
   * `watch` sees the city after every simulated month.
   */
  static start(seed: number, money: number, watch?: (sim: CitySim) => void): CityBuilder {
    const sim = CitySim.createCity(MAP_SIZE, MAP_SIZE, seed);
    generateTerrain(sim.map, seed);
    sim.stats.money = money;
    sim.growth.random = createSeededRng(`openpublica-test-city-${seed}`);
    return new CityBuilder(sim, watch);
  }

  /**
   * Drag a road from `from` through each later point, as a series of road-tool
   * lines (each runs its longer axis first, then turns once).
   */
  road(type: RoadType, ...points: ReadonlyArray<readonly [number, number]>): this {
    const tool = this._roads.get(type)!;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const path = roadLinePath({ x: ax, y: ay }, { x: bx, y: by });
      const line = i === 1 ? path : path.slice(1);
      this._apply(line, tool, tool.name);
    }
    return this;
  }

  /**
   * Drag a zone rectangle from corner `a` to corner `b`, as the zone tool
   * does: with `streets`, a deep area gets its own street grid first.
   */
  zone(zone: ZoneType, a: readonly [number, number], b: readonly [number, number], streets = true): this {
    const brush = this._brush(zone);
    const plan = planZoneArea(brush, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, this.sim, streets);
    for (const t of plan.blocked) this.refused.push(`${brush.name} ${t.x},${t.y} (${t.reason ?? 'blocked'})`);
    if (plan.streets.length > 0) this._apply(plan.streets, this._roads.get(RoadType.Street)!, 'area street');
    this._apply(plan.lots, brush, brush.name);
    return this;
  }

  /** Zone single rows or scattered lots without laying streets. */
  lots(zone: ZoneType, tiles: ReadonlyArray<readonly [number, number]>): this {
    const brush = this._brush(zone);
    this._apply(tiles.map(([x, y]) => ({ x, y })), brush, brush.name);
    return this;
  }

  /** Place a civic building, as a click with its tool. */
  place(kind: ServiceKind, x: number, y: number): this {
    const tool = this._services.get(SERVICE_TOOL[kind])!;
    this._apply([{ x, y }], tool, kind);
    return this;
  }

  /** Let the city run for `count` months. */
  months(count: number): this {
    for (let i = 0; i < count; i++) {
      this.sim.tick(MONTH_SECONDS);
      this._watch?.(this.sim);
    }
    return this;
  }

  /** Set the three tax rates (percent). */
  taxes(res: number, com: number, ind: number): this {
    this.sim.stats.resTaxRate = res;
    this.sim.stats.comTaxRate = com;
    this.sim.stats.indTaxRate = ind;
    return this;
  }

  /** Hand the city over: later growth rolls are the game's own dice again. */
  finish(): CitySim {
    this.sim.growth.random = Math.random;
    return this.sim;
  }

  private _brush(zone: ZoneType): ZoneBrushTool {
    let brush = this._brushes.get(zone);
    if (!brush) {
      brush = new ZoneBrushTool(zone);
      this._brushes.set(zone, brush);
    }
    return brush;
  }

  private _apply(
    tiles: readonly TileCoord[],
    tool: RoadTool | ZoneBrushTool | PlaceServiceTool,
    what: string,
  ): void {
    this._tools.applyTiles(tiles, this.sim, tool);
    const summary = this._tools.resetDrag();
    if (summary.applied === tiles.length) return;
    for (const t of tiles) {
      if (!this._landed(t, tool)) this.refused.push(`${what} ${t.x},${t.y}`);
    }
  }

  /** Whether `tool`'s work stands on the tile (it may have been there already). */
  private _landed(t: TileCoord, tool: RoadTool | ZoneBrushTool | PlaceServiceTool): boolean {
    const tile = this.sim.getTile(t.x, t.y);
    if (!tile) return false;
    // A road dragged across a highway or trolley line leaves a junction there.
    if (tool instanceof RoadTool) return tile.roadType !== RoadType.None;
    if (tool instanceof ZoneBrushTool) return tile.zoneType === tool.zoneType;
    return tile.buildingId === tool.spec.defId;
  }
}
