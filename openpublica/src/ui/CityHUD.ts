import type { CityStats } from '../sim/CitySim';
import type { SimulationClock } from '../sim/SimulationClock';

/**
 * City HUD — top status bar (money / population / jobs / date) plus
 * demand bars for residential, commercial, and industrial zones.
 *
 * Reads from CityStats and SimulationClock; never mutates sim internals.
 */
export class CityHUD {
  private readonly _root: HTMLElement;

  // Status fields
  private readonly _money:  HTMLElement;
  private readonly _pop:    HTMLElement;
  private readonly _jobs:   HTMLElement;
  private readonly _date:   HTMLElement;

  // Demand bar fills
  private readonly _resFill: HTMLElement;
  private readonly _comFill: HTMLElement;
  private readonly _indFill: HTMLElement;

  // Demand bar labels (numeric %)
  private readonly _resLabel: HTMLElement;
  private readonly _comLabel: HTMLElement;
  private readonly _indLabel: HTMLElement;

  constructor(root: HTMLElement) {
    this._root = root;
    this._root.innerHTML = `
      <div id="hud-status">
        <span class="hud-item" id="hud-money">💰 $0</span>
        <span class="hud-sep">|</span>
        <span class="hud-item" id="hud-pop">👥 Pop: 0</span>
        <span class="hud-sep">|</span>
        <span class="hud-item" id="hud-jobs">💼 Jobs: 0</span>
        <span class="hud-sep">|</span>
        <span class="hud-item" id="hud-date">📅 Jan 2000</span>
      </div>
      <div id="hud-demand">
        <div class="demand-row">
          <span class="demand-label">Res</span>
          <div class="demand-track">
            <div class="demand-fill res-fill" id="hud-res-fill"></div>
          </div>
          <span class="demand-pct" id="hud-res-label">0%</span>
        </div>
        <div class="demand-row">
          <span class="demand-label">Com</span>
          <div class="demand-track">
            <div class="demand-fill com-fill" id="hud-com-fill"></div>
          </div>
          <span class="demand-pct" id="hud-com-label">0%</span>
        </div>
        <div class="demand-row">
          <span class="demand-label">Ind</span>
          <div class="demand-track">
            <div class="demand-fill ind-fill" id="hud-ind-fill"></div>
          </div>
          <span class="demand-pct" id="hud-ind-label">0%</span>
        </div>
      </div>
    `;

    this._money    = this._root.querySelector('#hud-money')!;
    this._pop      = this._root.querySelector('#hud-pop')!;
    this._jobs     = this._root.querySelector('#hud-jobs')!;
    this._date     = this._root.querySelector('#hud-date')!;
    this._resFill  = this._root.querySelector('#hud-res-fill')!;
    this._comFill  = this._root.querySelector('#hud-com-fill')!;
    this._indFill  = this._root.querySelector('#hud-ind-fill')!;
    this._resLabel = this._root.querySelector('#hud-res-label')!;
    this._comLabel = this._root.querySelector('#hud-com-label')!;
    this._indLabel = this._root.querySelector('#hud-ind-label')!;
  }

  /** Refresh all HUD elements from the latest sim state. */
  update(stats: CityStats, clock: SimulationClock): void {
    const moneyStr = `💰 $${stats.money.toLocaleString()}`;
    this._money.textContent = stats.bankruptcyWarning
      ? `${moneyStr} ⚠️ BANKRUPT`
      : moneyStr;
    this._money.classList.toggle('hud-money-warning', stats.bankruptcyWarning);
    this._pop.textContent   = `👥 Pop: ${stats.population.toLocaleString()}`;
    this._jobs.textContent  = `💼 Jobs: ${stats.jobs.toLocaleString()}`;
    this._date.textContent  = `📅 ${clock.monthName} ${clock.year}`;

    this._setBar(this._resFill, this._resLabel, stats.residentialDemand);
    this._setBar(this._comFill, this._comLabel, stats.commercialDemand);
    this._setBar(this._indFill, this._indLabel, stats.industrialDemand);
  }

  private _setBar(fill: HTMLElement, label: HTMLElement, value: number): void {
    const pct = Math.min(100, Math.max(0, value));
    fill.style.width    = `${pct}%`;
    label.textContent   = `${Math.round(pct)}%`;
  }
}
