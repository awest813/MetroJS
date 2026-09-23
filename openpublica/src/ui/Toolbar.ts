import type { Tool } from '../tools/Tool';
import type { ToolController } from '../tools/ToolController';

const TOOL_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['inspect'],
  ['road', 'highway', 'trolleyAvenue', 'bulldoze'],
  ['zoneResidentialLow', 'zoneCommercialLow', 'zoneIndustrialLight', 'zoneMixedUse', 'zoneClear'],
  ['placePowerPlant'],
  ['placePark', 'placePoliceStation', 'placeFireStation', 'placeWaterTower'],
];

const TOOL_TITLES: Readonly<Record<string, string>> = {
  inspect: 'Inspect a tile (key I)',
  road: 'Street — $10 a tile, $50 as a bridge over water. Drag a line, release to build; Shift paints freehand. Houses grow on lots beside it (key R)',
  highway: 'Highway — $25 a tile, $125 as a bridge. Drag a line, release to build. Carries twice the traffic; police and fire drive it faster (key H)',
  trolleyAvenue: 'Trolley avenue — $30 a tile, $150 as a bridge. Drag a line, release to build. A line of 4+ tiles runs a trolley and gives transit access (key T)',
  bulldoze: 'Clear a tile — $1 (key B)',
  zoneResidentialLow: 'Housing lots — $5. Drag a rectangle; deep areas get streets ($10 a tile, S toggles); Shift paints freehand (key Z)',
  zoneCommercialLow: 'Shop lots — $5. Drag a rectangle (S toggles streets). Need residents before they fill (key C)',
  zoneIndustrialLight: 'Factory lots — $5. Drag a rectangle (S toggles streets) (key N). I stays inspect',
  zoneMixedUse: 'Housing and shops on one lot — $5. Drag a rectangle (S toggles streets) (key U). M stays mute',
  zoneClear: 'Remove zoning — drag a rectangle. Buildings must be bulldozed first',
  placePowerPlant: 'Power plant — $500, $80/mo. Place on grass. Disc shows power radius (key G)',
  placePark: 'Park — $200, $20/mo. Raises nearby land value (key K)',
  placePoliceStation: 'Police — $400, $60/mo. Needs power and a street; patrols reach lots along the roads (key O)',
  placeFireStation: 'Fire — $400, $60/mo. Needs power and a street; engines reach lots along the roads (key F)',
  placeWaterTower: 'Water tower — $350, $40/mo. Coverage only while powered (key W)',
};

const TOOL_KEYS: Readonly<Record<string, string>> = {
  i: 'inspect',
  r: 'road',
  h: 'highway',
  t: 'trolleyAvenue',
  b: 'bulldoze',
  z: 'zoneResidentialLow',
  c: 'zoneCommercialLow',
  n: 'zoneIndustrialLight',
  u: 'zoneMixedUse',
  g: 'placePowerPlant',
  k: 'placePark',
  o: 'placePoliceStation',
  f: 'placeFireStation',
  w: 'placeWaterTower',
};

/**
 * Left-rail tool buttons. Owns no game state.
 */
export class Toolbar {
  private readonly _container: HTMLElement;
  private readonly _controller: ToolController;

  constructor(
    container: HTMLElement,
    controller: ToolController,
    /** Called after a tool is activated, e.g. to re-tint the hover cursor. */
    private readonly _onSelect?: (name: string) => void,
  ) {
    this._container  = container;
    this._controller = controller;

    window.addEventListener('keydown', (event) => {
      if (_isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tool = TOOL_KEYS[event.key.toLowerCase()];
      if (!tool) return;
      event.preventDefault();
      this.select(tool);
    });
  }

  build(tools: Tool[]): void {
    this._container.innerHTML = '';
    this._container.setAttribute('role', 'toolbar');
    this._container.setAttribute('aria-label', 'Build tools');

    const byName = new Map(tools.map((t) => [t.name, t]));
    const placed = new Set<string>();

    for (const group of TOOL_GROUPS) {
      const members = group.map((name) => byName.get(name)).filter((t): t is Tool => t !== undefined);
      if (members.length === 0) continue;
      this._appendGroup(members);
      members.forEach((t) => placed.add(t.name));
    }

    const leftovers = tools.filter((t) => !placed.has(t.name));
    if (leftovers.length > 0) this._appendGroup(leftovers);
  }

  /** Activate a registered tool and light its button. */
  select(name: string): void {
    this._controller.setActiveTool(name);
    this._setActiveButton(this._controller.activeTool.name);
    this._onSelect?.(this._controller.activeTool.name);
  }

  private _appendGroup(tools: Tool[]): void {
    const wrap = document.createElement('div');
    wrap.className = 'rail-group';
    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.tool = tool.name;
      btn.textContent = tool.label;
      btn.title = TOOL_TITLES[tool.name] ?? tool.label;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => this.select(tool.name));
      wrap.appendChild(btn);
    }
    this._container.appendChild(wrap);
  }

  private _setActiveButton(activeName: string): void {
    this._container.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach((btn) => {
      const on = btn.dataset.tool === activeName;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
}

function _isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
