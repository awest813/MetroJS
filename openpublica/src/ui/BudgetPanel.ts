import type { CityStats } from '../sim/CitySim';
import type { BudgetLevers, BudgetTally } from '../sim/EconomySystem';
import {
  BOND_AMOUNT,
  BOND_TERM_MONTHS,
  FUNDING_STEP,
  MAX_BONDS,
  ROAD_FUNDING_MAX,
  ROAD_FUNDING_MIN,
  SAFETY_FUNDING_MAX,
  SAFETY_FUNDING_MIN,
  bondDebt,
  newBond,
} from '../sim/budgetLevers';
import { TAX_HINT, formatBudgetNet, formatRunway, formatSignedMoney } from './chromeCopy';

type TaxChangeCallback = (
  resTaxRate: number,
  comTaxRate: number,
  indTaxRate: number,
) => void;

type FundingChangeCallback = (safetyFunding: number, roadFunding: number) => void;

const FUNDING = [
  {
    id: 'safety', label: 'Safety', min: SAFETY_FUNDING_MIN, max: SAFETY_FUNDING_MAX,
    title: 'Police and fire funding: their upkeep and how far their crews reach scale together.',
  },
  {
    id: 'roads', label: 'Roads', min: ROAD_FUNDING_MIN, max: ROAD_FUNDING_MAX,
    title: 'Road upkeep funding: cheaper below 100%, but worn roads carry less, so traffic reads heavier.',
  },
] as const;

/** Button tooltip spelling out a bond's terms. */
export function bondTerms(): string {
  const bond = newBond();
  return `A bond: $${BOND_AMOUNT.toLocaleString()} now, repaid as $${bond.owed.toLocaleString()} over ` +
    `${BOND_TERM_MONTHS} months ($${bond.payment.toLocaleString()}/mo). Up to ${MAX_BONDS} at once.`;
}

/** What the bond row says about the bonds being repaid. */
export function formatBonds(levers: Pick<BudgetLevers, 'bonds'>): string {
  const count = levers.bonds.length;
  if (count === 0) return 'No bonds';
  const owed = bondDebt(levers.bonds);
  return `${count} bond${count === 1 ? '' : 's'} · $${owed.toLocaleString()} owed`;
}

const TAXES = [
  { id: 'res', label: 'Res', title: 'Housing tax on every resident. ' },
  { id: 'com', label: 'Com', title: 'Shop tax on every shop job (mixed-use too). ' },
  { id: 'ind', label: 'Ind', title: 'Factory tax on every factory job. ' },
] as const;

/**
 * Budget panel: this month's taxes, upkeep, and bond repayments at today's
 * city and weather, the net, what the last month actually billed, how long
 * the money lasts in the red, the tax sliders with each tax's take, the
 * police-and-fire and road funding sliders with their cost, and bonds.
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
  private readonly _bondsRowEl: HTMLElement;
  private readonly _bondsEl:    HTMLElement;
  private readonly _funding:    Record<'safety' | 'roads', HTMLInputElement>;
  private readonly _fundRates:  Record<'safety' | 'roads', HTMLElement>;
  private readonly _fundCosts:  Record<'safety' | 'roads', HTMLElement>;
  private readonly _borrowBtn:  HTMLButtonElement;
  private readonly _bondStatus: HTMLElement;
  private _onTaxChange: TaxChangeCallback | null = null;
  private _onFundingChange: FundingChangeCallback | null = null;
  private _onBorrow: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this._root = root;
    const taxRows = TAXES.map((t) => `
          <div class="tax-row" title="${t.title}${TAX_HINT}">
            <label class="tax-label" for="tax-${t.id}">${t.label}</label>
            <input class="tax-slider" id="tax-${t.id}" type="range" min="0" max="20" value="9" step="1" />
            <span class="tax-rate" id="tax-${t.id}-rate">9%</span>
            <span class="tax-take" id="tax-${t.id}-take">$0</span>
          </div>`).join('');
    const fundRows = FUNDING.map((f) => `
          <div class="tax-row" title="${f.title}">
            <label class="tax-label fund-label" for="fund-${f.id}">${f.label}</label>
            <input class="tax-slider" id="fund-${f.id}" type="range" min="${f.min}" max="${f.max}" value="100" step="${FUNDING_STEP}" />
            <span class="tax-rate fund-rate" id="fund-${f.id}-rate">100%</span>
            <span class="tax-take fund-cost" id="fund-${f.id}-cost">$0</span>
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
          <div class="budget-row" id="budget-bonds-row" title="Bond repayments due this month" hidden>
            <span class="budget-key">Bond repayments</span>
            <span class="budget-val expense" id="budget-bonds">$0/mo</span>
          </div>
          <div class="budget-row budget-row-total" title="Taxes less upkeep and repayments this month; the treasury moves by this at month end">
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
          <div class="budget-divider"></div>
          <div class="tax-head" aria-hidden="true"><span>Funding</span><span>level</span><span>cost</span></div>${fundRows}
          <div class="bond-row">
            <button class="bond-btn" id="bond-borrow" type="button" title="${bondTerms()}">Borrow $${BOND_AMOUNT / 1000}k</button>
            <span class="bond-status" id="bond-status">No bonds</span>
          </div>
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
    const fund = <T extends HTMLElement>(suffix: string) => ({
      safety: root.querySelector<T>(`#fund-safety${suffix}`)!,
      roads: root.querySelector<T>(`#fund-roads${suffix}`)!,
    });
    this._funding = fund<HTMLInputElement>('');
    this._fundRates = fund<HTMLElement>('-rate');
    this._fundCosts = fund<HTMLElement>('-cost');
    this._bondsRowEl = root.querySelector('#budget-bonds-row')!;
    this._bondsEl = root.querySelector('#budget-bonds')!;
    this._borrowBtn = root.querySelector('#bond-borrow')!;
    this._bondStatus = root.querySelector('#bond-status')!;

    const notify = (): void => {
      for (const id of ['res', 'com', 'ind'] as const) this._rates[id].textContent = `${this._sliders[id].value}%`;
      this._onTaxChange?.(
        Number(this._sliders.res.value),
        Number(this._sliders.com.value),
        Number(this._sliders.ind.value),
      );
    };
    for (const id of ['res', 'com', 'ind'] as const) this._sliders[id].addEventListener('input', notify);

    const notifyFunding = (): void => {
      for (const id of ['safety', 'roads'] as const) this._fundRates[id].textContent = `${this._funding[id].value}%`;
      this._onFundingChange?.(Number(this._funding.safety.value), Number(this._funding.roads.value));
    };
    for (const id of ['safety', 'roads'] as const) this._funding[id].addEventListener('input', notifyFunding);
    this._borrowBtn.addEventListener('click', () => this._onBorrow?.());
  }

  onTaxChange(cb: TaxChangeCallback): void {
    this._onTaxChange = cb;
  }

  onFundingChange(cb: FundingChangeCallback): void {
    this._onFundingChange = cb;
  }

  onBorrow(cb: () => void): void {
    this._onBorrow = cb;
  }

  /**
   * Refresh from the stats and, when given, the sim's budget projection
   * (`sim.budget`) and levers (`sim.levers`).
   */
  update(stats: CityStats, budget?: BudgetTally, levers?: BudgetLevers): void {
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

    const bonds = budget?.bondExpenses ?? 0;
    this._bondsRowEl.hidden = bonds <= 0;
    this._bondsEl.textContent = `${formatSignedMoney(bonds)}/mo`;

    const net = income - civic - roads - bonds;
    this._netEl.textContent = formatBudgetNet(income, civic + roads + bonds);
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
      this._fundCosts.safety.textContent = formatSignedMoney(budget.safetyExpenses);
      this._fundCosts.roads.textContent = formatSignedMoney(budget.roadExpenses);
    }
    if (levers) {
      this._bondStatus.textContent = formatBonds(levers);
      const full = levers.bonds.length >= MAX_BONDS;
      this._borrowBtn.disabled = full;
      this._borrowBtn.title = full ? `At the limit of ${MAX_BONDS} bonds — repay one first.` : bondTerms();
    }
    this._root.classList.toggle('budget-bankrupt', stats.bankruptcyWarning);
  }

  /** Move the tax and funding sliders to a loaded city's settings. */
  syncSliders(stats: CityStats, levers?: BudgetLevers): void {
    const rates = { res: stats.resTaxRate, com: stats.comTaxRate, ind: stats.indTaxRate };
    for (const id of ['res', 'com', 'ind'] as const) {
      this._sliders[id].value = String(Math.round(rates[id]));
      this._rates[id].textContent = `${this._sliders[id].value}%`;
    }
    if (!levers) return;
    const funding = { safety: levers.safetyFunding, roads: levers.roadFunding };
    for (const id of ['safety', 'roads'] as const) {
      this._funding[id].value = String(funding[id]);
      this._fundRates[id].textContent = `${this._funding[id].value}%`;
    }
  }
}
