import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "$lib/auth-client";
import { loginRouteForSessionLoss } from "$lib/auth/session-guard";
import { homeRouteForRole } from "$lib/auth/redirect";
import { canUseStudentSurface } from "$lib/domain/roles";
import { api } from "$lib/api";
import { LAUNCH_STALE_MS, visibleQueuePosition } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import { connectLiveUpdates } from "$lib/live-updates";
import {
  refreshStudentQueries,
  STUDENT_BACKSTOP_POLL_MS,
} from "$lib/student/live-refresh";
import { notify } from "$lib/notifications";
import { shouldGateOnboarding } from "$lib/student/onboarding-gate";
import {
  resolveShareLanding,
  SHARE_ERROR_MESSAGES,
} from "$lib/student/queue-share";

function successDismissed(yearId: string | null | undefined): boolean {
  if (!yearId) return false;
  try {
    return localStorage.getItem(`erpsys-enrollment-success-${yearId}`) === "1";
  } catch {
    return false;
  }
}

export function useQueueModel() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const sessionQuery = authClient.useSession();
  const role =
    (sessionQuery.data?.user as { role?: string } | undefined)?.role ?? "";

  useEffect(() => {
    if (sessionQuery.isPending) return;
    if (!sessionQuery.data) {
      navigate(loginRouteForSessionLoss(), { replace: true });
      return;
    }
    if (!canUseStudentSurface(role))
      navigate(homeRouteForRole(role), { replace: true });
  }, [sessionQuery.isPending, sessionQuery.data, role, navigate]);

  const sessionReady = !sessionQuery.isPending && Boolean(sessionQuery.data);

  useEffect(
    () => connectLiveUpdates((event) => refreshStudentQueries(event.topic)),
    [],
  );

  const stepsQuery = useQuery(
    api.student.getMySteps.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      // No session, no request: without this the sign-out race fires
      // /api/v1/me/* against the cleared cookie and each lands a 401.
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );
  const queueQuery = useQuery(
    api.student.getMyQueueStatus.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );
  const myDeptQuery = useQuery(
    api.student.getMyDepartmentQueue.queryOptions({
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );

  const data = stepsQuery.data as any;
  const queue = queueQuery.data as any;
  // A cached queue position is the one silent-staleness value that can mislead.
  // Beyond two minutes the card keeps its state but drops the number.
  const positionShown = visibleQueuePosition(
    queue?.position,
    queueQuery.dataUpdatedAt,
  );
  const positionFresh = positionShown != null;
  const myDept = (myDeptQuery.data ?? null) as any;
  const readyForQueue = Boolean(data?.readyForQueue);
  const step6 =
    ((data?.steps ?? []) as any[]).find((s) => s.code === "ENROLLMENT") ?? null;
  const enrolled = Boolean(
    step6?.status === "VERIFIED" || queue?.status === "COMPLETED",
  );

  const needsRecord =
    Boolean(data?.hasActiveYear) && myDeptQuery.isSuccess && myDept === null;
  const closed = Boolean(myDept && !myDept.isOpen);
  const unserved = Boolean(myDept && myDept.isOpen && !myDept.servesMyLevel);
  const canJoin =
    Boolean(myDept && myDept.isOpen && myDept.servesMyLevel) &&
    readyForQueue &&
    !queue;

  const joinMutation = useMutation(api.student.joinQueue.mutationOptions());
  const leaveMutation = useMutation(api.student.leaveQueue.mutationOptions());
  const [joinError, setJoinError] = useState<string | null>(null);

  const shareToken = params.get("s");
  const hasShareToken = Boolean(shareToken);
  const shareQuery = useQuery(
    api.student.resolveQueueShareLink.queryOptions({
      input: { token: shareToken ?? "" },
      enabled: hasShareToken && Boolean(sessionQuery.data),
      staleTime: 60_000,
      retry: false,
    }),
  );

  const [gateDismissed, setGateDismissed] = useState(false);
  const gateShowing = shouldGateOnboarding({
    data,
    role,
    dismissed: gateDismissed,
  });

  const shareLanding = useMemo(
    () =>
      resolveShareLanding({
        hasToken: hasShareToken,
        resolving: hasShareToken && shareQuery.isPending,
        resolveFailed: hasShareToken && shareQuery.isError,
        resolved: (shareQuery.data ?? null) as any,
        hasActiveYear: data?.hasActiveYear ?? false,
        enrolled,
        readyForQueue,
        queue: queue
          ? {
              departmentName: queue.departmentName,
              departmentId: queue.departmentId,
              position: queue.position,
            }
          : null,
        gateShowing,
      }),
    [
      hasShareToken,
      shareQuery.isPending,
      shareQuery.isError,
      shareQuery.data,
      data?.hasActiveYear,
      enrolled,
      readyForQueue,
      queue,
      gateShowing,
    ],
  );

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const stripShareToken = () =>
    setParams(
      (prev) => {
        prev.delete("s");
        return prev;
      },
      { replace: true },
    );

  // Share side-effects: open the modal once per token, toast errors/skips once.
  const seenShare = useRef(new Set<string>());
  useEffect(() => {
    if (!shareToken || seenShare.current.has(`modal:${shareToken}`)) return;
    if (shareLanding.kind === "show") {
      seenShare.current.add(`modal:${shareToken}`);
      setShareModalOpen(true);
    }
  }, [shareLanding, shareToken]);
  useEffect(() => {
    if (!shareToken || shareLanding.kind !== "error") return;
    if (seenShare.current.has(`err:${shareToken}`)) return;
    seenShare.current.add(`err:${shareToken}`);
    notify.error(SHARE_ERROR_MESSAGES[shareLanding.reason]);
  }, [shareLanding, shareToken]);
  useEffect(() => {
    if (
      !shareToken ||
      shareLanding.kind !== "skip" ||
      shareLanding.reason !== "enrolled"
    )
      return;
    if (seenShare.current.has(`done:${shareToken}`)) return;
    seenShare.current.add(`done:${shareToken}`);
    notify.info("You're already enrolled — nothing to join.");
  }, [shareLanding, shareToken]);

  const shareNotice =
    shareLanding.kind === "skip" && hasShareToken
      ? (() => {
          const dept = (shareQuery.data as any)?.departmentName;
          if (shareLanding.reason === "already-in-queue" && dept)
            return `This link points to ${dept}, where you're already waiting.`;
          if (shareLanding.reason === "prereqs" && dept)
            return `Finish the steps above before joining the ${dept} queue.`;
          if (shareLanding.reason === "enrolled" && dept)
            return `This link points to ${dept} — you're already enrolled.`;
          return null;
        })()
      : null;

  const shareMatchesRecord =
    shareLanding.kind === "show" && myDept !== null
      ? shareLanding.data.departmentId === myDept.departmentId
      : false;

  function dismissShareModal() {
    setShareModalOpen(false);
    stripShareToken();
  }

  async function joinDepartment(departmentId: string) {
    setJoinError(null);
    try {
      await joinMutation.mutateAsync({ departmentId } as any);
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("You joined the queue.");
    } catch (e) {
      const message =
        (e as { message?: string }).message ?? "Could not join the queue.";
      setJoinError(message);
      notify.error(message);
    }
  }

  async function joinFromShareModal() {
    if (shareLanding.kind !== "show" || !myDept) return;
    setShareModalOpen(false);
    stripShareToken();
    await joinDepartment(myDept.departmentId);
  }

  const [facultyConfirmOpen, setFacultyConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  async function confirmLeave() {
    setLeaveConfirmOpen(false);
    try {
      await leaveMutation.mutateAsync({} as any);
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("You left the queue.");
    } catch (e) {
      notify(
        (e as { message?: string }).message ?? "Could not leave the queue.",
        "error",
      );
    }
  }

  const missing = ((data?.steps ?? []) as any[])
    .filter((s) => s.code !== "ENROLLMENT" && s.status !== "VERIFIED")
    .map((s) => `${s.order} ${s.name}`);

  const isQueued = Boolean(
    queue && (queue.status === "WAITING" || queue.status === "IN_PROGRESS"),
  );

  const [realtimeHintOpen, setRealtimeHintOpen] = useState(false);
  const realtimeChecked = useRef(false);
  useEffect(() => {
    if (!queue) {
      setRealtimeHintOpen(false);
      realtimeChecked.current = false;
      return;
    }
    if (realtimeChecked.current) return;
    if (queue.status !== "WAITING" && queue.status !== "IN_PROGRESS") return;
    realtimeChecked.current = true;
    try {
      const nav = (
        performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined
      )?.type;
      const legacy =
        (performance as unknown as { navigation?: { type: number } }).navigation
          ?.type === 1;
      if (nav === "reload" || legacy) setRealtimeHintOpen(true);
    } catch {
      /* ignore */
    }
  }, [queue]);
  useEffect(() => {
    if (!realtimeHintOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRealtimeHintOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [realtimeHintOpen]);

  // Queue transition toasts (turn served / pushed back / removed).
  const prev = useRef<{
    status: string | null;
    position: number | null;
    removalNotified: boolean;
  }>({
    status: null,
    position: null,
    removalNotified: false,
  });
  useEffect(() => {
    const p = prev.current;
    if (!queue) {
      if (
        (p.status === "WAITING" || p.status === "IN_PROGRESS") &&
        !p.removalNotified
      ) {
        notify.error(
          "Queue closed — you were removed from the line. Rejoin when it reopens.",
        );
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        p.removalNotified = true;
      }
      p.status = null;
      p.position = null;
      return;
    }
    p.removalNotified = false;
    if (
      p.status &&
      p.status !== queue.status &&
      p.status === "WAITING" &&
      queue.status === "IN_PROGRESS"
    ) {
      notify.success("It's your turn — the adviser is serving you now.");
      try {
        navigator.vibrate?.([100, 50, 100]);
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (
      p.position !== null &&
      queue.position != null &&
      queue.position > p.position &&
      queue.status === "WAITING"
    ) {
      notify.warning(`Moved to end — new position #${queue.position}.`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    p.status = queue.status;
    p.position = queue.position ?? null;
  }, [queue, queryClient]);

  // Enrollment-success modal, once per academic year until dismissed.
  const [successOpen, setSuccessOpen] = useState(false);
  const successSeen = useRef(false);
  useEffect(() => {
    if (
      !enrolled ||
      successSeen.current ||
      successDismissed(data?.academicYearId)
    )
      return;
    successSeen.current = true;
    setSuccessOpen(true);
  }, [enrolled, queue, data?.academicYearId]);
  function handleSuccessDone() {
    try {
      if (data?.academicYearId)
        localStorage.setItem(
          `erpsys-enrollment-success-${data.academicYearId}`,
          "1",
        );
    } catch {
      /* ignore storage errors */
    }
    setSuccessOpen(false);
  }

  function goStudent() {
    navigate("/student");
  }

  return {
    sessionReady: !sessionQuery.isPending && Boolean(sessionQuery.data),
    stepsPending: stepsQuery.isPending,
    data,
    queue,
    positionShown,
    positionFresh,
    myDept,
    myDeptPending: myDeptQuery.isPending && !myDeptQuery.data,
    myDeptError: myDeptQuery.isError && !myDeptQuery.data,
    step6,
    enrolled,
    readyForQueue,
    needsRecord,
    closed,
    unserved,
    canJoin,
    isQueued,
    missing,
    joinBusy: joinMutation.isPending,
    leaveBusy: leaveMutation.isPending,
    joinError,
    shareLanding,
    shareModalOpen,
    shareNotice,
    shareMatchesRecord,
    facultyConfirmOpen,
    leaveConfirmOpen,
    gateShowing,
    successOpen,
    realtimeHintOpen,
    goStudent,
    openFacultyConfirm: () => {
      if (canJoin) setFacultyConfirmOpen(true);
    },
    confirmFacultyJoin: () => {
      setFacultyConfirmOpen(false);
      if (myDept) void joinDepartment(myDept.departmentId);
    },
    closeFacultyConfirm: () => setFacultyConfirmOpen(false),
    setLeaveConfirmOpen,
    dismissGate: () => setGateDismissed(true),
    dismissShareModal,
    joinFromShareModal: () => void joinFromShareModal(),
    confirmLeave: () => void confirmLeave(),
    handleSuccessDone,
    setRealtimeHintOpen,
  };
}

export type QueueModel = ReturnType<typeof useQueueModel>;
