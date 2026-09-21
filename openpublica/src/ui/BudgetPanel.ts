import type { CityStats } from '../sim/CitySim';
import { formatBudgetNet, formatSignedMoney } from './chromeCopy';

type TaxChangeCallback = (
  resTaxRate: number,
  comTaxRate: number,
  indTaxRate: number,
) => void;

/**
 * Budget panel — monthly cashflow and tax sliders.
 * Collapsed behind a summary so it does not cover the map by default on small widths.
 */
export class BudgetPanel {
  private readonly _root:       HTMLElement;
  private readonly _incomeEl:   HTMLElement;
  private readonly _expenseEl:  HTMLElement;
  private readonly _serviceEl:  HTMLElement;
  private readonly _netEl:      HTMLElement;
  private readonly _resSlider:  HTMLInputElement;
  private readonly _comSlider:  HTMLInputElement;
  private readonly _indSlider:  HTMLInputElement;
  private readonly _resRateEl:  HTMLElement;
  private readonly _comRateEl:  HTMLElement;
  private readonly _indRateEl:  HTMLElement;
  private _onTaxChange: TaxChangeCallback | null = null;

  constructor(root: HTMLElement) {
    this._root = root;
    root.innerHTML = `
      <details class="budget-fold" open>
        <summary id="budget-header">Budget</summary>
        <div class="budget-body">
          <div class="budget-row">
            <span class="budget-key">Income</span>
            <span class="budget-val income" id="budget-income">$0/mo</span>
          </div>
          <div class="budget-row">
            <span class="budget-key">Last billed</span>
            <span class="budget-val expense" id="budget-expense">$0/mo</span>
          </div>
          <div class="budget-row budget-row-sub">
            <span class="budget-key">Civic now</span>
            <span class="budget-val expense" id="budget-services">$0/mo</span>
          </div>
          <div class="budget-row">
            <span class="budget-key">Next</span>
            <span class="budget-val income" id="budget-net">$0/mo</span>
          </div>
          <div class="budget-divider"></div>
          <div class="tax-row">
            <label class="tax-label" for="tax-res">Res tax</label>
            <input class="tax-slider" id="tax-res" type="range" min="0" max="20" value="9" step="1" />
            <span class="tax-rate" id="tax-res-rate">9%</span>
          </div>
          <div class="tax-row">
            <label class="tax-label" for="tax-com">Com tax</label>
            <input class="tax-slider" id="tax-com" type="range" min="0" max="20" value="9" step="1" />
            <span class="tax-rate" id="tax-com-rate">9%</span>
          </div>
          <div class="tax-row">
            <label class="tax-label" for="tax-ind">Ind tax</label>
            <input class="tax-slider" id="tax-ind" type="range" min="0" max="20" value="9" step="1" />
            <span class="tax-rate" id="tax-ind-rate">9%</span>
          </div>
        </div>
      </details>
    `;

    const fold = root.querySelector<HTMLDetailsElement>('.budget-fold')!;
    if (window.matchMedia('(max-width: 900px)').matches) fold.open = false;

    this._incomeEl  = root.querySelector('#budget-income')!;
    this._expenseEl = root.querySelector('#budget-expense')!;
    this._serviceEl = root.querySelector('#budget-services')!;
    this._netEl     = root.querySelector('#budget-net')!;
    this._resSlider = root.querySelector<HTMLInputElement>('#tax-res')!;
    this._comSlider = root.querySelector<HTMLInputElement>('#tax-com')!;
    this._indSlider = root.querySelector<HTMLInputElement>('#tax-ind')!;
    this._resRateEl = root.querySelector('#tax-res-rate')!;
    this._comRateEl = root.querySelector('#tax-com-rate')!;
    this._indRateEl = root.querySelector('#tax-ind-rate')!;

    const notify = (): void => {
      this._resRateEl.textContent = `${this._resSlider.value}%`;
      this._comRateEl.textContent = `${this._comSlider.value}%`;
      this._indRateEl.textContent = `${this._indSlider.value}%`;
      this._onTaxChange?.(
        Number(this._resSlider.value),
        Number(this._comSlider.value),
        Number(this._indSlider.value),
      );
    };

    this._resSlider.addEventListener('input', notify);
    this._comSlider.addEventListener('input', notify);
    this._indSlider.addEventListener('input', notify);
  }

  onTaxChange(cb: TaxChangeCallback): void {
    this._onTaxChange = cb;
  }

  update(stats: CityStats): void {
    this._incomeEl.textContent  = `${formatSignedMoney(stats.monthlyIncome)}/mo`;
    this._expenseEl.textContent = `${formatSignedMoney(stats.monthlyExpenses)}/mo`;
    this._serviceEl.textContent = `${formatSignedMoney(stats.serviceExpenses)}/mo`;
    const next = stats.projectedIncome - stats.projectedExpenses;
    this._netEl.textContent = formatBudgetNet(stats.projectedIncome, stats.projectedExpenses);
    this._netEl.classList.toggle('income', next >= 0);
    this._netEl.classList.toggle('expense', next < 0);
    this._root.classList.toggle('budget-bankrupt', stats.bankruptcyWarning);
  }

  syncTaxSliders(stats: CityStats): void {
    this._resSlider.value = String(Math.round(stats.resTaxRate));
    this._comSlider.value = String(Math.round(stats.comTaxRate));
    this._indSlider.value = String(Math.round(stats.indTaxRate));
    this._resRateEl.textContent = `${this._resSlider.value}%`;
    this._comRateEl.textContent = `${this._comSlider.value}%`;
    this._indRateEl.textContent = `${this._indSlider.value}%`;
  }
}
