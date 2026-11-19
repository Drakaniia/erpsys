import { useEffect, useRef, useState } from "react";
import { OFFICER_TABS, type OfficerTab } from "$lib/officer/tabs";
import type { StepCode } from "$lib/officer/types";

// ponytail: sliding pill + badge springs dropped — active tab keeps the
// solid bg-primary style (the svelte reduced-motion variant). Add when
// motion polish is scheduled for this surface.
export default function OfficerTabBar({
  active,
  counts = {},
  onselect,
}: {
  active: OfficerTab;
  counts: Partial<Record<StepCode, number>>;
  onselect: (tab: OfficerTab) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
  }, [counts]);

  function selectTab(tabId: OfficerTab) {
    if (tabId !== active) onselect(tabId);
  }

  function onTabKeydown(event: React.KeyboardEvent, tab: OfficerTab) {
    const index = OFFICER_TABS.findIndex((t) => t.id === tab);
    const count = OFFICER_TABS.length;
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
    const target = OFFICER_TABS[next];
    selectTab(target.id);
    const el = tabRefs.current[target.id];
    el?.focus();
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  return (
    <nav
      aria-label="Officer steps"
      className="material sticky top-0 z-30 bg-chrome backdrop-blur-md"
    >
      <div className="relative mx-auto w-full max-w-[1200px]">
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
            {OFFICER_TABS.map((tab) => {
              const selected = active === tab.id;
              const badgeCount = tab.stepCode ? (counts[tab.stepCode] ?? 0) : 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`officer-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`officer-tabpanel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => onTabKeydown(event, tab.id)}
                  className={`group relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.97] ${
                    selected
                      ? "bg-primary text-white active:bg-primary-soft"
                      : "text-ink/70 hover:text-ink active:bg-ink/5"
                  }`}
                >
                  {tab.label}
                  {badgeCount > 0 && (
                    <span
                      aria-hidden="true"
                      className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                        selected
                          ? "bg-surface text-primary"
                          : "bg-primary text-white"
                      }`}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-chrome to-transparent ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
        ></div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-chrome to-transparent ${canScrollRight ? "opacity-100" : "opacity-0"}`}
        ></div>
      </div>
    </nav>
  );
}
