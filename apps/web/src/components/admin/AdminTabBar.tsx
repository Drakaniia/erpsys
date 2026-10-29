import { useEffect, useRef, useState } from "react";
import { UI_SPRING } from "$lib/motion";
import { useReducedMotion } from "$lib/ui/use-reduced-motion";
import { useSpring } from "$lib/ui/use-spring";
import { ADMIN_TABS, type AdminTab } from "$lib/admin/tabs";

export default function AdminTabBar({
  active,
  hasActiveYear,
  onselect,
}: {
  active: AdminTab;
  hasActiveYear: boolean;
  onselect: (tab: AdminTab) => void;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateEdges() {
    const el = scroller.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    updateEdges();
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [pillLeft, setPillLeft] = useSpring(0, UI_SPRING);
  const [pillWidth, setPillWidth] = useSpring(0, UI_SPRING);
  useEffect(() => {
    const el = tabRefs.current[active];
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      setPillLeft(el.offsetLeft);
      setPillWidth(el.offsetWidth);
    });
    return () => cancelAnimationFrame(raf);
  }, [active, setPillLeft, setPillWidth]);

  function selectTab(tabId: AdminTab) {
    if (tabId !== active) onselect(tabId);
  }

  function onTabKeydown(event: React.KeyboardEvent, tab: AdminTab) {
    const index = ADMIN_TABS.findIndex((t) => t.id === tab);
    const count = ADMIN_TABS.length;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = ADMIN_TABS[next];
    selectTab(target.id);
    const el = tabRefs.current[target.id];
    el?.focus();
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  return (
    <nav
      aria-label="Admin sections"
      className="material sticky top-0 z-30 bg-chrome backdrop-blur-md"
    >
      <div className="relative mx-auto w-full max-w-[1440px]">
        <div
          ref={scroller}
          onScroll={updateEdges}
          className="apple-scrollbar overflow-x-auto"
        >
          <div
            role="tablist"
            aria-orientation="horizontal"
            className="relative flex w-max min-w-full gap-1 px-6 py-2"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 top-2 rounded-full bg-primary"
              style={{
                left: `${pillLeft}px`,
                width: `${pillWidth}px`,
                opacity: reduced ? 0 : 1,
              }}
            />
            {ADMIN_TABS.map((tab) => {
              const selected = active === tab.id;
              const disabled = tab.requiresYear && !hasActiveYear;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`admin-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`admin-tabpanel-${tab.id}`}
                  aria-disabled={disabled}
                  disabled={disabled}
                  tabIndex={selected ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => onTabKeydown(event, tab.id)}
                  title={
                    disabled ? "Requires an active academic year" : undefined
                  }
                  className={`group relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.97] ${
                    selected
                      ? reduced
                        ? "bg-primary text-white active:bg-primary-soft"
                        : "text-white"
                      : disabled
                        ? "text-muted/50"
                        : "text-ink/70 hover:text-ink active:bg-ink/5"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-chrome to-transparent ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-chrome to-transparent ${canScrollRight ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </nav>
  );
}
