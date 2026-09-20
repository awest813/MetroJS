import type { CityStats } from '../sim/CitySim';
import type { SimulationClock } from '../sim/SimulationClock';

/**
 * City HUD — compact vitals plus demand. Never mutates sim internals.
 */
export class CityHUD {
  private readonly _money:         HTMLElement;
  private readonly _pop:           HTMLElement;
  private readonly _jobs:          HTMLElement;
  private readonly _date:          HTMLElement;
  private readonly _happiness:     HTMLElement;
  private readonly _walkability:   HTMLElement;
  private readonly _transitAccess: HTMLElement;
  private readonly _pollution:     HTMLElement;
  private readonly _crime:         HTMLElement;
  private readonly _fire:          HTMLElement;
  private readonly _approval:      HTMLElement;
  private readonly _advisory:      HTMLElement;
  private readonly _resFill: HTMLElement;
  private readonly _comFill: HTMLElement;
  private readonly _indFill: HTMLElement;
  private readonly _resLabel: HTMLElement;
  private readonly _comLabel: HTMLElement;
  private readonly _indLabel: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="hud-status">
        <span class="hud-item" id="hud-money" title="Treasury">$0</span>
        <span class="hud-item" id="hud-pop" title="Population">Pop 0</span>
        <span class="hud-item" id="hud-jobs" title="Jobs">Jobs 0</span>
        <span class="hud-item" id="hud-date" title="Calendar">Jan 2000</span>
        <span class="hud-item hud-muted" id="hud-happiness" title="Happiness">Happy 100</span>
        <span class="hud-item hud-muted" id="hud-walkability" title="Walkability">Walk 0</span>
        <span class="hud-item hud-muted" id="hud-transit" title="Transit access">Transit 0</span>
        <span class="hud-item hud-muted" id="hud-pollution" title="Average pollution">Poll 0</span>
        <span class="hud-item hud-muted" id="hud-crime" title="Average crime">Crime 0</span>
        <span class="hud-item hud-muted" id="hud-fire" title="Average fire coverage on occupied lots">Fire 0</span>
        <span class="hud-item" id="hud-approval" title="Mayor approval">Score 100</span>
      </div>
      <div id="hud-advisory" class="hud-advisory" title="Top city problem">Zone land and place a power plant.</div>
      <div id="hud-demand" title="Zone demand">
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

    this._money         = root.querySelector('#hud-money')!;
    this._pop           = root.querySelector('#hud-pop')!;
    this._jobs          = root.querySelector('#hud-jobs')!;
    this._date          = root.querySelector('#hud-date')!;
    this._happiness     = root.querySelector('#hud-happiness')!;
    this._walkability   = root.querySelector('#hud-walkability')!;
    this._transitAccess = root.querySelector('#hud-transit')!;
    this._pollution     = root.querySelector('#hud-pollution')!;
    this._crime         = root.querySelector('#hud-crime')!;
    this._fire          = root.querySelector('#hud-fire')!;
    this._approval      = root.querySelector('#hud-approval')!;
    this._advisory      = root.querySelector('#hud-advisory')!;
    this._resFill  = root.querySelector('#hud-res-fill')!;
    this._comFill  = root.querySelector('#hud-com-fill')!;
    this._indFill  = root.querySelector('#hud-ind-fill')!;
    this._resLabel = root.querySelector('#hud-res-label')!;
    this._comLabel = root.querySelector('#hud-com-label')!;
    this._indLabel = root.querySelector('#hud-ind-label')!;
  }

  update(stats: CityStats, clock: SimulationClock): void {
    this._money.textContent = stats.bankruptcyWarning
      ? `$${stats.money.toLocaleString()}  bankrupt`
      : `$${stats.money.toLocaleString()}`;
    this._money.classList.toggle('hud-money-warning', stats.bankruptcyWarning);
    this._pop.textContent  = `Pop ${stats.population.toLocaleString()}`;
    this._jobs.textContent = `Jobs ${stats.jobs.toLocaleString()}`;
    this._date.textContent = `${clock.monthName} ${clock.year}`;
    this._happiness.textContent     = `Happy ${stats.happiness}`;
    this._walkability.textContent   = `Walk ${stats.walkability}`;
    this._transitAccess.textContent = `Transit ${stats.transitAccess}`;
    this._pollution.textContent     = `Poll ${stats.pollutionAverage}`;
    this._crime.textContent         = `Crime ${stats.crimeAverage}`;
    this._fire.textContent          = `Fire ${stats.fireAverage}`;
    this._approval.textContent      = `Score ${stats.approval}`;
    const alert = stats.advisory.trim().length > 0;
    this._advisory.textContent = alert ? stats.advisory : 'No mayor alerts.';
    this._advisory.classList.toggle('hud-advisory-alert', alert);

    this._setBar(this._resFill, this._resLabel, stats.residentialDemand);
    this._setBar(this._comFill, this._comLabel, stats.commercialDemand);
    this._setBar(this._indFill, this._indLabel, stats.industrialDemand);
  }

  private _setBar(fill: HTMLElement, label: HTMLElement, value: number): void {
    const pct = Math.min(100, Math.max(0, value));
    fill.style.width  = `${pct}%`;
    label.textContent = `${Math.round(pct)}%`;
  }
}
