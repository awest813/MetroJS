import type { CityStats } from '../sim/CitySim';
import type { BudgetTally } from '../sim/EconomySystem';
import { TAX_HINT, formatBudgetNet, formatRunway, formatSignedMoney } from './chromeCopy';

type TaxChangeCallback = (
  resTaxRate: number,
  comTaxRate: number,
  indTaxRate: number,
) => void;

const TAXES = [
  { id: 'res', label: 'Res', title: 'Housing tax on every resident. ' },
  { id: 'com', label: 'Com', title: 'Shop tax on every shop job (mixed-use too). ' },
  { id: 'ind', label: 'Ind', title: 'Factory tax on every factory job. ' },
] as const;

/**
 * Budget panel: this month's taxes and upkeep at today's city and weather,
 * the net, what the last month actually billed, how long the money lasts in
 * the red, and the tax sliders with each tax's take.
 * Collapsed behind a summary so it does not cover the map by default on small widths.
 */
export class BudgetPanel {
  private readonly _root:       HTMLElement;
  private readonly _incomeEl:   HTMLElement;
  private readonly _serviceEl:  HTMLElement;
  private readonly _roadsKeyEl: HTMLElement;
  private readonly _roadsEl:    HTMLElement;
  private readonly _netEl:      HTMLElement;
  private readonly _lastEl:     HTMLElement;
  private readonly _runwayEl:   HTMLElement;
  private readonly _sliders:    Record<'res' | 'com' | 'ind', HTMLInputElement>;
  private readonly _rates:      Record<'res' | 'com' | 'ind', HTMLElement>;
  private readonly _takes:      Record<'res' | 'com' | 'ind', HTMLElement>;
  private _onTaxChange: TaxChangeCallback | null = null;

  constructor(root: HTMLElement) {
    this._root = root;
    const taxRows = TAXES.map((t) => `
          <div class="tax-row" title="${t.title}${TAX_HINT}">
            <label class="tax-label" for="tax-${t.id}">${t.label}</label>
            <input class="tax-slider" id="tax-${t.id}" type="range" min="0" max="20" value="9" step="1" />
            <span class="tax-rate" id="tax-${t.id}-rate">9%</span>
            <span class="tax-take" id="tax-${t.id}-take">$0</span>
          </div>`).join('');
    root.innerHTML = `
      <details class="budget-fold" open>
        <summary id="budget-header">Budget</summary>
        <div class="budget-body">
          <div class="budget-row" title="Tax take this month at today's population, jobs, and rates">
            <span class="budget-key">Taxes</span>
            <span class="budget-val income" id="budget-income">$0/mo</span>
          </div>
          <div class="budget-row" title="Plants, towers, stations, and parks">
            <span class="budget-key">Civic upkeep</span>
            <span class="budget-val expense" id="budget-services">$0/mo</span>
          </div>
          <div class="budget-row">
            <span class="budget-key" id="budget-roads-key">Road upkeep</span>
            <span class="budget-val expense" id="budget-roads">$0/mo</span>
          </div>
          <div class="budget-row budget-row-total" title="Taxes less upkeep this month; the treasury moves by this at month end">
            <span class="budget-key">Net</span>
            <span class="budget-val income" id="budget-net">$0/mo</span>
          </div>
          <div class="budget-row budget-row-sub" title="What the last month-end actually billed">
            <span class="budget-key">Last month</span>
            <span class="budget-val" id="budget-last">none yet</span>
          </div>
          <p class="budget-runway" id="budget-runway" hidden></p>
          <div class="budget-divider"></div>
          <div class="tax-head" aria-hidden="true"><span>Tax</span><span>rate</span><span>take</span></div>${taxRows}
        </div>
      </details>
    `;

    const fold = root.querySelector<HTMLDetailsElement>('.budget-fold')!;
    if (window.matchMedia('(max-width: 900px)').matches) fold.open = false;

    this._incomeEl   = root.querySelector('#budget-income')!;
    this._serviceEl  = root.querySelector('#budget-services')!;
    this._roadsKeyEl = root.querySelector('#budget-roads-key')!;
    this._roadsEl    = root.querySelector('#budget-roads')!;
    this._netEl      = root.querySelector('#budget-net')!;
    this._lastEl     = root.querySelector('#budget-last')!;
    this._runwayEl   = root.querySelector('#budget-runway')!;
    const pick = <T extends HTMLElement>(suffix: string) => ({
      res: root.querySelector<T>(`#tax-res${suffix}`)!,
      com: root.querySelector<T>(`#tax-com${suffix}`)!,
      ind: root.querySelector<T>(`#tax-ind${suffix}`)!,
    });
    this._sliders = pick<HTMLInputElement>('');
    this._rates = pick<HTMLElement>('-rate');
    this._takes = pick<HTMLElement>('-take');

    const notify = (): void => {
      for (const id of ['res', 'com', 'ind'] as const) this._rates[id].textContent = `${this._sliders[id].value}%`;
      this._onTaxChange?.(
        Number(this._sliders.res.value),
        Number(this._sliders.com.value),
        Number(this._sliders.ind.value),
      );
    };
    for (const id of ['res', 'com', 'ind'] as const) this._sliders[id].addEventListener('input', notify);
  }

  onTaxChange(cb: TaxChangeCallback): void {
    this._onTaxChange = cb;
  }

  /** Refresh from the stats and, when given, the sim's budget projection (`sim.budget`). */
  update(stats: CityStats, budget?: BudgetTally): void {
    const income = budget?.income ?? stats.projectedIncome;
    const civic = budget?.serviceExpenses ?? stats.serviceExpenses;
    const roads = budget?.roadExpenses ?? Math.max(0, stats.projectedExpenses - stats.serviceExpenses);
    const snow = budget?.weatherRoadExpenses ?? 0;
    this._incomeEl.textContent  = `${formatSignedMoney(income)}/mo`;
    this._serviceEl.textContent = `${formatSignedMoney(civic)}/mo`;
    this._roadsEl.textContent   = `${formatSignedMoney(roads)}/mo`;
    this._roadsKeyEl.textContent = snow > 0 ? 'Road upkeep (snow)' : 'Road upkeep';
    this._roadsEl.parentElement!.title = snow > 0
      ? `Street, highway, trolley, and bridge upkeep; plowing adds ${formatSignedMoney(snow)} this month`
      : 'Street, highway, trolley, and bridge upkeep';

    const net = income - civic - roads;
    this._netEl.textContent = formatBudgetNet(income, civic + roads);
    this._netEl.classList.toggle('income', net >= 0);
    this._netEl.classList.toggle('expense', net < 0);

    const billed = stats.monthlyIncome !== 0 || stats.monthlyExpenses !== 0;
    const last = stats.monthlyIncome - stats.monthlyExpenses;
    this._lastEl.textContent = billed ? formatBudgetNet(stats.monthlyIncome, stats.monthlyExpenses) : 'none yet';
    this._lastEl.classList.toggle('income', billed && last >= 0);
    this._lastEl.classList.toggle('expense', billed && last < 0);

    const runway = formatRunway(stats.money, net);
    this._runwayEl.hidden = runway === null;
    this._runwayEl.textContent = runway ?? '';

    if (budget) {
      this._takes.res.textContent = formatSignedMoney(budget.resIncome);
      this._takes.com.textContent = formatSignedMoney(budget.comIncome);
      this._takes.ind.textContent = formatSignedMoney(budget.indIncome);
    }
    this._root.classList.toggle('budget-bankrupt', stats.bankruptcyWarning);
  }

  syncTaxSliders(stats: CityStats): void {
    const rates = { res: stats.resTaxRate, com: stats.comTaxRate, ind: stats.indTaxRate };
    for (const id of ['res', 'com', 'ind'] as const) {
      this._sliders[id].value = String(Math.round(rates[id]));
      this._rates[id].textContent = `${this._sliders[id].value}%`;
    }
  }
}
