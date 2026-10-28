import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  departmentLevelRangeLabel,
  type YearLevel,
} from "$lib/domain/constants";
import { api, queryClient } from "$lib/api";
import { intervalWhileVisible } from "$lib/polling";
import { authClient } from "$lib/auth-client";
import type {
  DepartmentManageItem,
  TransferRequestItem,
} from "$lib/instructor/types";
import ConfirmDialog from "../ConfirmDialog";
import { LAUNCH_STALE_MS } from "$lib/perf/cache-policy";
import YearLevelModal from "../YearLevelModal";
import AssignDepartmentModal from "./AssignDepartmentModal";

export default function DepartmentManager({
  ontoast,
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
}) {
  const listQuery = useQuery(
    api.instructor.listDepartments.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      refetchOnWindowFocus: true,
    }),
  );
  // Admins hit the same endpoint but receive the admin shape (mappingCount,
  // no owners/assigned/myYearLevels) — normalize so the list below never
  // reads `.length` of undefined.
  const departments: DepartmentManageItem[] = (
    (listQuery.data?.data ?? []) as DepartmentManageItem[]
  ).map((item) => ({
    ...item,
    owners: item.owners ?? [],
    myYearLevels: item.myYearLevels ?? [],
    yearLevels: item.yearLevels ?? [],
    assigned: item.assigned ?? false,
  }));

  const requestsQuery = useQuery(
    api.instructor.listMyTransferRequests.queryOptions({
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );
  const pendingRequests = (
    (requestsQuery.data?.outgoing ?? []) as any[]
  ).filter((r) => r.status === "PENDING");
  function pendingRequestFor(
    item: DepartmentManageItem,
  ): TransferRequestItem | null {
    return pendingRequests.find((r) => r.departmentId === item.id) ?? null;
  }

  const assignMutation = useMutation(
    api.instructor.setMyDepartments.mutationOptions(),
  );
  const cancelRequestMutation = useMutation(
    api.instructor.cancelDepartmentTransfer.mutationOptions(),
  );
  const createDeptMutation = useMutation(
    api.instructor.createDepartment.mutationOptions(),
  );
  const updateMutation = useMutation(
    api.instructor.updateDepartment.mutationOptions(),
  );
  const deleteMutation = useMutation(
    api.instructor.deleteDepartment.mutationOptions(),
  );
  const yearLevelsMutation = useMutation(
    api.instructor.setDepartmentYearLevels.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: api.instructor.listDepartments.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: api.instructor.getMyQueues.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: api.instructor.listMyTransferRequests.queryKey(),
    });
  }

  const sessionQuery = authClient.useSession();
  const myId =
    (sessionQuery.data?.user as { id?: string } | undefined)?.id ?? null;

  const [assigningFor, setAssigningFor] = useState<DepartmentManageItem | null>(
    null,
  );
  const [assignMode, setAssignMode] = useState<"assign" | "edit">("assign");
  const [editingLevelsFor, setEditingLevelsFor] =
    useState<DepartmentManageItem | null>(null);
  const [deletingDept, setDeletingDept] = useState<DepartmentManageItem | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function toggleAssigned(item: DepartmentManageItem) {
    try {
      await assignMutation.mutateAsync({
        departmentIds: item.assigned ? [] : [item.id],
      });
      ontoast(
        item.assigned
          ? `Unassigned ${item.code} — you're not serving it`
          : `Now serving ${item.code} — ${item.name}`,
      );
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not update assignment",
        "error",
      );
    }
  }

  async function submitAssignment(yearLevels: YearLevel[]) {
    const target = assigningFor;
    if (!target) return;
    try {
      await assignMutation.mutateAsync({
        departmentIds: [target.id],
        yearLevels,
      });
      ontoast(
        `Now serving ${target.code} — ${departmentLevelRangeLabel(yearLevels)}`,
      );
      setAssigningFor(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not update assignment",
        "error",
      );
    }
  }

  async function cancelRequest(item: DepartmentManageItem) {
    const pending = pendingRequestFor(item);
    if (!pending) return;
    try {
      await cancelRequestMutation.mutateAsync({ requestId: pending.id });
      ontoast(`Cancelled the ${item.code} transfer request`);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not cancel the request",
        "error",
      );
    }
  }

  async function saveYearLevels(yearLevels: YearLevel[]) {
    if (!editingLevelsFor) return;
    const target = editingLevelsFor;
    try {
      await yearLevelsMutation.mutateAsync({ id: target.id, yearLevels });
      ontoast(
        yearLevels.length === 0
          ? `${target.code} now offers all year levels`
          : `Year levels updated for ${target.code}`,
      );
      setEditingLevelsFor(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not update year levels",
        "error",
      );
    }
  }

  async function handleCreate() {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("Name is required.");
      return;
    }
    try {
      const created = await createDeptMutation.mutateAsync({
        name: newName.trim(),
      });
      setNewName("");
      ontoast(
        created.assigned
          ? `Created ${created.code} — now serving it`
          : `Created ${created.code} — assign it to serve it`,
      );
      invalidate();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Could not create department",
      );
    }
  }

  async function confirmDelete() {
    if (!deletingDept) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingDept.id });
      ontoast(`Deleted ${deletingDept.code}`);
      setDeletingDept(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not delete department",
        "error",
      );
      setDeletingDept(null);
    }
  }

  async function handleUpdate() {
    if (!editingId) return;
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        name: editName.trim(),
      });
      ontoast("Department updated");
      setEditingId(null);
      invalidate();
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Could not update department",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        Your queue lives in the department tab on the left — assigning a new one
        replaces your current (one department at a time). Use Manage to switch
        or create departments; students join its queue at step&nbsp;6.
      </p>
      {listQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load departments.</p>
          <button
            onClick={() => listQuery.refetch()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}
      {listQuery.isPending ? (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface-raised"
          aria-hidden="true"
        >
          {Array.from({ length: 3 }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="flex h-14 items-center gap-3 border-b border-border px-4 last:border-b-0"
              style={{ "--skeleton-i": i } as React.CSSProperties}
            >
              <div className="skeleton h-5 w-16 rounded-full" />
              <div className="skeleton h-3 w-40 rounded" />
              <div className="skeleton ml-auto h-5 w-10 rounded-full" />
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-raised px-6 py-14 text-center">
          <p className="text-sm font-medium text-ink">No departments yet</p>
          <p className="max-w-sm text-xs text-muted">
            Create the first department below — it becomes the one you serve.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-raised">
          <ul className="divide-y divide-border">
            {departments.map((item) => {
              const takenByOther = !item.assigned && item.owners.length > 0;
              const pending = pendingRequestFor(item);
              if (editingId === item.id) {
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          Name
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.currentTarget.value)}
                            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-primary"
                            maxLength={120}
                          />
                        </label>
                        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                          {item.code}
                        </span>
                      </div>
                      {editError && (
                        <p className="text-xs text-error">{editError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdate}
                          disabled={updateMutation.isPending}
                          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.02em] text-primary">
                          {item.code}
                        </span>
                        <p className="truncate text-sm font-medium leading-5 tracking-[-0.01em] text-ink">
                          {item.name}
                        </p>
                        <span className="shrink-0 text-xs text-muted">
                          {departmentLevelRangeLabel(item.yearLevels)}
                        </span>
                        {!item.isActive && (
                          <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-muted">
                            Inactive
                          </span>
                        )}
                        {item.assigned && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.01em] text-primary"
                            title="Sign-out unassigns you and closes availability"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                              aria-hidden="true"
                            />
                            Assigned —{" "}
                            {departmentLevelRangeLabel(item.myYearLevels)}
                          </span>
                        )}
                      </div>
                      {takenByOther && (
                        <p className="text-xs leading-5 tracking-[0.01em] text-muted">
                          Assigned to:{" "}
                          {(item.owners as any[])
                            .map(
                              (o) =>
                                `${o.name} — ${departmentLevelRangeLabel(o.yearLevels)}`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                      {pending && (
                        <p className="text-xs leading-5 tracking-[0.01em] text-primary">
                          Request sent to {item.assignedToName} — awaiting
                          approval
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {pending ? (
                        <button
                          onClick={() => cancelRequest(item)}
                          disabled={cancelRequestMutation.isPending}
                          className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97] disabled:opacity-40"
                        >
                          Cancel request
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              item.assigned
                                ? void toggleAssigned(item)
                                : (setAssignMode("assign"),
                                  setAssigningFor(item))
                            }
                            disabled={
                              !item.isActive ||
                              assignMutation.isPending ||
                              cancelRequestMutation.isPending
                            }
                            aria-pressed={item.assigned}
                            title={
                              takenByOther
                                ? `Currently handled by ${item.assignedToName} — ask them to hand it over`
                                : undefined
                            }
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-40 ${item.assigned ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-ink"}`}
                          >
                            {item.assigned ? "Unassign" : "Assign"}
                          </button>
                          {item.assigned && (
                            <button
                              onClick={() => (
                                setAssignMode("edit"),
                                setAssigningFor(item)
                              )}
                              disabled={
                                assignMutation.isPending ||
                                cancelRequestMutation.isPending
                              }
                              title="Add or drop a year level without leaving the queue"
                              className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-[transform,background-color] duration-100 ease-out hover:bg-primary/10 active:scale-[0.97] disabled:opacity-40"
                            >
                              Edit levels
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => (
                          setEditingId(item.id),
                          setEditName(item.name),
                          setEditError(null)
                        )}
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setEditingLevelsFor(item)}
                        title="Choose which year levels this program offers"
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                      >
                        Year levels
                      </button>
                      <button
                        onClick={() => setDeletingDept(item)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-error/60 transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 hover:text-error active:scale-[0.97]"
                        title="Delete department"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            aria-label="Department name"
            placeholder="Department name"
            maxLength={120}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={createDeptMutation.isPending}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            Create department
          </button>
        </div>
        {createError && <p className="text-xs text-error">{createError}</p>}
      </div>
      <AssignDepartmentModal
        open={assigningFor !== null}
        mode={assignMode}
        myAdviserId={myId}
        department={assigningFor}
        busy={assignMutation.isPending}
        onsubmit={submitAssignment}
        onclose={() => setAssigningFor(null)}
      />
      <YearLevelModal
        open={editingLevelsFor !== null}
        department={editingLevelsFor}
        busy={yearLevelsMutation.isPending}
        onsaved={saveYearLevels}
        onclose={() => setEditingLevelsFor(null)}
      />
      <ConfirmDialog
        open={deletingDept !== null}
        title="Delete department"
        body={
          deletingDept
            ? `Delete ${deletingDept.name} (${deletingDept.code})? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onconfirm={confirmDelete}
        onclose={() => setDeletingDept(null)}
      />
    </div>
  );
}
