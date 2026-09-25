// ⚠️  This file must NOT import anything from @babylonjs/core.

import { STRATEGIES, playStrategy, summarize, taxStrategy, type StrategySummary } from './strategyPlayer';
import { MILESTONES } from '../sim/milestones';

/**
 * The strategy and gameflow tables of docs/STRATEGY_AND_GAMEFLOW.md, as text
 * (`npm run strategies`). Pass strategy ids to run only those.
 */

const money = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const pad = (text: string | number, width: number): string => String(text).padStart(width);

function strategyTable(rows: readonly StrategySummary[]): string[] {
  const out = ['strategy         pop y5  pop y10   money y10  net/mo y10 rating y10  months in debt (longest, bailouts)  lowest money'];
  for (const r of rows) {
    const debt = r.monthsInDebt > 0 ? `${r.monthsInDebt} (${r.longestDebt}, ${r.bailouts})` : '0';
    out.push(`${r.id.padEnd(16)} ${pad(r.populationY5, 6)} ${pad(r.populationY10, 8)} ${pad(money(r.moneyY10), 11)} ${pad(money(r.netY10), 11)} ${pad(r.approvalY10, 10)} ${pad(debt, 35)} ${pad(money(r.lowMoney), 13)}`);
  }
  return out;
}

function milestoneTable(rows: readonly StrategySummary[]): string[] {
  const out = [`strategy        ${MILESTONES.map((m) => pad(`${m.name} ${m.population}`, 14)).join('')}`];
  for (const r of rows) {
    const cells = r.milestoneMonths.map((m) => pad(Number.isFinite(m) ? `m${m} (y${Math.ceil(m / 12)})` : '—', 14));
    out.push(`${r.id.padEnd(16)}${cells.join('')}`);
  }
  return out;
}

function lateGameTable(rows: readonly StrategySummary[]): string[] {
  const out = ['strategy         civic spent   surplus to civic   money kept   3 yrs of expenses'];
  for (const r of rows) {
    out.push(`${r.id.padEnd(16)} ${pad(money(r.civicSpentY10), 11)} ${pad(`${Math.round(r.civicShareY10 * 100)}%`, 18)} ${pad(money(r.moneyY10), 12)} ${pad(money(36 * r.expensesY10), 19)}`);
  }
  return out;
}

export function strategyReport(only: readonly string[] = []): string {
  const pick = (id: string): boolean => only.length === 0 || only.includes(id);
  const lines: string[] = [];
  const runs = STRATEGIES.filter((s) => pick(s.id)).map((s) => summarize(playStrategy(s)));
  if (runs.length > 0) {
    lines.push('Strategies (20 years from a new city, $10,000, map seed 2026)', ...strategyTable(runs), '');
  }
  if (pick('taxes')) {
    const rates = [5, 7, 9, 10, 11, 12, 13, 15, 17, 20];
    const sweep = [...rates.map((r) => taxStrategy(r)), taxStrategy(12, true)].map((s) => summarize(playStrategy(s)));
    lines.push('The balanced town at each tax rate', ...strategyTable(sweep), '');
  }
  if (runs.length > 0) {
    lines.push('Milestones: the month each was reached (— not in 20 years)', ...milestoneTable(runs), '');
    lines.push('Year 10: what it chose to spend on civic buildings, and what it kept', ...lateGameTable(runs), '');
  }
  const balanced = runs.find((r) => r.id === 'balanced');
  if (balanced) {
    lines.push(
      'Gameflow of the balanced town',
      `  lowest treasury ${money(balanced.lowMoney)} in month ${balanced.lowMonth}`,
      `  months with a decision in years 1, 2, 3, 5, 10, 20: ${balanced.activeMonths.join(', ')}`,
    );
  }
  return lines.join('\n');
}
