const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogTrapOptions {
  /** Called on Escape. Omit to leave Escape unhandled. */
  onEscape?: () => void;
  /** Extra keys. Return true when handled, to skip Escape and Tab. */
  onKey?: (event: KeyboardEvent) => boolean;
  /** `auto` takes the `[data-modal-initial-focus]` mark, else the first
   *  focusable; `panel` puts focus on the panel itself. */
  initialFocus?: "auto" | "panel";
}

const pendingRestore = new WeakMap<HTMLElement, HTMLElement | null>();

/**
 * A trap torn down and rebuilt for the same panel in one commit (a parent
 * re-render handing the dialog a new callback) inherits the old trap's
 * restore target and leaves focus where the user has it.
 */
export function dialogTrap(
  panel: HTMLElement,
  options: DialogTrapOptions = {},
) {
  const rebuilt = pendingRestore.has(panel);
  const restoreTo = rebuilt
    ? pendingRestore.get(panel)!
    : (document.activeElement as HTMLElement | null);
  pendingRestore.delete(panel);

  const focusables = () =>
    Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));

  if (rebuilt) {
    // Focus stays put.
  } else if (options.initialFocus === "panel") {
    panel.focus();
  } else {
    const marked = panel.querySelector<HTMLElement>(
      "[data-modal-initial-focus]",
    );
    const first = focusables()[0];
    (marked && !marked.hasAttribute("disabled")
      ? marked
      : (first ?? panel)
    ).focus();
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (options.onKey?.(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      options.onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const current = document.activeElement;
    if (event.shiftKey) {
      if (current === first || current === panel) {
        event.preventDefault();
        last.focus();
      }
    } else if (current === last || !panel.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", onKeydown);

  return {
    destroy() {
      document.removeEventListener("keydown", onKeydown);
      pendingRestore.set(panel, restoreTo);
      queueMicrotask(() => {
        if (!pendingRestore.has(panel)) return;
        pendingRestore.delete(panel);
        restoreTo?.focus();
      });
    },
  };
}
