import type { CityStats } from '../sim/CitySim';

/** Callback invoked when any tax rate slider changes. */
type TaxChangeCallback = (
  resTaxRate: number,
  comTaxRate: number,
  indTaxRate: number,
) => void;

/**
 * Budget panel — shows monthly income / expenses and lets the player adjust
 * tax rates via sliders.
 *
 * Reads from CityStats; communicates tax changes through a callback so that
 * App.ts can forward them to the sim without coupling this panel to CitySim.
 */
export class BudgetPanel {
  private readonly _root: HTMLElement;

  private readonly _incomeEl:   HTMLElement;
  private readonly _expenseEl:  HTMLElement;
  private readonly _resSlider:  HTMLInputElement;
  private readonly _comSlider:  HTMLInputElement;
  private readonly _indSlider:  HTMLInputElement;
  private readonly _resRateEl:  HTMLElement;
  private readonly _comRateEl:  HTMLElement;
  private readonly _indRateEl:  HTMLElement;

  private _onTaxChange: TaxChangeCallback | null = null;

  constructor(root: HTMLElement) {
    this._root = root;
    this._root.innerHTML = `
      <div id="budget-header">Budget</div>
      <div class="budget-row">
        <span class="budget-key">Income</span>
        <span class="budget-val income" id="budget-income">$0/mo</span>
      </div>
      <div class="budget-row">
        <span class="budget-key">Expenses</span>
        <span class="budget-val expense" id="budget-expense">$0/mo</span>
      </div>
      <div class="budget-divider"></div>
      <div class="tax-row">
        <span class="tax-label">Res tax</span>
        <input class="tax-slider" id="tax-res" type="range" min="0" max="20" value="9" step="1" />
        <span class="tax-rate" id="tax-res-rate">9%</span>
      </div>
      <div class="tax-row">
        <span class="tax-label">Com tax</span>
        <input class="tax-slider" id="tax-com" type="range" min="0" max="20" value="9" step="1" />
        <span class="tax-rate" id="tax-com-rate">9%</span>
      </div>
      <div class="tax-row">
        <span class="tax-label">Ind tax</span>
        <input class="tax-slider" id="tax-ind" type="range" min="0" max="20" value="9" step="1" />
        <span class="tax-rate" id="tax-ind-rate">9%</span>
      </div>
    `;

    this._incomeEl  = this._root.querySelector('#budget-income')!;
    this._expenseEl = this._root.querySelector('#budget-expense')!;
    this._resSlider = this._root.querySelector<HTMLInputElement>('#tax-res')!;
    this._comSlider = this._root.querySelector<HTMLInputElement>('#tax-com')!;
    this._indSlider = this._root.querySelector<HTMLInputElement>('#tax-ind')!;
    this._resRateEl = this._root.querySelector('#tax-res-rate')!;
    this._comRateEl = this._root.querySelector('#tax-com-rate')!;
    this._indRateEl = this._root.querySelector('#tax-ind-rate')!;

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

  /** Register a callback invoked whenever any tax slider changes. */
  onTaxChange(cb: TaxChangeCallback): void {
    this._onTaxChange = cb;
  }

  /** Refresh income/expense display from the latest sim state. */
  update(stats: CityStats): void {
    this._incomeEl.textContent  = `$${stats.monthlyIncome.toLocaleString()}/mo`;
    this._expenseEl.textContent = `$${stats.monthlyExpenses.toLocaleString()}/mo`;
  }
}
