import { useEffect, useRef, useState } from "react";
import { absoluteTime, relativeTime } from "$lib/officer/format";
import type { BellData } from "$lib/officer/types";

// ponytail: svelte pop-in/badge springs dropped — settled DOM identical.
export default function OfficerBell({
  count,
  isLoading = false,
  items,
  onreview,
}: {
  count: number;
  isLoading?: boolean;
  items: BellData["items"];
  onreview: (item: BellData["items"][number]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  function review(item: BellData["items"][number]) {
    setIsOpen(false);
    onreview(item);
  }

  function onScroll() {
    setIsScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 700);
  }

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node))
        setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="officer-bell-popover"
        aria-label={
          isLoading
            ? "Notifications — loading"
            : count > 0
              ? `Notifications — ${count} unverified`
              : "Notifications"
        }
        aria-busy={isLoading}
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-full p-2 text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface-raised active:scale-[0.93]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {isLoading ? (
          <span
            aria-hidden="true"
            className="skeleton absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full"
          ></span>
        ) : (
          count > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold tabular-nums text-white"
            >
              {count > 99 ? "99+" : count}
            </span>
          )
        )}
      </button>
      {isOpen && (
        <div
          id="officer-bell-popover"
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface-raised shadow-lg"
        >
          <div
            onScroll={onScroll}
            className={`apple-scrollbar max-h-96 overflow-y-auto ${isScrolling ? "is-scrolling" : ""}`}
          >
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Nothing to review right now.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map(
                  (item: {
                    verificationId: string;
                    studentName: string;
                    stepName: string;
                    submittedAt: string;
                  }) => (
                    <li
                      key={item.verificationId}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {item.studentName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {item.stepName}
                        </p>
                      </div>
                      <time
                        className="shrink-0 text-xs text-muted tabular-nums"
                        title={absoluteTime(item.submittedAt)}
                      >
                        {relativeTime(item.submittedAt)}
                      </time>
                      <button
                        type="button"
                        onClick={() => review(item)}
                        className="shrink-0 text-sm font-medium text-primary hover:underline"
                      >
                        Review
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
