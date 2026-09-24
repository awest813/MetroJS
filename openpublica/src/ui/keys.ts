/** Input types that take typed text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url']);

/** Keys a focused slider uses to move. */
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * True when a key press is for the focused field rather than a game shortcut.
 * Text fields and menus keep every key; a slider (the tax and sun sliders)
 * keeps only the keys that move it. When every input counted as typing, a tax
 * slider kept focus after a drag and R, P, M, and Ctrl+S all stopped working.
 */
export function keyBelongsToField(event: { readonly target: EventTarget | null; readonly key: string }): boolean {
  const target = event.target;
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.type === 'range') return SLIDER_KEYS.has(event.key);
  return TEXT_INPUT_TYPES.has(target.type);
}
