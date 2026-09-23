import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { TerrainType } from '../sim/CityTile';
import type { ToolController, StrokeSummary } from '../tools/ToolController';
import { isRoadTool, type RoadTool } from '../tools/RoadTool';
import { formatLinePlan, planRoadLine, roadLinePath, type LineVerdict } from '../tools/roadLine';
import type { TileTint } from '../render/HighlightRenderer';
import type { CityView } from './CityView';

/** Preview colours by what release would do to each tile. */
const VERDICT_TINT: Record<LineVerdict, TileTint['rgb']> = {
  build: { r: 0.35, g: 0.85, b: 0.40 },
  bridge: { r: 0.30, g: 0.75, b: 0.98 },
  upgrade: { r: 0.98, g: 0.78, b: 0.25 },
  keep: { r: 0.75, g: 0.75, b: 0.75 },
  blocked: { r: 0.98, g: 0.25, b: 0.20 },
};

const VERDICT_ALPHA: Record<LineVerdict, number> = {
  build: 0.5,
  bridge: 0.55,
  upgrade: 0.5,
  keep: 0.22,
  blocked: 0.6,
};

/**
 * Road tools lay lines: press sets an anchor, dragging previews the path
 * (longer axis first, one turn) tinted by what release would do, and release
 * builds it tile by tile through the ToolController, so costs, bridges, and
 * the stroke summary match a freehand stroke. Esc cancels; holding Shift on
 * the press paints freehand as before.
 */
export class RoadLineInput {
  private _anchor: TileCoord | null = null;
  private _target: TileCoord | null = null;
  private _cancelled = false;
  private _targetBlocked = false;

  constructor(
    private readonly _sim: CitySim,
    private readonly _view: CityView,
    private readonly _tools: ToolController,
    private readonly _status: HTMLElement,
    /** Called after release built (or failed to build) the line. */
    private readonly _onBuilt: (tool: RoadTool, summary: StrokeSummary, path: readonly TileCoord[]) => void,
  ) {}

  /** A line is being dragged, or a cancelled press is still held. */
  get busy(): boolean {
    return this._anchor !== null || this._cancelled;
  }

  /** Release would skip the tile under the pointer. */
  get targetBlocked(): boolean {
    return this._targetBlocked;
  }

  /** Take this pick if it belongs to a road line. Returns false to let the caller paint. */
  handlePick(coord: TileCoord, via: 'down' | 'drag', shift: boolean): boolean {
    const tool = this._tools.activeTool;
    if (via === 'down') {
      this._cancelled = false;
      if (!isRoadTool(tool) || shift) return false;
      this._anchor = coord;
    }
    if (this._cancelled) return true;
    if (!this._anchor || !isRoadTool(tool)) return false;
    this._target = coord;
    this._preview(tool);
    return true;
  }

  /** Drop the pending line (Esc). The rest of this press is ignored. */
  cancel(): boolean {
    if (!this._anchor) return false;
    this._anchor = null;
    this._target = null;
    this._cancelled = true;
    this._targetBlocked = false;
    this._view.highlight.hidePlan();
    this._status.textContent = 'Road cancelled.';
    return true;
  }

  /** Pointer released: build the line. Returns false when no line was pending. */
  finish(): boolean {
    if (this._cancelled) {
      this._cancelled = false;
      return true;
    }
    const anchor = this._anchor;
    const target = this._target ?? anchor;
    this._anchor = null;
    this._target = null;
    this._targetBlocked = false;
    this._view.highlight.hidePlan();
    const tool = this._tools.activeTool;
    if (!anchor || !target || !isRoadTool(tool)) return false;

    const path = roadLinePath(anchor, target);
    this._tools.resetDrag();
    for (const tile of path) this._tools.applyToTile(tile, this._sim);
    const summary = this._tools.resetDrag();
    this._onBuilt(tool, summary, path);
    return true;
  }

  private _preview(tool: RoadTool): void {
    if (!this._anchor || !this._target) return;
    const target = this._target;
    const plan = planRoadLine(tool, roadLinePath(this._anchor, target), this._sim);
    this._targetBlocked = plan.tiles.some((t) => t.x === target.x && t.y === target.y && t.verdict === 'blocked');
    const map = this._sim.map;
    this._view.highlight.showPlan(
      plan.tiles.map((t) => ({ x: t.x, y: t.y, rgb: VERDICT_TINT[t.verdict], alpha: VERDICT_ALPHA[t.verdict] })),
      this._view.heights,
      (x, y) => (map.getTile(x, y)?.terrain === TerrainType.Water ? this._view.surfaceY(x, y) : null),
    );
    this._status.textContent = formatLinePlan(tool.label, plan);
  }
}
