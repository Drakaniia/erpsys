/**
 * True when a global single-key shortcut must not fire: the user is typing or
 * picking in a form control, holds a modifier (browser shortcuts), or a modal
 * dialog is open and owns the keyboard.
 */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (
    t &&
    (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  ) {
    return true;
  }
  return document.querySelector('[aria-modal="true"]') !== null;
}
