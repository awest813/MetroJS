/**
 * Shared chrome strings and money formatting. No DOM — Jest can load this.
 */

export const SETTINGS_SHORTCUTS =
  '1–3 views · P pause · [ ] speed · M mute · Ctrl+S save · Esc · Home frame';

export function cityFileNote(hasSave: boolean, justSaved: boolean): string {
  if (justSaved) return 'Saved in this browser.';
  return hasSave ? 'Save kept in this browser.' : 'No save yet.';
}

export function formatSignedMoney(amount: number): string {
  const abs = Math.abs(Math.round(amount)).toLocaleString();
  if (amount < 0) return `-$${abs}`;
  return `$${abs}`;
}

export function formatBudgetNet(income: number, expenses: number): string {
  return `${formatSignedMoney(income - expenses)}/mo`;
}
