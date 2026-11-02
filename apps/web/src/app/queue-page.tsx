import ConfirmDialog from "../components/ConfirmDialog";
import Skeleton from "../components/ui/Skeleton";
import PageLoader from "../components/ui/PageLoader";
import {
  FacultyConfirmDialog,
  QueueShareModal,
  QueueStatusCard,
} from "./queue-cards";
import { JoinCard } from "./queue-join-card";
import EnrollmentSuccess from "../components/student/EnrollmentSuccess";
import StampDisplay from "../components/student/StampDisplay";
import StudentGate from "../components/student/StudentGate";
import { scheduleLine } from "$lib/student/schedule";
import { useQueueModel } from "./queue-model";

export function QueuePage() {
  const m = useQueueModel();

  if (!m.sessionReady) {
    return <PageLoader label="Loading the enrollment queue" />;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[560px] flex-col">
      <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <div className="group relative flex h-10 w-10 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              if (m.isQueued) return;
              m.goStudent();
            }}
            disabled={m.isQueued}
            aria-disabled={m.isQueued}
            aria-label="Back to progress"
            title={
              m.isQueued
                ? "Leave queue first — use 'Leave the queue' below"
                : "Back to progress"
            }
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] ${
              m.isQueued
                ? "cursor-not-allowed text-muted/40 opacity-50"
                : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {m.isQueued ? (
            <span
              className="pointer-events-none absolute left-12 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink/80 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
              role="tooltip"
            >
              Leave queue first
            </span>
          ) : null}
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          Enrollment Queue
        </h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-1">
        {m.stepsPending && !m.data ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <div className="flex items-center gap-3">
                <Skeleton h="2.75rem" w="2.75rem" radius="999px" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton h="0.9375rem" w="55%" radius="0.25rem" />
                  <Skeleton h="0.75rem" w="35%" radius="0.25rem" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={i}
                  >
                    <Skeleton
                      h="0.75rem"
                      w="35%"
                      radius="0.25rem"
                      index={i + 2}
                    />
                    <Skeleton
                      h="0.75rem"
                      w="5rem"
                      radius="0.25rem"
                      index={i + 2}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : m.data ? (
          !m.data.hasActiveYear ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <p className="text-sm text-ink">
                No active academic year yet — the office will activate
                enrollment soon.
              </p>
            </div>
          ) : m.enrolled ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <p className="text-[15px] font-semibold text-ink">
                  Enrolled — you&apos;re done
                </p>
                {m.queue?.departmentName ? (
                  <p className="text-sm text-muted">{m.queue.departmentName}</p>
                ) : null}
              </div>
              {m.step6?.stamp ? (
                <StampDisplay
                  stampName={
                    m.step6.stamp.stampName ?? m.step6.stamp.verifiedByName
                  }
                  stampGraphicUrl={m.step6.stamp.stampGraphicUrl}
                  stampSignatureUrl={m.step6.stamp.stampSignatureUrl}
                  verifiedAt={m.step6.stamp.verifiedAt}
                  verifiedByName={m.step6.stamp.verifiedByName}
                  verb="Enrolled by"
                />
              ) : null}
              {m.shareNotice ? (
                <p className="px-1 text-center text-sm text-muted">
                  {m.shareNotice}
                </p>
              ) : null}
            </div>
          ) : m.queue ? (
            <div className="flex flex-col gap-4">
              <QueueStatusCard
                position={m.positionShown}
                departmentName={m.queue.departmentName}
                status={m.queue.status}
                deptOpen={m.queue.deptOpen}
                servesMyLevel={m.queue.servesMyLevel}
                adviserName={m.queue.servedByName}
                busy={m.leaveBusy}
                scheduleText={m.myDept ? scheduleLine(m.myDept.schedule) : null}
                onleave={() => m.setLeaveConfirmOpen(true)}
              />
              {m.shareNotice ? (
                <p className="px-1 text-sm text-muted">{m.shareNotice}</p>
              ) : null}
            </div>
          ) : !m.readyForQueue ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-ink">
                You must complete first:
              </p>
              <ul className="mt-2 space-y-1.5">
                {m.missing.map((missing) => (
                  <li
                    className="flex items-start gap-2 text-sm text-muted"
                    key={missing}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                    ></span>
                    {missing}
                  </li>
                ))}
              </ul>
              {m.shareNotice ? (
                <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted">
                  {m.shareNotice}
                </p>
              ) : null}
            </div>
          ) : (
            <JoinCard
              myDept={m.myDept}
              myDeptPending={m.myDeptPending}
              myDeptError={m.myDeptError}
              needsRecord={m.needsRecord}
              closed={m.closed}
              unserved={m.unserved}
              readyForQueue={m.readyForQueue}
              missing={m.missing}
              canJoin={m.canJoin}
              joining={m.joinBusy}
              joinError={m.joinError}
              shareNotice={m.shareNotice}
              onJoin={m.openFacultyConfirm}
              onGotoStudent={m.goStudent}
            />
          )
        ) : null}
      </main>

      {m.successOpen && m.queue?.departmentName ? (
        <EnrollmentSuccess
          departmentName={m.queue.departmentName}
          semesterLabel={m.data?.semesterLabel ?? ""}
          academicYearLabel={m.data?.academicYearLabel ?? ""}
          ondone={m.handleSuccessDone}
        />
      ) : null}

      <FacultyConfirmDialog
        open={m.facultyConfirmOpen}
        busy={m.joinBusy}
        onconfirm={m.confirmFacultyJoin}
        onclose={m.closeFacultyConfirm}
      />

      {m.shareModalOpen &&
      m.shareLanding.kind === "show" &&
      !m.shareMatchesRecord ? (
        <div className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-mismatch-title"
            className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
          >
            <h2
              id="share-mismatch-title"
              className="text-base font-semibold text-ink"
            >
              That link points to a different course
            </h2>
            <p className="mt-1 text-sm text-muted">
              Your enrollment record says {m.myDept?.departmentName}, so
              there&apos;s no {m.shareLanding.data.departmentName} queue to join
              from here. Change your course on your profile first.
            </p>
            <button
              type="button"
              onClick={() => {
                m.dismissShareModal();
                m.goStudent();
              }}
              className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white"
            >
              Go to my profile
            </button>
          </div>
        </div>
      ) : m.shareModalOpen && m.shareLanding.kind === "show" ? (
        <QueueShareModal
          open={m.shareModalOpen}
          landing={m.shareLanding}
          busy={m.joinBusy || m.leaveBusy}
          onjoin={m.joinFromShareModal}
          onclose={m.dismissShareModal}
        />
      ) : null}

      <ConfirmDialog
        open={m.leaveConfirmOpen}
        title={`Leave ${m.queue?.departmentName ?? "the queue"}?`}
        body={
          m.positionShown != null
            ? `You are #${m.positionShown} — you'll lose your spot.`
            : undefined
        }
        confirmLabel="Leave"
        warning
        busy={m.leaveBusy}
        onconfirm={m.confirmLeave}
        onclose={() => m.setLeaveConfirmOpen(false)}
      />

      {m.data ? (
        <StudentGate
          show={m.gateShowing}
          data={m.data}
          onclose={m.dismissGate}
        />
      ) : null}

      {m.realtimeHintOpen ? (
        <div
          className="modal-scrim fixed inset-0 z-[65] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.08)" }}
          onClick={() => m.setRealtimeHintOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="realtime-hint-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="realtime-hint-title"
              className="text-sm font-semibold text-ink"
            >
              No need to refresh
            </p>
            <p className="mt-1 text-sm text-muted">
              Your queue position updates automatically every ~20 seconds. Stay
              on this page.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white"
              onClick={() => m.setRealtimeHintOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
