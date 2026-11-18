import { useLayoutEffect, type RefObject } from "react";

/** Keep menus in their dialog's DOM/focus scope while escaping overflow clipping. */
export function useDropdownPanel(
  open: boolean,
  trigger: RefObject<HTMLButtonElement | null>,
  panel: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const menu = panel.current;
    const button = trigger.current;
    if (!open || !menu || !button) return;
    if (!menu.showPopover) {
      menu.removeAttribute("popover");
      return;
    }

    function position() {
      if (!menu || !button) return;
      const rect = button.getBoundingClientRect();
      const edge = 8;
      const gap = 6;
      const below = window.innerHeight - rect.bottom - gap - edge;
      const above = rect.top - gap - edge;
      const up = below < Math.min(menu.scrollHeight, 320) && above > below;
      menu.style.minWidth = `${Math.min(rect.width, window.innerWidth - edge * 2)}px`;
      menu.style.maxHeight = `${Math.max(0, Math.min(320, up ? above : below))}px`;
      menu.style.maxWidth = `${window.innerWidth - edge * 2}px`;
      const width = menu.getBoundingClientRect().width;
      menu.style.left = `${Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge))}px`;
      menu.style.top = `${up ? rect.top - gap - menu.getBoundingClientRect().height : rect.bottom + gap}px`;
      menu.style.transformOrigin = up ? "bottom left" : "top left";
    }

    menu.showPopover();
    position();
    function onScroll(event: Event) {
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      position();
    }
    window.addEventListener("resize", position);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
      if (menu.isConnected) menu.hidePopover?.();
    };
  }, [open, trigger, panel]);
}
