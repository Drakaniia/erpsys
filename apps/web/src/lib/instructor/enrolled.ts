import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { intervalWhileVisible } from "$lib/polling";

export type EnrolledRange = "today" | "ay" | "all";

type Toast = (msg: string, kind?: "success" | "error" | "warning") => void;

export interface RevertEntry {
  enrollmentId: string;
  studentName: string;
  completedAt: string;
  servedByName: string;
}

/** React port of `createEnrolledState` — the enrolled list + revert flow. */
export function useEnrolledState(
  getActiveDeptId: () => string,
  getActiveView: () => "queue" | "enrolled",
  getEnrolledRange: () => EnrolledRange,
  getEnrolledQ: () => string,
  toast: Toast,
  noteActivity: () => void,
  invalidateQueues: () => void,
) {
  const deptId = getActiveDeptId();
  const view = getActiveView();
  const range = getEnrolledRange();
  const q = getEnrolledQ();

  // ponytail: "load more" grows the page (server caps at 500) instead of cursor paging.
  const [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [deptId, view, range, q]);

  const enrolledQuery = useQuery(
    api.instructor.getEnrolledByDept.queryOptions({
      input: {
        departmentId: deptId !== "manage" ? deptId : "",
        filter: { range, q: q || undefined, limit },
      },
      enabled: deptId !== "manage" && view === "enrolled",
      refetchInterval:
        view === "enrolled" ? intervalWhileVisible(45_000) : false,
      refetchOnWindowFocus: view === "enrolled",
    }),
  );

  const enrollMutation = useMutation(
    api.instructor.completeEnrollment.mutationOptions(),
  );
  const revertMutation = useMutation(
    api.instructor.revertEnrollment.mutationOptions(),
  );
  const bulkRevertMutation = useMutation(
    api.instructor.bulkRevertEnrollments.mutationOptions(),
  );

  function invalidateEnrolled() {
    queryClient.invalidateQueries({
      predicate: (q2) =>
        Array.isArray(q2.queryKey) &&
        JSON.stringify(q2.queryKey).includes("getEnrolledByDept"),
    });
  }

  const [revertEntry, setRevertEntry] = useState<RevertEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // Changing department / view / range / query clears the selection.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [deptId, view, range, q]);

  const rows: any[] = enrolledQuery.data?.data ?? [];
  const total: number =
    (enrolledQuery.data as { total?: number } | undefined)?.total ?? 0;
  const hasMore = rows.length < total && limit < 500;
  function loadMore() {
    setLimit((n) => Math.min(500, n + 50));
  }
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(
        rows.map((e: { enrollmentId: string }) => e.enrollmentId),
      );
      let changed = false;
      for (const id of prev) if (!ids.has(id)) changed = true;
      if (!changed) return prev;
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next;
    });
  }, [rows]);

  function isSelected(id: string) {
    return selectedIds.has(id);
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(selectAll: boolean, visibleIds: string[]) {
    setSelectedIds(selectAll ? new Set(visibleIds) : new Set());
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function openBulkRevert() {
    if (selectedIds.size === 0) return;
    setBulkConfirmOpen(true);
  }
  function closeBulkRevert() {
    setBulkConfirmOpen(false);
  }

  async function confirmBulkRevert(
    reason: string,
    dept: { id: string } | null,
  ) {
    if (!dept || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setBulkConfirmOpen(false);
    try {
      const result = await bulkRevertMutation.mutateAsync({
        departmentId: dept.id,
        ids,
        reason,
      });
      const count = result.revertedCount ?? ids.length;
      clearSelection();
      invalidateQueues();
      invalidateEnrolled();
      noteActivity();
      toast(
        `Reverted ${count} enrollment${count === 1 ? "" : "s"} — back at #1`,
        "warning",
      );
    } catch (e) {
      toast(
        (e as { message?: string }).message ?? "Could not bulk revert",
        "error",
      );
    }
  }

  function openRevert(entry: RevertEntry) {
    setRevertEntry(entry);
  }

  function closeRevert() {
    setRevertEntry(null);
  }

  async function confirmRevert(reason: string, dept: { id: string } | null) {
    const entry = revertEntry;
    if (!entry || !dept) return;
    setRevertEntry(null);
    try {
      await revertMutation.mutateAsync({
        departmentId: dept.id,
        enrollmentId: entry.enrollmentId,
        reason,
      });
      invalidateQueues();
      invalidateEnrolled();
      noteActivity();
      toast(`Reverted — ${entry.studentName} is back at #1`, "warning");
    } catch (e) {
      toast(
        (e as { message?: string }).message ?? "Could not revert enrollment",
        "error",
      );
    }
  }

  async function confirmServe(
    entry: { entryId: string; name: string } | null,
    dept: { id: string } | null,
  ) {
    if (!entry || !dept || enrollMutation.isPending) return;
    try {
      const result = await enrollMutation.mutateAsync({
        departmentId: dept.id,
        entryId: entry.entryId,
      });
      invalidateQueues();
      invalidateEnrolled();
      noteActivity();
      if (result.outcome === "already") {
        toast(`Already enrolled — ${result.studentName}.`, "error");
      } else {
        toast(`Enrolled — ${result.studentName}`);
      }
    } catch (e) {
      invalidateQueues();
      toast(
        (e as { message?: string }).message ?? "Could not complete enrollment",
        "error",
      );
    }
  }

  return {
    enrolledQuery,
    hasMore,
    loadMore,
    enrollMutation,
    revertMutation,
    bulkRevertMutation,
    revertEntry,
    selectedIds,
    selectedCount: selectedIds.size,
    bulkConfirmOpen,
    setBulkConfirmOpen,
    isSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    openBulkRevert,
    closeBulkRevert,
    confirmBulkRevert,
    openRevert,
    closeRevert,
    confirmRevert,
    confirmServe,
    invalidateEnrolled,
  };
}
