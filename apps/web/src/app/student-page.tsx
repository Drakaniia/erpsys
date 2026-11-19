import { useState } from "react";
import { useNavigate } from "react-router";
import { useSessionGuard } from "$lib/auth/session-guard";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { parseStudentTab } from "$lib/student/tabs";
import { STEP_ORDER } from "$lib/student/steps";
import type { StepCode } from "$lib/student/types";
import { useStudentState, EVIDENCE_CONFIG } from "$lib/student/state";
import { shouldGateOnboarding } from "$lib/student/onboarding-gate";
import AllSetBanner from "../components/student/AllSetBanner";
import AssessmentSheet from "../components/student/AssessmentSheet";
import ChatTab from "../components/student/ChatTab";
import EnrollmentSuccess from "../components/student/EnrollmentSuccess";
import EvidenceSheet from "../components/student/EvidenceSheet";
import NotificationCenter from "../components/ui/NotificationCenter";
import PageLoader from "../components/ui/PageLoader";
import Skeleton from "../components/ui/Skeleton";
import OutsideOrgBanner from "../components/student/OutsideOrgBanner";
import ProfileTab from "../components/student/ProfileTab";
import ProfilingSheet from "../components/student/ProfilingSheet";
import ProgressHeader from "../components/student/ProgressHeader";
import QueueChip from "../components/student/QueueChip";
import StepChecklist from "../components/student/StepChecklist";
import StepSheet from "../components/student/StepSheet";
import StudentGate from "../components/student/StudentGate";
import StudentNumberPrompt from "../components/student/StudentNumberPrompt";
import StudentTabBar from "../components/student/StudentTabBar";
import StudentYearLevel from "../components/student/StudentYearLevel";

export function StudentPage() {
  const navigate = useNavigate();
  const guard = useSessionGuard("student");
  const user = guard.user;
  const email = user?.email ?? "";
  const userName = user?.name ?? "";
  const userRole = user?.role ?? "";
  const isOutsideOrg = user?.isOutsideOrg ?? false;

  const s = useStudentState(email);
  const { flags } = useIntegrations();
  // A bookmarked `?tab=chat` lands on progress when Workers AI is off.
  const activeTab = parseStudentTab(s.activeTab, flags.cloudflareChat);
  const [gateDismissed, setGateDismissed] = useState(false);
  const gateShowing = shouldGateOnboarding({
    data: s.data,
    role: userRole,
    dismissed: gateDismissed,
  });

  if (guard.isPending || !user || guard.isRedirecting) {
    return <PageLoader label="Loading your enrollment" />;
  }

  const title =
    activeTab === "progress"
      ? "Your Progress"
      : activeTab === "chat"
        ? "Enrollment Chat"
        : "Your Profile";

  return (
    <div className="mx-auto flex h-full w-full max-w-[560px] flex-col lg:max-w-[1200px]">
      <h1 className="sr-only">{title} — ERPSYS</h1>
      {isOutsideOrg ? <OutsideOrgBanner /> : null}

      {activeTab === "progress" ? (
        <div className="lg:hidden">
          <ProgressHeader
            verifiedCount={s.verifiedCount}
            studentName={userName}
            studentNumber={s.data?.profile.studentNumber ?? null}
            actions={
              <NotificationCenter
                items={s.notificationsQuery.data?.data ?? []}
                onview={s.viewNotification}
              />
            }
          />
        </div>
      ) : null}

      <div className="lg:flex lg:items-center lg:justify-between lg:gap-4 lg:px-6 lg:pb-2 lg:pt-5">
        <StudentTabBar active={activeTab} onselect={s.selectTab} />
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <div className="flex max-w-[240px] flex-col items-end leading-tight">
            <p className="truncate text-[15px] font-semibold text-ink">
              {userName}
            </p>
            {s.data?.profile.studentNumber ? (
              <p className="truncate text-xs tabular-nums text-muted">
                #{s.data.profile.studentNumber}
              </p>
            ) : null}
          </div>
          <span
            className="rounded-full bg-primary px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-white"
            style={{ transform: `scale(${s.pillScale})` }}
          >
            {s.verifiedCount}/{STEP_ORDER.length}
          </span>
          {s.queue &&
          (s.queue.status === "WAITING" || s.queue.status === "IN_PROGRESS") ? (
            <QueueChip
              position={s.queuePosition}
              onclick={() => navigate("/queue")}
            />
          ) : null}
          <NotificationCenter
            items={s.notificationsQuery.data?.data ?? []}
            onview={s.viewNotification}
          />
        </div>
      </div>

      <div className="hidden h-0.5 w-full overflow-hidden rounded-full bg-ink/10 lg:block">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${s.progressPercent}%` }}
        />
      </div>

      {activeTab === "progress" ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3 lg:overflow-hidden lg:px-6 lg:pb-6 lg:pt-4">
          <div className="mx-auto max-w-[560px] lg:flex lg:h-full lg:max-w-none lg:gap-6">
            <div
              className={`lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 ${
                s.openStepRow
                  ? "lg:w-[400px] lg:shrink-0"
                  : "lg:mx-auto lg:w-full lg:max-w-[640px]"
              }`}
            >
              {s.stepsQuery.isPending && !s.data ? (
                <div
                  className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-raised"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ "--skeleton-i": i } as React.CSSProperties}
                    >
                      <Skeleton h="0.9375rem" w="1.75rem" radius="0.25rem" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton h="0.9375rem" w="45%" radius="0.25rem" />
                        <Skeleton h="0.75rem" w="28%" radius="0.25rem" />
                      </div>
                      <Skeleton h="1.25rem" w="4rem" radius="999px" />
                    </div>
                  ))}
                </div>
              ) : s.stepsQuery.isError && !s.data ? (
                <div className="rounded-2xl border border-border bg-surface-raised p-4 text-center">
                  <p className="text-sm text-muted">
                    Couldn&apos;t load your progress.
                  </p>
                  <button
                    type="button"
                    onClick={() => s.stepsQuery.refetch()}
                    className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : s.data ? (
                <>
                  {s.showNoYear ? (
                    <div className="mb-3 rounded-2xl border border-border bg-surface-raised p-4">
                      <p className="text-sm text-ink">
                        No active academic year yet — the office will activate
                        enrollment soon.
                      </p>
                    </div>
                  ) : null}
                  {s.rolloverNotice && !s.showNoYear ? (
                    <div className="mb-3 rounded-2xl border border-warning/25 bg-warning/10 p-4">
                      <p className="text-sm text-ink">
                        New academic year — steps reset. Previous year&apos;s
                        stamps remain in your records.
                      </p>
                    </div>
                  ) : null}
                  {s.showPrompt && !s.showOnboarding ? (
                    <div className="mb-3">
                      <StudentNumberPrompt
                        saving={s.saveNumberMutation.isPending}
                        error={s.numberError}
                        onsave={s.handleSaveNumber}
                        ondismiss={() => s.setNumberError(null)}
                      />
                    </div>
                  ) : null}
                  {s.data ? <StudentYearLevel data={s.data} /> : null}
                  {!s.showNoYear && (s.allComplete || s.readyForQueue) ? (
                    <div className="mb-3">
                      <AllSetBanner
                        variant={s.allComplete ? "done" : "ready"}
                        onjoin={() => navigate("/queue")}
                      />
                    </div>
                  ) : null}
                  <StepChecklist
                    data={s.data}
                    readyForQueue={s.readyForQueue}
                    queue={s.queue ?? null}
                    onopen={(code) => {
                      if (code === "ENROLLMENT") {
                        navigate("/queue");
                        return;
                      }
                      s.openStep(code as StepCode);
                    }}
                  />
                </>
              ) : null}
            </div>

            {s.openStepRow ? (
              <div className="h-0 lg:h-auto lg:min-h-0 lg:flex-1">
                <StepSheet
                  open={Boolean(s.openCode)}
                  label={`${s.openStepRow.order} · ${s.openStepRow.name}`}
                  chipLabel={s.sheetChip.label}
                  chipClasses={s.sheetChip.classes}
                  onclose={s.closeSheet}
                >
                  {s.openCode === "ASSESSMENT" ? (
                    <AssessmentSheet step={s.openStepRow} notify={s.toast} />
                  ) : s.openCode === "PROFILING" ? (
                    <ProfilingSheet
                      step={s.openStepRow}
                      notify={s.toast}
                    />
                  ) : s.openCode && s.data ? (
                    <EvidenceSheet
                      step={s.openStepRow}
                      slotLabel={EVIDENCE_CONFIG[s.openCode]?.label ?? "Upload"}
                      slotHint={EVIDENCE_CONFIG[s.openCode]?.hint}
                      bodyNote={EVIDENCE_CONFIG[s.openCode]?.note}
                      multiple={EVIDENCE_CONFIG[s.openCode]?.multiple ?? false}
                      notify={s.toast}
                    />
                  ) : null}
                </StepSheet>
              </div>
            ) : null}
          </div>
        </main>
      ) : activeTab === "profile" ? (
        s.data ? (
          <ProfileTab data={s.data} studentName={userName} email={email} />
        ) : s.stepsQuery.isError ? (
          <div className="mx-auto w-full max-w-[560px] px-4 pt-3 lg:max-w-[720px]">
            <div className="rounded-2xl border border-border bg-surface-raised p-4 text-center">
              <p className="text-sm text-muted">
                Couldn&apos;t load your profile.
              </p>
              <button
                type="button"
                onClick={() => s.stepsQuery.refetch()}
                className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3 lg:overflow-hidden lg:px-6 lg:pb-6 lg:pt-4">
            <div className="mx-auto max-w-[560px] space-y-4 lg:max-w-[720px]">
              <section
                className="rounded-2xl border border-border bg-surface-raised p-4"
                aria-hidden="true"
              >
                <Skeleton h="0.875rem" w="6rem" radius="0.25rem" />
                <div className="mt-4 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-4"
                      style={{ "--skeleton-i": i + 1 } as React.CSSProperties}
                    >
                      <Skeleton h="0.875rem" w="7rem" radius="0.25rem" />
                      <Skeleton h="0.875rem" w="9rem" radius="0.25rem" />
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-3" aria-hidden="true">
                <Skeleton h="0.875rem" w="9rem" radius="0.25rem" index={4} />
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-surface-raised p-4"
                    style={{ "--skeleton-i": i + 5 } as React.CSSProperties}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton h="0.875rem" w="7rem" radius="0.25rem" />
                      <Skeleton h="0.75rem" w="5rem" radius="999px" />
                    </div>
                    <div className="mt-3 space-y-2">
                      <Skeleton h="0.75rem" w="85%" radius="0.25rem" />
                      <Skeleton h="0.75rem" w="60%" radius="0.25rem" />
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )
      ) : (
        <main className="min-h-0 flex-1 lg:overflow-hidden lg:pb-0">
          <ChatTab onback={() => s.selectTab("progress")} />
        </main>
      )}

      {s.successOpen && s.queue?.departmentName ? (
        <EnrollmentSuccess
          departmentName={s.queue.departmentName}
          semesterLabel={
            (s.data as { semesterLabel?: string } | null)?.semesterLabel ?? ""
          }
          academicYearLabel={
            (s.data as { academicYearLabel?: string } | null)
              ?.academicYearLabel ?? ""
          }
          ondone={() => s.setSuccessOpen(false)}
        />
      ) : null}

      {s.data && userRole === "STUDENT" ? (
        <StudentGate
          data={s.data}
          show={gateShowing}
          onclose={() => setGateDismissed(true)}
        />
      ) : null}
    </div>
  );
}
