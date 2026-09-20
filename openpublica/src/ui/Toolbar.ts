import type { Tool } from '../tools/Tool';
import type { ToolController } from '../tools/ToolController';

const TOOL_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['inspect'],
  ['road', 'trolleyAvenue', 'bulldoze'],
  ['zoneResidentialLow', 'zoneCommercialLow', 'zoneIndustrialLight', 'zoneMixedUse'],
  ['placePowerPlant', 'placePark', 'placePoliceStation'],
];

/**
 * Left-rail tool buttons. Owns no game state.
 */
export class Toolbar {
  private readonly _container: HTMLElement;
  private readonly _controller: ToolController;

  constructor(container: HTMLElement, controller: ToolController) {
    this._container  = container;
    this._controller = controller;
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

    if (tools.length > 0) this._setActiveButton(tools[0].name);
  }

  private _appendGroup(tools: Tool[]): void {
    const wrap = document.createElement('div');
    wrap.className = 'rail-group';
    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.tool = tool.name;
      btn.textContent = tool.label;
      btn.title = tool.label;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        this._controller.setActiveTool(tool.name);
        this._setActiveButton(tool.name);
      });
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
