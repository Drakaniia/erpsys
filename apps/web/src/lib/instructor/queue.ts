import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { authClient } from "$lib/auth-client";
import { LAUNCH_STALE_MS } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import type { DepartmentQueue, QueueEntry } from "$lib/instructor/types";
import { type Toast } from "./queue/constants";
import { useGuideTour } from "./queue/use-guide-tour";
import { useIdleHeartbeat } from "./queue/use-idle-heartbeat";
import { useRemoveFlow } from "./queue/use-remove-flow";
import { useAutoCloseNotices } from "./queue/use-auto-close-notices";

export {
  IDLE_PROMPT_MS,
  HEARTBEAT_THROTTLE_MS,
  AUTO_CLOSE_NOTICE_WINDOW_MS,
} from "./queue/constants";

const errorText = (e: unknown, fallback: string) =>
  (e as { message?: string }).message ?? fallback;

/**
 * React port of `createQueueState` — the instructor queue slice. `activeDeptId`
 * comes from the caller as a plain value; every other field is hook state.
 */
export function useQueueState(getActiveDeptId: () => string, toast: Toast) {
  const queueQuery = useQuery(
    api.instructor.getMyQueues.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      refetchInterval: intervalWhileVisible(15_000),
      refetchOnWindowFocus: true,
    }),
  );
  const myAdviserId =
    (authClient.useSession().data?.user as { id?: string } | undefined)?.id ??
    "";

  const departments: DepartmentQueue[] = queueQuery.data?.departments ?? [];

  const activeDeptId = getActiveDeptId();
  const activeDept: DepartmentQueue | null =
    activeDeptId === "manage"
      ? null
      : (departments.find((d) => d.id === activeDeptId) ?? null);

  // Next for me = first waiting student in my year levels (the server's rule).
  const spotlight: QueueEntry | null =
    activeDept?.entries.find(
      (e: QueueEntry) => e.status === "WAITING" && !e.locked,
    ) ??
    null;
  const waitingEntries: QueueEntry[] = activeDept?.entries ?? [];
  const servingEntry: QueueEntry | null = activeDept?.servingEntry ?? null;
  const hasInProgress = servingEntry !== null;
  // Only a student *I* am serving in *this* department — never a colleague's.
  const serveEntry: QueueEntry | null =
    servingEntry && servingEntry.servedById === myAdviserId
      ? servingEntry
      : null;

  const hasActiveYear = queueQuery.data?.hasActiveYear ?? true;
  const yearLabel = queueQuery.data?.yearLabel ?? "";
  const semesterLabel = queueQuery.data?.semesterLabel ?? "";
  const yearBare = queueQuery.data?.label ?? "";

  const availabilityMutation = useMutation(
    api.instructor.setAvailability.mutationOptions(),
  );
  const moveMutation = useMutation(api.instructor.moveToEnd.mutationOptions());
  const beginServingMutation = useMutation(
    api.instructor.beginServing.mutationOptions(),
  );
  const endServingMutation = useMutation(
    api.instructor.endServing.mutationOptions(),
  );
  const heartbeatMutation = useMutation(
    api.instructor.heartbeat.mutationOptions(),
  );
  const removeMutation = useMutation(
    api.instructor.removeFromQueue.mutationOptions(),
  );
  const undoRemoveMutation = useMutation(
    api.instructor.undoRemoveFromQueue.mutationOptions(),
  );

  const canServeFirst =
    spotlight !== null && !hasInProgress && !beginServingMutation.isPending;
  const servingBusy = endServingMutation.isPending || moveMutation.isPending;

  function invalidateQueues() {
    queryClient.invalidateQueries({
      queryKey: api.instructor.getMyQueues.queryKey(),
    });
  }

  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const guideTour = useGuideTour();
  const idle = useIdleHeartbeat({
    anyDeptOpen: () => departments.some((d) => d.myOpen),
    sendHeartbeat: async () => {
      await heartbeatMutation.mutateAsync({});
    },
  });
  const { noteActivity, setStillThereOpen } = idle;
  const removeFlow = useRemoveFlow({
    hasActiveDept: activeDept !== null,
    invalidateQueues,
    noteActivity,
    runRemove: (entryId) => removeMutation.mutateAsync({ entryId }),
    runUndo: (snapshot) => undoRemoveMutation.mutateAsync(snapshot),
  });
  const { autoClosedDepts, dismissAutoClose } =
    useAutoCloseNotices(departments);

  // The server hands back the student I'm serving when a queue closes.
  async function closeAllQueues() {
    setStillThereOpen(false);
    for (const d of departments.filter((dept) => dept.myOpen)) {
      try {
        await availabilityMutation.mutateAsync({
          departmentId: d.id,
          isOpen: false,
        });
      } catch (e) {
        toast(errorText(e, "Could not close the queue"), "error");
      }
    }
    invalidateQueues();
  }

  async function reopenQueue(dept: DepartmentQueue) {
    try {
      await availabilityMutation.mutateAsync({
        departmentId: dept.id,
        isOpen: true,
      });
      invalidateQueues();
      dismissAutoClose(dept.id);
      toast(
        dept.waitingCount > 0
          ? `Queue open — ${dept.waitingCount} waiting.`
          : "Queue open — accepting students.",
      );
    } catch (e) {
      toast(errorText(e, "Could not reopen the queue"), "error");
    }
  }

  useEffect(() => {
    const ids = new Set(waitingEntries.map((e) => e.entryId));
    if (selectedId && !ids.has(selectedId)) setSelectedId(null);
  }, [waitingEntries, selectedId]);

  const [manualRefreshing, setManualRefreshing] = useState(false);
  async function refreshQueues() {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await queueQuery.refetch();
      toast("Refreshed");
    } finally {
      setManualRefreshing(false);
    }
  }

  async function openServe(entry: QueueEntry) {
    const dept = activeDept;
    if (!dept || beginServingMutation.isPending) return;
    if (entry.locked) {
      toast(
        entry.yearLevel
          ? `${entry.yearLevel} is outside the year levels assigned to you here.`
          : "This student has no year level on file — ask an admin to set their course.",
        "error",
      );
      return;
    }
    // R1 — Serve requires department open.
    if (!dept.myOpen) {
      toast("Open the queue to serve students.", "warning");
      return;
    }
    if (hasInProgress) {
      const name =
        servingEntry?.servedById === myAdviserId
          ? "you"
          : (servingEntry?.servedByName ?? "another adviser");
      toast(`Already being served by ${name} — one student at a time.`, "error");
      return;
    }
    if (spotlight?.entryId !== entry.entryId) {
      toast("Strict FIFO — serve the first student in your year levels.", "error");
      return;
    }
    try {
      await beginServingMutation.mutateAsync({
        departmentId: dept.id,
        entryId: entry.entryId,
      });
      noteActivity();
    } catch (e) {
      toast(errorText(e, "Could not begin serving"), "error");
    } finally {
      invalidateQueues();
    }
  }

  async function returnToQueue() {
    const dept = activeDept;
    const entry = serveEntry;
    if (!dept || !entry || servingBusy) return;
    try {
      await endServingMutation.mutateAsync({
        departmentId: dept.id,
        entryId: entry.entryId,
      });
    } catch (e) {
      toast(errorText(e, "Could not return the student to the queue"), "error");
    } finally {
      invalidateQueues();
      noteActivity();
    }
  }

  async function moveServingToEnd() {
    const dept = activeDept;
    const entry = serveEntry;
    if (!dept || !entry || servingBusy) return;
    try {
      await moveMutation.mutateAsync({
        departmentId: dept.id,
        entryId: entry.entryId,
      });
      noteActivity();
      toast(`Moved to end — ${entry.name}.`);
    } catch (e) {
      toast(errorText(e, "Could not move to end"), "error");
    } finally {
      invalidateQueues();
    }
  }

  async function applyAvailability(next: boolean) {
    const dept = activeDept;
    if (!dept) return;
    const waiting = dept.waitingCount;
    try {
      await availabilityMutation.mutateAsync({
        departmentId: dept.id,
        isOpen: next,
      });
      noteActivity();
      if (next) {
        toast(
          waiting > 0
            ? `Queue open — ${waiting} waiting.`
            : "Queue open — accepting students.",
        );
      } else if (waiting > 0) {
        toast(
          `Queue closed — ${waiting} ${waiting === 1 ? "student" : "students"} ${waiting === 1 ? "remains" : "remain"} queued.`,
        );
      } else {
        toast("Queue closed — no longer accepting students.");
      }
    } catch (e) {
      toast(errorText(e, "Could not update availability"), "error");
    } finally {
      invalidateQueues();
    }
  }

  function handleAvailabilityChange(next: boolean) {
    const dept = activeDept;
    if (!dept) return;
    if (!next && dept.waitingCount > 0) {
      setCloseConfirmOpen(true);
      return;
    }
    void applyAvailability(next);
  }

  function confirmCloseQueue() {
    setCloseConfirmOpen(false);
    void applyAvailability(false);
  }

  function moveSelection(delta: number) {
    if (waitingEntries.length === 0) return;
    const current = waitingEntries.findIndex((e) => e.entryId === selectedId);
    const next = Math.min(
      waitingEntries.length - 1,
      Math.max(
        0,
        current === -1
          ? delta > 0
            ? 0
            : waitingEntries.length - 1
          : current + delta,
      ),
    );
    setSelectedId(waitingEntries[next].entryId);
  }

  function openSelected() {
    const entry = waitingEntries.find((e) => e.entryId === selectedId);
    if (entry) void openServe(entry); // openServe explains why if it can't
  }

  function openValidateDialog() {
    if (serveEntry) setShowValidateDialog(true);
  }

  function closeValidateDialog() {
    setShowValidateDialog(false);
  }

  return {
    queueQuery,
    departments,
    activeDept,
    spotlight,
    waitingEntries,
    hasInProgress,
    servingEntry,
    canServeFirst,
    servingBusy,
    hasActiveYear,
    yearLabel,
    semesterLabel,
    yearBare,
    availabilityMutation,
    moveMutation,
    beginServingMutation,
    endServingMutation,
    heartbeatMutation,
    removeMutation,
    undoRemoveMutation,
    serveEntry,
    showValidateDialog,
    setShowValidateDialog,
    closeConfirmOpen,
    setCloseConfirmOpen,
    ...removeFlow,
    ...guideTour,
    selectedId,
    setSelectedId,
    ...idle,
    autoClosedDepts,
    manualRefreshing,
    closeAllQueues,
    dismissAutoClose,
    reopenQueue,
    refreshQueues,
    openServe,
    returnToQueue,
    moveServingToEnd,
    openValidateDialog,
    closeValidateDialog,
    confirmCloseQueue,
    handleAvailabilityChange,
    applyAvailability,
    moveSelection,
    openSelected,
    invalidateQueues,
  };
}
