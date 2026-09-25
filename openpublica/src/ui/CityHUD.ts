import type { CityStats } from '../sim/CitySim';
import type { SimulationClock } from '../sim/SimulationClock';
import { describeWeatherEffects, formatWeather, weatherLabel, type Weather } from '../sim/weather';
import { commerceTooltip, formatPopulation, happinessTooltip, housingTooltip, industryTooltip } from './chromeCopy';
import { HAPPY_DRAW } from '../sim/happiness';
import { demandForZone, housingDemand } from '../sim/zoneGrowthHints';
import { ZoneType } from '../sim/CityTile';
import { SHOP_JOBS_PER_RESIDENT } from '../sim/ZoneGrowthSystem';

/** Where the HUD reads this month's weather and the forecast (the sim). */
export interface WeatherSource {
  readonly weather: Weather;
  readonly nextWeather: Weather;
}

/** Weather tooltip: this month, what it does, and next month. */
export function weatherTooltip(now: Weather, next: Weather): string {
  const effect = describeWeatherEffects(now.kind);
  const ahead = next.kind === now.kind ? null : describeWeatherEffects(next.kind);
  const degrees = `${now.temperature < 0 ? '−' : ''}${Math.abs(now.temperature)}°C`;
  const nextText = next.kind === now.kind
    ? `${weatherLabel(next.kind).toLowerCase()} again`
    : `${weatherLabel(next.kind).toLowerCase()}${ahead ? ` — ${ahead}` : ''}`;
  return [
    `${weatherLabel(now.kind)}, ${degrees} this ${now.season} month${effect ? ` — ${effect}` : ''}.`,
    `Next month: ${nextText}.`,
  ].join(' ');
}

/**
 * City HUD — compact vitals plus demand. Never mutates sim internals.
 */
export class CityHUD {
  private readonly _money:         HTMLElement;
  private readonly _pop:           HTMLElement;
  private readonly _jobs:          HTMLElement;
  private readonly _date:          HTMLElement;
  private readonly _weather:       HTMLElement;
  private _dateText = '';
  private readonly _happiness:     HTMLElement;
  private readonly _walkability:   HTMLElement;
  private readonly _transitAccess: HTMLElement;
  private readonly _pollution:     HTMLElement;
  private readonly _crime:         HTMLElement;
  private readonly _fire:          HTMLElement;
  private readonly _water:         HTMLElement;
  private readonly _power:         HTMLElement;
  private readonly _approval:      HTMLElement;
  private readonly _advisory:      HTMLElement;
  /** Where the advisory on show points, if anywhere. */
  private _advisoryAt: { x: number; y: number } | null = null;
  private _onAdvisoryJump: ((x: number, y: number) => void) | null = null;
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
        <span class="hud-item" id="hud-pop" title="Population. Dark means those residents have no power and may leave.">Pop 0</span>
        <span class="hud-item" id="hud-jobs" title="Jobs">Jobs 0</span>
        <span class="hud-item" id="hud-power" title="Power drawn from plants on the street grid, of what they can carry">Power none</span>
        <span class="hud-item" id="hud-date" title="Calendar: a month passes every 30 seconds at 1×">Jan 1, 2000</span>
        <span class="hud-item" id="hud-weather" title="This month's weather">Clear</span>
        <span class="hud-item hud-muted" id="hud-happiness" title="Happiness">Happy 100</span>
        <span class="hud-item hud-muted" id="hud-walkability" title="Walkability">Walk 0</span>
        <span class="hud-item hud-muted" id="hud-transit" title="Transit access">Transit 0</span>
        <span class="hud-item hud-muted" id="hud-pollution" title="Average pollution on roads, zones, and buildings">Poll 0</span>
        <span class="hud-item hud-muted" id="hud-crime" title="Average crime">Crime 0</span>
        <span class="hud-item hud-muted" id="hud-fire" title="Average fire coverage on occupied lots">Fire 0</span>
        <span class="hud-item hud-muted" id="hud-water" title="Percent of zoned lots that are watered">Water 0</span>
        <span class="hud-item" id="hud-approval" title="Mayor approval">Score 100</span>
      </div>
        <div id="hud-advisory" class="hud-advisory" title="Top city problem">Paint a street, zone lots beside it, then place a power plant.</div>
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
    this._weather       = root.querySelector('#hud-weather')!;
    this._happiness     = root.querySelector('#hud-happiness')!;
    this._walkability   = root.querySelector('#hud-walkability')!;
    this._transitAccess = root.querySelector('#hud-transit')!;
    this._pollution     = root.querySelector('#hud-pollution')!;
    this._crime         = root.querySelector('#hud-crime')!;
    this._fire          = root.querySelector('#hud-fire')!;
    this._water         = root.querySelector('#hud-water')!;
    this._power         = root.querySelector('#hud-power')!;
    this._approval      = root.querySelector('#hud-approval')!;
    this._advisory      = root.querySelector('#hud-advisory')!;
    this._advisory.addEventListener('click', () => {
      if (this._advisoryAt && this._onAdvisoryJump) this._onAdvisoryJump(this._advisoryAt.x, this._advisoryAt.y);
    });
    this._resFill  = root.querySelector('#hud-res-fill')!;
    this._comFill  = root.querySelector('#hud-com-fill')!;
    this._indFill  = root.querySelector('#hud-ind-fill')!;
    this._resLabel = root.querySelector('#hud-res-label')!;
    this._comLabel = root.querySelector('#hud-com-label')!;
    this._indLabel = root.querySelector('#hud-ind-label')!;
  }

  /** Refresh the calendar only; cheap enough to call every frame. */
  tickClock(clock: SimulationClock): void {
    const text = clock.dateLabel;
    if (text === this._dateText) return;
    this._dateText = text;
    this._date.textContent = text;
  }

  /** Called with the advisory's tile when the player clicks an advisory that has one. */
  onAdvisoryJump(callback: (x: number, y: number) => void): void {
    this._onAdvisoryJump = callback;
  }

  update(stats: CityStats, clock: SimulationClock, sky?: WeatherSource): void {
    this._money.textContent = stats.bankruptcyWarning
      ? `$${stats.money.toLocaleString()}  bankrupt`
      : `$${stats.money.toLocaleString()}`;
    this._money.classList.toggle('hud-money-warning', stats.bankruptcyWarning);
    this._pop.textContent  = formatPopulation(stats.population, stats.darkPopulation);
    this._jobs.textContent = `Jobs ${stats.jobs.toLocaleString()}`;
    this.tickClock(clock);
    if (sky) {
      const now = sky.weather;
      this._weather.textContent = formatWeather(now);
      this._weather.title = weatherTooltip(now, sky.nextWeather);
      this._weather.dataset.weather = now.kind;
      this._weather.classList.toggle('hud-weather-costly', now.kind === 'heat' || now.kind === 'snow');
    }
    this._happiness.textContent     = `Happy ${stats.happiness}`;
    this._happiness.title = happinessTooltip(stats.happiness, stats.happinessParts);
    this._happiness.classList.toggle('hud-money-warning', stats.happiness < HAPPY_DRAW);
    this._walkability.textContent   = `Walk ${stats.walkability}`;
    this._transitAccess.textContent = `Transit ${stats.transitAccess}`;
    this._pollution.textContent     = `Poll ${stats.pollutionAverage}`;
    this._crime.textContent         = `Crime ${stats.crimeAverage}`;
    this._fire.textContent          = `Fire ${stats.fireAverage}`;
    this._water.textContent         = `Water ${stats.waterAverage}`;
    this._water.title = stats.waterSupply > 0
      ? `Water mains carry ${stats.waterLoad} of ${stats.waterSupply}; ${stats.waterAverage}% of zoned lots are watered`
      : 'Percent of zoned lots that are watered';
    this._power.textContent = stats.powerSupply > 0 ? `Power ${stats.powerLoad}/${stats.powerSupply}` : 'Power none';
    const strained = stats.powerShort > 0 || (stats.powerSupply > 0 && stats.powerLoad >= 0.9 * stats.powerSupply);
    this._power.classList.toggle('hud-money-warning', strained);
    this._power.title = stats.powerShort > 0
      ? `Plants are at capacity: ${stats.powerShort} building${stats.powerShort === 1 ? '' : 's'} on the grid get no power`
      : 'Power drawn from plants on the street grid, of what they can carry';
    this._approval.textContent      = `Score ${stats.approval}`;
    const alert = stats.advisory.trim().length > 0;
    this._advisory.textContent = alert ? stats.advisory : 'No mayor alerts.';
    this._advisory.classList.toggle('hud-advisory-alert', alert);
    // An advisory with a place is a link: click to see where.
    this._advisoryAt = alert ? stats.advisoryAt ?? null : null;
    this._advisory.classList.toggle('hud-advisory-link', this._advisoryAt !== null);
    this._advisory.title = this._advisoryAt ? 'Top city problem — click to see where' : 'Top city problem';

    // Housing demand as people act on it: happiness and the tax turn part of it away.
    const housing = housingDemand(stats);
    this._setBar(this._resFill, this._resLabel, housing);
    const resRow = this._resFill.closest('.demand-row');
    if (resRow instanceof HTMLElement) {
      resRow.title = housingTooltip(stats, housing);
    }
    // Shop and factory demand as they act on it, after their taxes.
    const shops = demandForZone(ZoneType.Commercial, stats);
    const works = demandForZone(ZoneType.Industrial, stats);
    this._setBar(this._comFill, this._comLabel, shops);
    this._setBar(this._indFill, this._indLabel, works);
    const comRow = this._comFill.closest('.demand-row');
    if (comRow instanceof HTMLElement) comRow.title = commerceTooltip(stats, SHOP_JOBS_PER_RESIDENT, shops);
    const indRow = this._indFill.closest('.demand-row');
    if (indRow instanceof HTMLElement) indRow.title = industryTooltip(stats, works);
  }

  private _setBar(fill: HTMLElement, label: HTMLElement, value: number): void {
    const pct = Math.min(100, Math.max(0, value));
    fill.style.width  = `${pct}%`;
    label.textContent = `${Math.round(pct)}%`;
  }
}
