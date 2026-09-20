import { CityMenu } from '../ui/CityMenu';
import { SaveSystem } from '../save/SaveSystem';
import type { CitySim } from '../sim/CitySim';
import type { CityHUD } from '../ui/CityHUD';
import type { BudgetPanel } from '../ui/BudgetPanel';
import type { CityView } from './CityView';

/**
 * Save / load / new city. Load rebuilds the Babylon view; sim decode stays in SaveSystem.
 */
export function mountCityMenu(
  container: HTMLElement,
  opts: {
    sim: CitySim;
    view: CityView;
    hud: CityHUD;
    budget: BudgetPanel;
    statusEl: HTMLElement;
  },
): CityMenu {
  return new CityMenu(container, {
    hasSave: SaveSystem.hasSave(),
    onSave: () => {
      SaveSystem.save(opts.sim);
      opts.statusEl.textContent = 'City saved in this browser.';
    },
    onLoad: () => {
      const ok = SaveSystem.load(opts.sim);
      if (ok) {
        opts.view.rebuildAll(opts.sim);
        opts.hud.update(opts.sim.stats, opts.sim.clock);
        opts.budget.update(opts.sim.stats);
        opts.budget.syncTaxSliders(opts.sim.stats);
        opts.statusEl.textContent = 'City loaded.';
      } else {
        opts.statusEl.textContent = 'No save found.';
      }
    },
    onNewCity: () => {
      window.location.reload();
    },
  });
}
