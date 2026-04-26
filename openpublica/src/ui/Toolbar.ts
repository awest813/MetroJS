import type { Tool } from '../tools/Tool';
import type { ToolController } from '../tools/ToolController';

/**
 * Renders and manages the toolbar HTML element.
 * Owns no game state; communicates exclusively through ToolController.
 */
export class Toolbar {
  private readonly _container: HTMLElement;
  private readonly _controller: ToolController;

  constructor(container: HTMLElement, controller: ToolController) {
    this._container  = container;
    this._controller = controller;
  }

  /** Creates a button for each tool and wires up click handlers. */
  build(tools: Tool[]): void {
    this._container.innerHTML = '';

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.dataset.tool = tool.name;
      btn.textContent  = tool.label;
      btn.addEventListener('click', () => {
        this._controller.setActiveTool(tool.name);
        this._setActiveButton(tool.name);
      });
      this._container.appendChild(btn);
    }

    if (tools.length > 0) {
      this._setActiveButton(tools[0].name);
    }
  }

  private _setActiveButton(activeName: string): void {
    this._container.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === activeName);
    });
  }
}
