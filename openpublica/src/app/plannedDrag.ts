import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { TerrainType, ZoneType } from '../sim/CityTile';
import type { Tool } from '../tools/Tool';
import type { ToolController, StrokeSummary } from '../tools/ToolController';
import { RoadTool, isRoadTool } from '../tools/RoadTool';
import { formatLinePlan, planRoadLine, roadLinePath, type LineVerdict } from '../tools/roadLine';
import { isZoneBrush, type ZoneBrushTool } from '../tools/ZoneBrushTool';
import { formatAreaPlan, planZoneArea, type AreaPlan, type AreaVerdict } from '../tools/zoneArea';
import { zoneColor } from '../data/cityTileColors';
import type { TileTint } from '../render/HighlightRenderer';
import type { CityView } from './CityView';

/** What a drag would do, drawn while the pointer is held. */
export interface DragPreview {
  readonly tints: readonly TileTint[];
  readonly status: string;
  /** Release would skip the tile under the pointer. */
  readonly targetBlocked: boolean;
}

/** One kind of planned drag: road lines, zone areas. */
export interface DragMode {
  /** This mode handles presses with the given tool. */
  accepts(tool: Tool): boolean;
  preview(tool: Tool, anchor: TileCoord, target: TileCoord): DragPreview;
  build(tool: Tool, anchor: TileCoord, target: TileCoord): void;
  /** A key pressed mid-drag; true when it changed the plan. */
  key?(key: string): boolean;
}

/**
 * Press to anchor, drag to preview, release to build. The active tool's mode
 * plans the drag (tinting each tile by what release would do) and builds it
 * through the ToolController, so costs and summaries match painting. Esc
 * cancels; holding Shift on the press paints freehand instead.
 */
export class PlannedDragInput {
  private _anchor: TileCoord | null = null;
  private _target: TileCoord | null = null;
  private _mode: DragMode | null = null;
  private _cancelled = false;
  private _targetBlocked = false;

  constructor(
    private readonly _sim: CitySim,
    private readonly _tools: ToolController,
    private readonly _view: CityView,
    private readonly _status: HTMLElement,
    private readonly _modes: readonly DragMode[],
  ) {}

  /** A drag is being planned, or a cancelled press is still held. */
  get busy(): boolean {
    return this._anchor !== null || this._cancelled;
  }

  /** Release would skip the tile under the pointer. */
  get targetBlocked(): boolean {
    return this._targetBlocked;
  }

  /** Take this pick if it belongs to a planned drag. Returns false to let the caller paint. */
  handlePick(coord: TileCoord, via: 'down' | 'drag', shift: boolean): boolean {
    const tool = this._tools.activeTool;
    if (via === 'down') {
      this._cancelled = false;
      const mode = shift ? undefined : this._modes.find((m) => m.accepts(tool));
      if (!mode) return false;
      this._mode = mode;
      this._anchor = coord;
    }
    if (this._cancelled) return true;
    if (!this._anchor || !this._mode) return false;
    this._target = coord;
    this._preview();
    return true;
  }

  /** Esc cancels; other keys go to the mode. True when the key was used. */
  handleKey(key: string): boolean {
    if (!this._anchor || !this._mode) return false;
    if (key === 'Escape') return this.cancel();
    if (!this._mode.key?.(key)) return false;
    this._preview();
    return true;
  }

  /** Drop the pending drag (Esc). The rest of this press is ignored. */
  cancel(): boolean {
    if (!this._anchor) return false;
    this._reset();
    this._cancelled = true;
    this._status.textContent = 'Cancelled.';
    return true;
  }

  /** Pointer released: build the plan. Returns false when no drag was pending. */
  finish(): boolean {
    if (this._cancelled) {
      this._cancelled = false;
      return true;
    }
    const anchor = this._anchor;
    const target = this._target ?? anchor;
    const mode = this._mode;
    this._reset();
    const tool = this._tools.activeTool;
    if (!anchor || !target || !mode || !mode.accepts(tool)) return false;
    mode.build(tool, anchor, target);
    return true;
  }

  private _reset(): void {
    this._anchor = null;
    this._target = null;
    this._mode = null;
    this._targetBlocked = false;
    this._view.highlight.hidePlan();
  }

  private _preview(): void {
    const tool = this._tools.activeTool;
    if (!this._anchor || !this._target || !this._mode || !this._mode.accepts(tool)) return;
    const plan = this._mode.preview(tool, this._anchor, this._target);
    this._targetBlocked = plan.targetBlocked;
    const map = this._sim.map;
    this._view.highlight.showPlan(
      plan.tints,
      this._view.heights,
      (x, y) => (map.getTile(x, y)?.terrain === TerrainType.Water ? this._view.surfaceY(x, y) : null),
    );
    this._status.textContent = plan.status;
  }
}

/** Preview colours by what release would do to each tile of a road line. */
const LINE_TINT: Record<LineVerdict, TileTint['rgb']> = {
  build: { r: 0.35, g: 0.85, b: 0.40 },
  bridge: { r: 0.30, g: 0.75, b: 0.98 },
  upgrade: { r: 0.98, g: 0.78, b: 0.25 },
  keep: { r: 0.75, g: 0.75, b: 0.75 },
  blocked: { r: 0.98, g: 0.25, b: 0.20 },
};

const LINE_ALPHA: Record<LineVerdict, number> = {
  build: 0.5,
  bridge: 0.55,
  upgrade: 0.5,
  keep: 0.22,
  blocked: 0.6,
};

/**
 * Road tools lay lines: the longer axis first, one turn, so a drag never
 * lays the staircase a freehand stroke leaves on diagonals.
 */
export class RoadLineMode implements DragMode {
  constructor(
    private readonly _sim: CitySim,
    private readonly _tools: ToolController,
    /** Called after release built (or failed to build) the line. */
    private readonly _onBuilt: (tool: RoadTool, summary: StrokeSummary, path: readonly TileCoord[]) => void,
  ) {}

  accepts(tool: Tool): boolean {
    return isRoadTool(tool);
  }

  preview(tool: Tool, anchor: TileCoord, target: TileCoord): DragPreview {
    const road = tool as RoadTool;
    const plan = planRoadLine(road, roadLinePath(anchor, target), this._sim);
    return {
      tints: plan.tiles.map((t) => ({ x: t.x, y: t.y, rgb: LINE_TINT[t.verdict], alpha: LINE_ALPHA[t.verdict] })),
      status: formatLinePlan(road.label, plan),
      targetBlocked: plan.tiles.some((t) => t.x === target.x && t.y === target.y && t.verdict === 'blocked'),
    };
  }

  build(tool: Tool, anchor: TileCoord, target: TileCoord): void {
    const path = roadLinePath(anchor, target);
    this._tools.resetDrag();
    this._tools.applyTiles(path, this._sim);
    this._onBuilt(tool as RoadTool, this._tools.resetDrag(), path);
  }
}

const NO_STREET_TINT = { r: 0.98, g: 0.62, b: 0.12 };
const STREET_TINT = { r: 0.30, g: 0.30, b: 0.34 };
const CLEAR_TINT = { r: 0.94, g: 0.94, b: 0.94 };
const BLOCKED_TINT = LINE_TINT.blocked;
const KEEP_TINT = LINE_TINT.keep;

const AREA_ALPHA: Record<AreaVerdict, number> = {
  zone: 0.5,
  noStreet: 0.55,
  street: 0.7,
  clear: 0.45,
  keep: 0.18,
  blocked: 0.45,
};

/**
 * Zone brushes drag a rectangle. Where lots would have no street beside
 * them, the area lays streets through itself first (S toggles that); lots
 * still without a street are tinted amber so the player sees they will wait.
 */
export class ZoneAreaMode implements DragMode {
  private _streets = true;
  private readonly _streetTool = new RoadTool();

  constructor(
    private readonly _sim: CitySim,
    private readonly _tools: ToolController,
    /** Called after release zoned (or failed to zone) the area. */
    private readonly _onBuilt: (
      tool: ZoneBrushTool,
      summary: StrokeSummary,
      plan: AreaPlan,
      anchor: TileCoord,
      target: TileCoord,
    ) => void,
  ) {}

  accepts(tool: Tool): boolean {
    return isZoneBrush(tool);
  }

  key(key: string): boolean {
    if (key !== 's' && key !== 'S') return false;
    this._streets = !this._streets;
    return true;
  }

  preview(tool: Tool, anchor: TileCoord, target: TileCoord): DragPreview {
    const brush = tool as ZoneBrushTool;
    const plan = planZoneArea(brush, anchor, target, this._sim, this._streets);
    const zoneTint = zoneColor(brush.zoneType);
    const tint = (verdict: AreaVerdict): TileTint['rgb'] => {
      switch (verdict) {
        case 'zone': return zoneTint;
        case 'noStreet': return NO_STREET_TINT;
        case 'street': return STREET_TINT;
        case 'clear': return CLEAR_TINT;
        case 'keep': return KEEP_TINT;
        default: return BLOCKED_TINT;
      }
    };
    const dezone = brush.zoneType === ZoneType.None;
    return {
      tints: plan.tiles.map((t) => ({ x: t.x, y: t.y, rgb: tint(t.verdict), alpha: AREA_ALPHA[t.verdict] })),
      status: formatAreaPlan(brush.label, plan, this._streets, dezone),
      targetBlocked: plan.tiles.some((t) => t.x === target.x && t.y === target.y && t.verdict === 'blocked'),
    };
  }

  build(tool: Tool, anchor: TileCoord, target: TileCoord): void {
    const brush = tool as ZoneBrushTool;
    const plan = planZoneArea(brush, anchor, target, this._sim, this._streets);
    this._tools.resetDrag();
    if (plan.streets.length > 0) this._tools.applyTiles(plan.streets, this._sim, this._streetTool);
    this._tools.applyTiles(plan.lots, this._sim);
    this._onBuilt(brush, this._tools.resetDrag(), plan, anchor, target);
  }
}
