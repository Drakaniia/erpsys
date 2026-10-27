import { useEffect, useRef, useState } from "react";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { visibleStudentTabs, type StudentTab } from "$lib/student/tabs";

// ponytail: CSS transitions replace svelte/motion springs (underline travel,
// chat-tab bar slide). Settled positions identical; springs return only if a
// motion regression is reported.
export default function StudentTabBar({
  active,
  onselect,
}: {
  active: StudentTab;
  onselect: (tab: StudentTab) => void;
}) {
  const { flags } = useIntegrations();
  const tabs = visibleStudentTabs(flags.cloudflareChat);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = tabRefs.current[active];
    if (!el) return;
    setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active]);

  function selectTab(tabId: StudentTab) {
    if (tabId !== active) onselect(tabId);
  }

  function onTabKeydown(event: React.KeyboardEvent, tab: StudentTab) {
    const index = tabs.findIndex((t) => t.id === tab);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next] ?? tabs[0]!;
    selectTab(target.id);
    tabRefs.current[target.id]?.focus();
  }

  return (
    <nav aria-label="Student sections">
      <div
        className={`fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[560px] transition-transform duration-200 ease-out lg:hidden ${active === "chat" ? "translate-y-full" : "translate-y-0"}`}
        aria-live="polite"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
          aria-hidden="true"
        />
        <div className="material relative flex bg-chrome backdrop-blur-md">
          <div
            aria-hidden="true"
            className="absolute bottom-1.5 top-1.5 w-1/3 rounded-xl bg-primary/10 transition-transform duration-200 ease-out"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={active === tab.id ? "page" : undefined}
              className={`relative z-10 flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium transition-[transform,color] duration-100 ease-out active:scale-[0.97] ${
                active === tab.id ? "text-primary" : "text-muted"
              }`}
            >
              {tab.id === "progress" ? (
                <img
                  src="/images/progress.webp"
                  alt=""
                  width="20"
                  height="20"
                  className={`h-5 w-5 object-contain transition-[opacity,filter] duration-150 ${active === tab.id ? "opacity-100" : "opacity-60 grayscale"}`}
                  aria-hidden="true"
                />
              ) : tab.id === "chat" ? (
                <img
                  src="/images/ai_chat.webp"
                  alt=""
                  width="20"
                  height="20"
                  className={`h-5 w-5 object-contain transition-[opacity,filter] duration-150 ${active === tab.id ? "opacity-100" : "opacity-60 grayscale"}`}
                  aria-hidden="true"
                />
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-5 w-5 transition-opacity duration-150 ${active === tab.id ? "opacity-100" : "opacity-60"}`}
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M4.5 20v-.75a5.25 5.25 0 0 1 5.25-5.25h4.5a5.25 5.25 0 0 1 5.25 5.25V20" />
                </svg>
              )}
              <span>{tab.label}</span>
              {active === tab.id ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden lg:block">
        <div
          role="tablist"
          aria-orientation="horizontal"
          className="relative flex gap-1"
        >
          {tabs.map((tab) => {
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`student-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`student-tabpanel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeydown(event, tab.id)}
                className={`relative z-10 flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.97] ${
                  selected ? "text-primary" : "text-muted hover:text-ink"
                }`}
              >
                {tab.id === "progress" ? (
                  <img
                    src="/images/progress.webp"
                    alt=""
                    width="18"
                    height="18"
                    className={`h-[18px] w-[18px] object-contain transition-[opacity,filter] duration-150 ${selected ? "opacity-100" : "opacity-60 grayscale"}`}
                    aria-hidden="true"
                  />
                ) : tab.id === "chat" ? (
                  <img
                    src="/images/ai_chat.webp"
                    alt=""
                    width="18"
                    height="18"
                    className={`h-[18px] w-[18px] object-contain transition-[opacity,filter] duration-150 ${selected ? "opacity-100" : "opacity-60 grayscale"}`}
                    aria-hidden="true"
                  />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-[18px] w-[18px] transition-opacity duration-150 ${selected ? "opacity-100" : "opacity-60"}`}
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M4.5 20v-.75a5.25 5.25 0 0 1 5.25-5.25h4.5a5.25 5.25 0 0 1 5.25 5.25V20" />
                  </svg>
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
          >
            <span
              className="absolute bottom-0 h-full rounded-full bg-primary transition-[left,width] duration-200 ease-out"
              style={{ left: underline.left, width: underline.width }}
            />
          </span>
        </div>
      </div>
    </nav>
  );
}
