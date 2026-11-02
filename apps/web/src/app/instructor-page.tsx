import { useEffect, useState } from "react";
import CalendarBanner from "../components/instructor/CalendarBanner";
import DepartmentManager from "../components/instructor/DepartmentManager";
import InstructorDialogs from "./instructor-dialogs";
import DeptTabHeader from "../components/instructor/DeptTabHeader";
import InstructorTabBar from "../components/instructor/InstructorTabBar";
import ServingPanel from "../components/instructor/ServingPanel";
import QueueListPanel from "../components/instructor/QueueListPanel";
import ShortcutsPopover from "../components/ui/ShortcutsPopover";
import EmptyState from "../components/ui/EmptyState";
import EnrolledTab from "../components/instructor/EnrolledTab";
import StudentsTab from "../components/instructor/StudentsTab";
import InstructorReportsTab from "../components/instructor/InstructorReportsTab";
import NotificationCenter from "../components/ui/NotificationCenter";
import PageLoader from "../components/ui/PageLoader";
import { authClient } from "$lib/auth-client";
import { useSessionGuard } from "$lib/auth/session-guard";
import { useInstructorState, IDLE_PROMPT_MS } from "$lib/instructor/state";
import { getInstructorShortcutAction } from "$lib/instructor/shortcuts";
import { REPORTS_TAB_ID } from "$lib/instructor/reports";
import type { EnrolledEntry } from "$lib/instructor/types";

const GUIDE_KEY = "instructor-guide-dismissed-v1";

const SHORTCUTS = [
  { action: "Students tab", keys: ["0"] },
  { action: "Switch department", keys: ["1", "–", "N"] },
  { action: "Serve next student", keys: ["S"] },
  { action: "Move through list", keys: ["J", "K", "↑", "↓"] },
  { action: "Serve highlighted row", keys: ["Enter"] },
  { action: "Close dialog", keys: ["Esc"] },
  { action: "Keyboard shortcuts", keys: ["?"] },
];

export function InstructorPage() {
  const guard = useSessionGuard("instructor");
  const sessionQuery = authClient.useSession();
  const user = (sessionQuery.data?.user ?? null) as {
    id?: string;
    role?: string;
  } | null;
  const myAdviserId = user?.id ?? "";

  const s = useInstructorState();
  const incomingTransferRequest = s.incomingTransferRequests[0] ?? null;

  const [guideAutoChecked, setGuideAutoChecked] = useState(false);

  useEffect(() => {
    if (guideAutoChecked) return;
    if (guard.isPending) return;
    if (guard.isRedirecting) return;
    if (user?.role !== "ENROLLMENT_ADVISER" && user?.role !== "ADMIN") return;
    if (s.queue.guideOpen) return;
    if (
      s.queue.serveEntry ||
      s.queue.closeConfirmOpen ||
      s.queue.removeConfirmOpen ||
      s.enrolled.revertEntry ||
      s.enrolled.bulkConfirmOpen ||
      s.queue.stillThereOpen
    )
      return;
    if (s.queue.showValidateDialog) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(GUIDE_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    setGuideAutoChecked(true);
    if (dismissed) return;
    requestAnimationFrame(() => s.queue.setGuideOpen(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    guard.isPending,
    guard.isRedirecting,
    user?.role,
    s.queue.guideOpen,
    s.queue.serveEntry,
    s.queue.closeConfirmOpen,
    s.queue.removeConfirmOpen,
    s.enrolled.revertEntry,
    s.enrolled.bulkConfirmOpen,
    s.queue.stillThereOpen,
    s.queue.showValidateDialog,
  ]);

  function handleGuideClose(persist: boolean) {
    s.queue.setGuideOpen(false);
    if (persist) {
      try {
        localStorage.setItem(GUIDE_KEY, "1");
      } catch {
        /* storage unavailable */
      }
    }
  }

  const enrolledEntries: EnrolledEntry[] =
    (s.enrolled.enrolledQuery.data as { data?: EnrolledEntry[] } | undefined)
      ?.data ?? [];
  const enrolledTotal =
    (s.enrolled.enrolledQuery.data as { total?: number } | undefined)?.total ??
    0;

  function handleRevertOpen(entry: EnrolledEntry) {
    s.enrolled.openRevert({
      enrollmentId: entry.enrollmentId,
      studentName: entry.studentName,
      completedAt: entry.completedAt,
      servedByName: entry.servedByName,
    });
  }

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = !!(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      );
      const hasDialog = !!(
        s.queue.closeConfirmOpen ||
        s.queue.removeConfirmOpen ||
        s.enrolled.revertEntry ||
        s.enrolled.bulkConfirmOpen ||
        s.queue.showValidateDialog ||
        s.queue.stillThereOpen
      );
      const action = getInstructorShortcutAction(e.key, {
        isTyping,
        guideOpen: s.queue.guideOpen,
        hasDialog,
        activeView: s.activeView,
        canServeFirst: s.queue.canServeFirst,
        hasSpotlight: !!s.queue.spotlight,
        departments: s.queue.departments,
      });
      if (!action) return;
      e.preventDefault();
      switch (action.type) {
        case "toggleShortcuts":
          s.queue.setShortcutsOpen(!s.queue.shortcutsOpen);
          break;
        case "moveSelection":
          s.queue.moveSelection(action.delta);
          break;
        case "serveSpotlight":
          if (s.queue.spotlight) void s.queue.openServe(s.queue.spotlight);
          break;
        case "openSelected":
          s.queue.openSelected();
          break;
        case "switchDepartment":
          s.selectTab(action.departmentId);
          break;
        case "openStudentsTab":
          s.selectStudentsTab();
          break;
      }
    }
    window.addEventListener("keydown", onKeydown);
    function onOpenGuide() {
      s.queue.openGuide(1);
    }
    window.addEventListener("instructor:open-guide", onOpenGuide);
    const onActivity = () => s.queue.noteActivity();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("focus", onActivity);
    const onVisible = () => {
      if (document.visibilityState === "visible") s.queue.noteActivity();
    };
    document.addEventListener("visibilitychange", onVisible);
    const idleTimer = setInterval(() => {
      if (
        s.queue.serveEntry ||
        s.queue.closeConfirmOpen ||
        s.queue.removeConfirmOpen
      )
        return;
      const anyOpen = s.queue.departments.some((d) => d.myOpen);
      if (!anyOpen) {
        s.queue.setStillThereOpen(false);
        return;
      }
      if (Date.now() - s.queue.lastInteractionAt.current >= IDLE_PROMPT_MS)
        s.queue.setStillThereOpen(true);
    }, 30_000);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("instructor:open-guide", onOpenGuide);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    s.queue.departments,
    s.queue.serveEntry,
    s.queue.closeConfirmOpen,
    s.queue.removeConfirmOpen,
    s.enrolled.revertEntry,
    s.enrolled.bulkConfirmOpen,
    s.queue.showValidateDialog,
    s.queue.stillThereOpen,
    s.queue.guideOpen,
    s.queue.shortcutsOpen,
    s.activeView,
    s.queue.canServeFirst,
    s.queue.spotlight,
  ]);

  if (guard.isPending || !guard.user || guard.isRedirecting) {
    return <PageLoader label="Loading the instructor console" />;
  }

  const activeId = s.reportsSelected
    ? REPORTS_TAB_ID
    : s.studentsSelected
      ? "students"
      : s.activeDeptId;

  return (
    <div className="flex h-full flex-col">
      <InstructorTabBar
        departments={s.queue.departments}
        activeId={activeId}
        onselect={(id) => {
          if (id === "students") s.selectStudentsTab();
          else if (id === REPORTS_TAB_ID) s.selectReportsTab();
          else s.selectTab(id);
        }}
      />
      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-6 pb-2 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {s.reportsSelected
              ? "Reports"
              : s.studentsSelected
                ? "Students"
                : s.activeDeptId === "manage"
                  ? "Departments"
                  : (s.queue.activeDept?.name ?? "Instructor")}
          </h1>
          {s.reportsSelected ? (
            <p className="text-sm text-muted">
              PDF exports for your departments
            </p>
          ) : s.studentsSelected ? (
            <p className="text-sm text-muted">Roster across your departments</p>
          ) : s.activeDeptId !== "manage" && s.queue.activeDept ? (
            <p className="text-sm text-muted">{s.queue.activeDept.code}</p>
          ) : null}
        </div>
        <div className="relative flex items-center gap-3">
          {s.queue.hasActiveYear && s.queue.yearLabel && (
            <span className="text-sm text-muted tabular-nums">
              AY {s.queue.yearLabel}
            </span>
          )}
          <NotificationCenter items={s.notificationItems as never} />
          <button
            className="text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            data-shortcuts-trigger
            aria-label="Keyboard shortcuts"
            aria-expanded={s.queue.shortcutsOpen}
            onClick={() => s.queue.setShortcutsOpen(!s.queue.shortcutsOpen)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
          <button
            className="text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            data-guide-trigger
            aria-label="Show guide"
            aria-expanded={s.queue.guideOpen}
            onClick={() => s.queue.openGuide(1)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          </button>
          <ShortcutsPopover
            open={s.queue.shortcutsOpen}
            onclose={() => s.queue.setShortcutsOpen(false)}
            id="instructor-shortcuts-popover"
            shortcuts={SHORTCUTS}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 overflow-y-auto px-6 pb-8">
        <CalendarBanner />
        {s.transferNotices.length > 0 && (
          <div className="mb-4 space-y-2">
            {s.transferNotices.map(
              (notice: { id: string; title: string; body: string }) => (
                <div
                  key={notice.id}
                  role="status"
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised px-4 py-3"
                >
                  <p className="text-sm text-ink">
                    {notice.title}{" "}
                    <span className="text-muted">{notice.body}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void s.dismissTransferNotices()}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
                  >
                    Dismiss
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        {s.queue.autoClosedDepts.length > 0 && (
          <div className="mb-4 space-y-2">
            {s.queue.autoClosedDepts.map((dept) => (
              <div
                key={dept.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised px-4 py-3"
              >
                <p className="text-sm text-ink">
                  Queue was auto-closed while you were away — {dept.name}.{" "}
                  <span className="text-muted">
                    Students queued stay in line until you reopen.
                  </span>
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => s.queue.dismissAutoClose(dept.id)}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => s.queue.reopenQueue(dept)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
                  >
                    Reopen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {s.reportsSelected ? (
          !s.queue.hasActiveYear ? (
            <EmptyState
              icon="user"
              title="No active academic year — contact your admin."
            />
          ) : (
            <div className="space-y-4">
              <InstructorReportsTab
                hasActiveYear={s.queue.hasActiveYear}
                yearLabel={s.queue.yearBare}
                semesterLabel={s.queue.semesterLabel}
              />
            </div>
          )
        ) : s.studentsSelected ? (
          <div className="space-y-4">
            <StudentsTab
              ontoast={s.toast}
              onopenqueue={(departmentId) => s.selectTab(departmentId)}
            />
          </div>
        ) : s.activeDeptId === "manage" ? (
          <DepartmentManager ontoast={s.toast} />
        ) : !s.queue.hasActiveYear ? (
          <EmptyState
            icon="user"
            title="No active academic year — contact your admin."
          />
        ) : !s.queue.activeDept ? (
          <EmptyState icon="user" title="Select a department." />
        ) : (
          <div className="space-y-4">
            <DeptTabHeader
              department={s.queue.activeDept}
              busy={s.queue.availabilityMutation.isPending}
              refreshing={s.queue.manualRefreshing}
              hasActiveYear={s.queue.hasActiveYear}
              onrefresh={s.queue.refreshQueues}
              onavailabilitychange={s.queue.handleAvailabilityChange}
            />
            <div
              className="flex items-center gap-1 rounded-xl border border-border bg-surface p-0.5 w-fit"
              role="tablist"
              aria-label="Department view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={s.activeView === "queue"}
                onClick={() => s.selectView("queue")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors ${s.activeView === "queue" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                Queue
                {s.queue.activeDept.waitingCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white tabular-nums">
                    {s.queue.activeDept.waitingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={s.activeView === "enrolled"}
                onClick={() => s.selectView("enrolled")}
                className={`rounded-lg px-3 py-1 text-sm transition-colors ${s.activeView === "enrolled" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                Enrolled
              </button>
            </div>
            {s.activeView === "queue" ? (
              s.queue.activeDept.entries.length === 0 &&
              !s.queue.servingEntry ? (
                <EmptyState
                  icon="inbox"
                  title={
                    s.queue.activeDept.isOpen
                      ? "No students waiting"
                      : "Queue closed — no students waiting."
                  }
                  hint={
                    s.queue.activeDept.isOpen
                      ? "Flip the switch off when you're done for the day."
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                  <div className="w-full lg:w-2/5">
                    <ServingPanel
                      entry={s.queue.servingEntry}
                      myAdviserId={myAdviserId}
                      busy={
                        s.enrolled.enrollMutation.isPending ||
                        s.queue.servingBusy
                      }
                      onvalidate={() => s.queue.openValidateDialog()}
                      onreturntoqueue={() => void s.queue.returnToQueue()}
                      onmovetoend={() => void s.queue.moveServingToEnd()}
                    />
                  </div>
                  <div className="w-full lg:w-3/5">
                    <QueueListPanel
                      key={s.queue.activeDept.id}
                      entries={s.queue.activeDept.entries}
                      selectedId={s.queue.selectedId}
                      serveId={
                        s.queue.canServeFirst
                          ? (s.queue.spotlight?.entryId ?? null)
                          : null
                      }
                      busy={s.queue.beginServingMutation?.isPending ?? false}
                      deptOpen={s.queue.activeDept.myOpen}
                      removingId={s.queue.removingId}
                      onserve={(entry) => void s.queue.openServe(entry)}
                      onremove={(entry) => s.queue.requestRemove(entry)}
                    />
                  </div>
                </div>
              )
            ) : (
              <EnrolledTab
                entries={enrolledEntries}
                total={enrolledTotal}
                loading={s.enrolled.enrolledQuery.isFetching}
                range={s.enrolledRange}
                q={s.enrolledQ}
                hasNextPage={s.enrolled.hasMore}
                selectedIds={s.enrolled.selectedIds}
                onrangechange={s.setEnrolledRange}
                onqchange={s.setEnrolledQ}
                onloadmore={s.enrolled.loadMore}
                onrevert={handleRevertOpen}
                onselect={(id) => s.enrolled.toggleSelect(id)}
                onselectall={(checked) =>
                  s.enrolled.toggleSelectAll(
                    checked,
                    enrolledEntries.map((e) => e.enrollmentId),
                  )
                }
                onclearselection={() => s.enrolled.clearSelection()}
                onbulkrevert={() => s.enrolled.openBulkRevert()}
              />
            )}
          </div>
        )}
      </main>

      <InstructorDialogs
        s={s}
        incomingTransferRequest={incomingTransferRequest}
        onGuideClose={handleGuideClose}
      />
    </div>
  );
}
