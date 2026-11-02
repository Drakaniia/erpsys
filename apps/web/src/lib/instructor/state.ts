import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { notify } from "$lib/notifications";
import { api } from "$lib/api";
import { LAUNCH_STALE_MS } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import { connectLiveUpdates } from "$lib/live-updates";
import { useQueueState, IDLE_PROMPT_MS } from "$lib/instructor/queue";
import { useEnrolledState, type EnrolledRange } from "$lib/instructor/enrolled";
import { studentsTabSelected } from "$lib/instructor/students";
import { REPORTS_TAB_ID, reportsTabSelected } from "$lib/instructor/reports";

export {
  AUTO_CLOSE_NOTICE_WINDOW_MS,
  HEARTBEAT_THROTTLE_MS,
  IDLE_PROMPT_MS,
} from "$lib/instructor/queue";

export type ViewSegment = "queue" | "enrolled";
export type { EnrolledRange };

/** React port of `createInstructorState` — the instructor console's whole slice. */
export function useInstructorState() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  function toast(
    message: string,
    kind: "success" | "error" | "warning" = "success",
  ) {
    notify(message, kind);
  }

  const [activeDeptId, setActiveDeptId] = useState("manage");
  const queue = useQueueState(() => activeDeptId, toast);

  // Wait for the first load: an empty list while loading must not wipe ?dept=.
  const queuesLoaded = queue.queueQuery.isSuccess;

  useEffect(() => {
    if (!queuesLoaded) return;
    const raw = params.get("dept");
    const depts = queue.departments;
    if (raw === "manage") {
      if (activeDeptId !== "manage") setActiveDeptId("manage");
      return;
    }
    if (raw && depts.some((d) => d.id === raw)) {
      if (activeDeptId !== raw) setActiveDeptId(raw);
      return;
    }
    // missing or invalid param → first department (or "manage")
    const fallback = depts[0]?.id ?? "manage";
    if (activeDeptId !== fallback) setActiveDeptId(fallback);
  }, [params, queue.departments, activeDeptId, queuesLoaded]);

  const activeView: ViewSegment =
    params.get("view") === "enrolled" ? "enrolled" : "queue";
  const rangeParam = params.get("range");
  const enrolledRange: EnrolledRange =
    rangeParam === "today" ? "today" : rangeParam === "all" ? "all" : "ay";
  const enrolledQ = params.get("q") ?? "";

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (!queuesLoaded) return;
    const param = params.get("dept");
    if (!param || param === "manage") return;
    const depts = queue.departments;
    if (depts.length === 0) {
      updateUrl({ dept: null });
      return;
    }
    if (!depts.some((d) => d.id === param)) {
      updateUrl({ dept: depts[0]?.id ?? "manage" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, queue.departments, queuesLoaded]);

  function selectTab(departmentId: string) {
    updateUrl({
      dept: departmentId,
      tab: null,
      view: null,
      q: null,
      range: null,
    });
    // reset keyboard selection in queue slice
    queue.setSelectedId(null);
  }

  const studentsSelected = studentsTabSelected(params);

  function selectStudentsTab() {
    updateUrl({ tab: "students" });
  }

  const reportsSelected = reportsTabSelected(params);

  function selectReportsTab() {
    updateUrl({ tab: REPORTS_TAB_ID });
  }

  function selectView(view: ViewSegment) {
    updateUrl({ view: view === "queue" ? null : view });
  }

  function setEnrolledRange(range: EnrolledRange) {
    updateUrl({ range: range === "ay" ? null : range, q: null });
  }

  function setEnrolledQ(q: string) {
    updateUrl({ q: q.trim() || null });
  }

  const sessionQuery = authClient.useSession();
  const sessionReady = !sessionQuery.isPending && Boolean(sessionQuery.data);

  const notificationsQuery = useQuery(
    api.notifications.listMine.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      // No session, no request — same sign-out race as the student surface.
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );
  const notificationItems = notificationsQuery.data?.data ?? [];
  const transferNotices = (
    (notificationsQuery.data?.data ?? []) as any[]
  ).filter((n) => n.type === "DEPARTMENT_QUEUE_TRANSFERRED" && !n.readAt);
  const markNotificationsReadMutation = useMutation(
    api.notifications.markAllRead.mutationOptions(),
  );
  async function dismissTransferNotices() {
    try {
      await markNotificationsReadMutation.mutateAsync({});
      queryClient.invalidateQueries({
        queryKey: api.notifications.listMine.queryKey(),
      });
    } catch {
      // Polling reconciles on the next tick.
    }
  }

  const transferRequestsQuery = useQuery(
    api.instructor.listMyTransferRequests.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );
  const incomingTransferRequests = transferRequestsQuery.data?.incoming ?? [];
  const outgoingTransferRequests = transferRequestsQuery.data?.outgoing ?? [];

  const respondTransferMutation = useMutation(
    api.instructor.respondDepartmentTransfer.mutationOptions(),
  );
  async function respondTransfer(requestId: string, accept: boolean) {
    try {
      const res = await respondTransferMutation.mutateAsync({
        requestId,
        accept,
      });
      toast(
        accept
          ? res.transferredFromName
            ? `Transferred — ${res.transferredFromName} no longer serves it`
            : "Transfer approved — queue handed over"
          : "Transfer request declined",
        accept ? "success" : "warning",
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not respond to the request",
        "error",
      );
    } finally {
      queryClient.invalidateQueries({
        queryKey: api.instructor.listMyTransferRequests.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: api.instructor.listDepartments.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: api.instructor.getMyQueues.queryKey(),
      });
    }
  }

  useEffect(
    () =>
      connectLiveUpdates((event) => {
        queryClient.invalidateQueries({
          queryKey: api.notifications.listMine.queryKey(),
        });
        if (
          event.topic === "queue" ||
          event.topic === "availability" ||
          event.topic === "reconnect"
        ) {
          queryClient.invalidateQueries({
            queryKey: api.instructor.getMyQueues.queryKey(),
          });
        }
        if (event.topic !== "transfer-requests") return;
        queryClient.invalidateQueries({
          queryKey: api.instructor.listMyTransferRequests.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: api.instructor.listDepartments.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: api.instructor.getMyQueues.queryKey(),
        });
      }),
    [queryClient],
  );

  const enrolled = useEnrolledState(
    () => activeDeptId,
    () => activeView,
    () => enrolledRange,
    () => enrolledQ,
    toast,
    () => queue.noteActivity(),
    () => queue.invalidateQueues(),
  );

  async function confirmServe() {
    await enrolled.confirmServe(queue.serveEntry, queue.activeDept);
    queue.closeValidateDialog();
  }

  async function confirmRevert(reason: string) {
    await enrolled.confirmRevert(reason, queue.activeDept);
  }

  async function confirmBulkRevert(reason: string) {
    await enrolled.confirmBulkRevert(reason, queue.activeDept);
  }

  return {
    queue,
    enrolled,
    activeDeptId,
    activeView,
    enrolledRange,
    enrolledQ,
    studentsSelected,
    reportsSelected,
    notificationItems,
    transferNotices,
    incomingTransferRequests,
    outgoingTransferRequests,
    respondTransferMutation,
    toast,
    dismissTransferNotices,
    respondTransfer,
    selectTab,
    selectStudentsTab,
    selectReportsTab,
    selectView,
    setEnrolledRange,
    setEnrolledQ,
    confirmServe,
    confirmRevert,
    confirmBulkRevert,
    updateUrl,
    IDLE_PROMPT_MS,
  };
}
