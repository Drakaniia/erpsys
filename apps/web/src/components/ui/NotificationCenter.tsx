import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relativeTime } from "$lib/officer/format";
import { api } from "$lib/api";
import { authClient } from "$lib/auth-client";
import { prefersReducedMotion, rubberband } from "$lib/motion";
import {
  createEnrollmentReport,
  ENROLLMENT_REPORT_ACTION,
  NOT_READY_MESSAGE,
} from "$lib/student/enrollment-report";
import type { NotificationItem } from "$lib/student/types";
import ReportReviewModal from "../report/ReportReviewModal";
import {
  releaseReview,
  saveReview,
  type PreparedReview,
} from "$lib/report/review";
import "./NotificationCenter.css";

export default function NotificationCenter({
  items: itemsProp,
  onview,
  compact = false,
}: {
  items?: NotificationItem[] | undefined;
  onview?: ((item: NotificationItem) => void) | undefined;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const sessionQuery = authClient.useSession();

  // The 20s poll lives in the student and instructor state stores. This is a
  // plain read of the shared cache entry for surfaces that render the bell
  // without an items prop — it must never open a second poll of the same key,
  // nor fire at all once the session is gone (sign-out race → 401).
  const ownQuery = useQuery(
    api.notifications.listMine.queryOptions({
      enabled:
        itemsProp === undefined &&
        !sessionQuery.isPending &&
        Boolean(sessionQuery.data),
      refetchOnWindowFocus: true,
    }),
  );
  const items: NotificationItem[] =
    itemsProp ?? (ownQuery.data?.data as NotificationItem[] | undefined) ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const markReadMutation = useMutation(
    api.notifications.markAllRead.mutationOptions(),
  );

  // The one generator shared with the Profile-tab door (D4). Downloading from a
  // row must never close the panel, dismiss the row, or touch read-state (D9),
  // so the flow is invoked in place and its own busy state drives the button.
  // ponytail: the factory holds plain fields, so we bump a counter to re-read
  // them; add a subscription only if two surfaces ever share one instance.
  const [report] = useState(() => createEnrollmentReport());
  const [, bumpReport] = useState(0);
  const [review, setReview] = useState<PreparedReview | null>(null);

  useEffect(() => {
    if (!review) return;
    return () => releaseReview(review);
  }, [review]);

  function openReportReview() {
    void report
      .prepare()
      .then((prepared) => {
        if (prepared) setReview(prepared);
      })
      .finally(() => bumpReport((n) => n + 1));
  }

  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [panelIn, setPanelIn] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const panelEl = useRef<HTMLDivElement | null>(null);

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    dx: number;
    vx: number;
    t: number;
  } | null>(null);
  const lastX = useRef(0);
  const lastT = useRef(0);

  function onRowDown(e: React.PointerEvent, id: string) {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ id, startX: e.clientX, dx: 0, vx: 0, t: performance.now() });
    lastX.current = e.clientX;
    lastT.current = performance.now();
  }
  function onRowMove(e: React.PointerEvent) {
    if (!dragging) return;
    const now = performance.now();
    const dxRaw = e.clientX - dragging.startX;
    let dx = Math.min(0, dxRaw);
    if (dx < -72) {
      const over = dx + 72;
      const dim = 320;
      dx = -72 + rubberband(Math.abs(over), dim, 0.55) * -1;
    }
    const dt = Math.max(1, now - lastT.current);
    const vx = (e.clientX - lastX.current) / dt; // px/ms
    setDragging({ ...dragging, dx, vx, t: now });
    lastX.current = e.clientX;
    lastT.current = now;
  }
  function onRowUp() {
    if (!dragging) return;
    const { id, dx, vx } = dragging;
    setDragging(null);
    const flingLeft = vx < -0.9;
    const farEnough = dx < -56;
    if (flingLeft || farEnough) {
      setDismissed((prev) => new Set(prev).add(id));
    }
  }

  const shown = items.filter((n) => !dismissed.has(n.id));

  async function open() {
    setIsOpen(true);
    setVisible(true);
    setPanelIn(false);
    // spec §7.6 — opening marks everything read
    if (unread > 0) {
      try {
        await markReadMutation.mutateAsync({});
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({
          queryKey: api.notifications.listMine.queryKey(),
        });
      } catch {
        // polling reconciles
      }
    }
    requestAnimationFrame(() => {
      setPanelIn(true);
      panelEl.current
        ?.querySelector<HTMLElement>("button, [tabindex]")
        ?.focus();
    });
  }
  function close() {
    if (!isOpen) return;
    setIsOpen(false);
    setPanelIn(false);
    const reduce = prefersReducedMotion();
    const delay = reduce ? 140 : 190;
    setTimeout(() => setVisible(false), delay);
  }
  function toggle() {
    if (isOpen) close();
    else void open();
  }
  function view(item: NotificationItem) {
    close();
    onview?.(item);
  }
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function onScroll() {
    setIsScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 700);
  }

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="notification-center-panel"
        aria-label={
          unread > 0 ? `Notifications — ${unread} unread` : "Notifications"
        }
        onClick={toggle}
        className={`press relative rounded-full p-2 text-ink transition-[background-color] duration-100 ease-out hover:bg-surface-raised active:scale-[0.93] ${
          compact ? "p-1.5" : ""
        }`}
      >
        <svg
          width={compact ? 18 : 20}
          height={compact ? 18 : 20}
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
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="notif-badge absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold tabular-nums text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {visible ? (
        <div
          ref={panelEl}
          id="notification-center-panel"
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          className={`notif-panel absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface-raised/90 shadow-[0_8px_24px_rgba(16,24,40,0.12),0_2px_8px_rgba(16,24,40,0.06)] backdrop-blur-md ${
            panelIn ? "is-open" : ""
          }`}
          style={{ transformOrigin: "top right" }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold tracking-[-0.01em] text-ink">
              Notifications
            </p>
            <div className="flex items-center gap-1">
              {unread > 0 ? (
                <span className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">
                  {unread} new
                </span>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close notifications"
                className="press rounded-full p-1 text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div
            onScroll={onScroll}
            className={`apple-scrollbar max-h-96 overflow-y-auto lg:max-h-[70vh] ${
              isScrolling ? "is-scrolling" : ""
            }`}
          >
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">
                  All caught up
                </p>
                <p className="mt-1 text-xs text-muted">
                  New updates will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((item) => (
                  <li
                    key={item.id}
                    className="relative select-none overflow-hidden"
                    style={
                      dragging !== null && dragging.id === item.id
                        ? {
                            transform: `translateX(${dragging.dx}px)`,
                            willChange: "transform",
                          }
                        : undefined
                    }
                  >
                    <div
                      role="group"
                      onPointerDown={(e) => onRowDown(e, item.id)}
                      onPointerMove={onRowMove}
                      onPointerUp={onRowUp}
                      onPointerCancel={onRowUp}
                      className="flex items-start gap-3 px-4 py-3 transition-colors lg:hover:bg-surface"
                      style={{ touchAction: "pan-y" }}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.readAt ? "bg-ink/10" : "bg-primary"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-5 text-ink">
                          {item.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted">
                          {item.body}
                        </p>
                        <p className="mt-1 text-[11px] tabular-nums text-muted/80">
                          {relativeTime(item.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.action?.kind === ENROLLMENT_REPORT_ACTION ? (
                          <>
                            <button
                              type="button"
                              aria-busy={report.isPending}
                              disabled={report.isPending}
                              onClick={openReportReview}
                              className="press rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-primary hover:border-primary/40 disabled:opacity-60"
                            >
                              {item.action.label}
                            </button>
                            {report.state === "notReady" ? (
                              <p className="max-w-[12rem] text-right text-[11px] leading-4 text-muted">
                                {NOT_READY_MESSAGE}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                        {onview ? (
                          <button
                            type="button"
                            onClick={() => view(item)}
                            className="press shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-primary hover:border-primary/40"
                          >
                            View
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {review ? (
        <ReportReviewModal
          review={review}
          onclose={() => setReview(null)}
          onconfirm={() => {
            saveReview(review);
            setReview(null);
          }}
        />
      ) : null}
    </div>
  );
}
