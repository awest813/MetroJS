import { CityMenu } from '../ui/CityMenu';
import { SaveSystem } from '../save/SaveSystem';
import { TEST_CITIES, testCityById, type TestCity } from '../scenarios/testCities';
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
    onLoaded?: () => void;
  },
): CityMenu {
  return new CityMenu(container, {
    hasSave: SaveSystem.hasSave(),
    onSave: () => {
      SaveSystem.save(opts.sim);
      opts.statusEl.textContent = 'City saved in this browser.';
    },
    onLoad: () => {
      const status = SaveSystem.load(opts.sim);
      if (status === 'loaded') {
        opts.view.rebuildAll(opts.sim);
        opts.hud.update(opts.sim.stats, opts.sim.clock, opts.sim);
        opts.budget.update(opts.sim.stats, opts.sim.budget, opts.sim.levers);
        opts.budget.syncSliders(opts.sim.stats, opts.sim.levers);
        opts.onLoaded?.();
        opts.statusEl.textContent = 'City loaded.';
      } else if (status === 'size-mismatch') {
        opts.statusEl.textContent = 'That save is a different map size.';
      } else if (status === 'invalid') {
        opts.statusEl.textContent = 'Could not read that save.';
      } else {
        opts.statusEl.textContent = 'No save found.';
      }
    },
    testCities: TEST_CITIES.map((city) => ({ id: city.id, title: city.title, summary: city.summary })),
    onNewCity: () => {
      // A fresh random map, not the test city the address may name.
      const url = new URL(window.location.href);
      url.searchParams.delete('city');
      if (url.href === window.location.href) window.location.reload();
      else window.location.assign(url.href);
    },
    onTestCity: (id) => {
      const url = new URL(window.location.href);
      url.searchParams.set('city', id);
      window.location.assign(url.href);
    },
  });
}

/** The scripted test city named by `?city=<id>` in the address, if any. */
export function requestedTestCity(): TestCity | undefined {
  const id = new URLSearchParams(window.location.search).get('city');
  return id ? testCityById(id) : undefined;
}
