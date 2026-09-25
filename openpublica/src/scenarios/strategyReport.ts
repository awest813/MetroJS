// ⚠️  This file must NOT import anything from @babylonjs/core.

import { STRATEGIES, playStrategy, summarize, taxStrategy, type StrategySummary } from './strategyPlayer';

/**
 * The strategy and gameflow tables of docs/STRATEGY_AND_GAMEFLOW.md, as text
 * (`npm run strategies`). Pass strategy ids to run only those.
 */

const money = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const pad = (text: string | number, width: number): string => String(text).padStart(width);

function strategyTable(rows: readonly StrategySummary[]): string[] {
  const out = ['strategy         pop y5  pop y10   money y10  net/mo y10  score y10  months in debt'];
  for (const r of rows) {
    out.push(`${r.id.padEnd(16)} ${pad(r.populationY5, 6)} ${pad(r.populationY10, 8)} ${pad(money(r.moneyY10), 11)} ${pad(money(r.netY10), 11)} ${pad(r.approvalY10, 10)} ${pad(r.monthsInDebt, 15)}`);
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
    const rates = [7, 9, 10, 11, 12, 13];
    const sweep = [...rates.map((r) => taxStrategy(r)), taxStrategy(12, true)].map((s) => summarize(playStrategy(s)));
    lines.push('The balanced town at each tax rate', ...strategyTable(sweep), '');
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
