import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ConfirmDialog from "../ConfirmDialog";
import YearLevelModal from "../YearLevelModal";
import { api, queryClient } from "$lib/api";
import {
  departmentLevelRangeLabel,
  type YearLevel,
} from "$lib/domain/constants";
import type { DepartmentItem } from "$lib/admin/types";

export default function DepartmentTable({
  ontoast,
  registerrefresh = () => {},
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  // ---- Query ----
  const listQuery = useQuery(
    api.admin.listDepartments.queryOptions({ refetchOnWindowFocus: true }),
  );
  const departments: DepartmentItem[] = listQuery.data?.data ?? [];
  const { refetch } = listQuery;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  // ---- Mutations ----
  const addMutation = useMutation(api.admin.createDepartment.mutationOptions());
  const updateMutation = useMutation(
    api.admin.updateDepartment.mutationOptions(),
  );
  const setActiveMutation = useMutation(
    api.admin.setDepartmentActive.mutationOptions(),
  );
  const yearLevelsMutation = useMutation(
    api.admin.setDepartmentYearLevels.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  const [editingLevelsFor, setEditingLevelsFor] =
    useState<DepartmentItem | null>(null);

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

  // ---- Inline add ----
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");

  function startAdd() {
    setNewName("");
    setAddError("");
    setAdding(true);
  }

  async function submitAdd() {
    if (!newName.trim()) {
      setAddError("Name is required.");
      return;
    }
    try {
      await addMutation.mutateAsync({ name: newName.trim() });
      ontoast("Department added");
      setAdding(false);
      invalidate();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add department.");
    }
  }

  // ---- Inline edit ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");

  function startEdit(d: DepartmentItem) {
    setEditingId(d.id);
    setEditName(d.name);
    setEditError("");
  }

  async function submitEdit() {
    if (!editingId) return;
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
        e instanceof Error ? e.message : "Could not update department.",
      );
    }
  }

  // ---- Deactivate confirm (§6.3) ----
  const [deactivating, setDeactivating] = useState<DepartmentItem | null>(null);

  async function confirmDeactivate() {
    if (!deactivating) return;
    try {
      await setActiveMutation.mutateAsync({
        id: deactivating.id,
        isActive: false,
      });
      ontoast(`Deactivated ${deactivating.name}`);
      setDeactivating(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not deactivate department",
        "error",
      );
      setDeactivating(null);
    }
  }

  async function activate(d: DepartmentItem) {
    try {
      await setActiveMutation.mutateAsync({ id: d.id, isActive: true });
      ontoast(`Activated ${d.name}`);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not activate department",
        "error",
      );
    }
  }

  const busyAny =
    addMutation.isPending ||
    updateMutation.isPending ||
    setActiveMutation.isPending ||
    yearLevelsMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Students see this list at step 6. Deactivated departments stay hidden
          from students but keep their history.
        </p>
        <button
          onClick={startAdd}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
        >
          Add department
        </button>
      </div>

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

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Code</th>
              <th className="px-2 py-2 font-medium">Year levels</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium tabular-nums">Mappings</th>
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {listQuery.isPending ? (
              Array.from({ length: 4 }, (_, i) => i).map((i) => (
                <tr
                  key={i}
                  className="h-[52px]"
                  aria-hidden="true"
                  style={{ "--skeleton-i": i } as React.CSSProperties}
                >
                  <td className="px-4">
                    <div className="skeleton h-3 w-48 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-14 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-28 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-8 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-16 rounded" />
                  </td>
                </tr>
              ))
            ) : departments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-14 text-center text-sm text-muted"
                >
                  No departments yet — add the first one.
                </td>
              </tr>
            ) : (
              departments.map((d) =>
                editingId === d.id ? (
                  <tr key={d.id} className="bg-surface">
                    <td className="px-4 py-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.currentTarget.value)}
                        aria-label="Department name"
                        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
                      />
                    </td>
                    <td colSpan={4} className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {editError && (
                          <p className="text-xs text-error" role="alert">
                            {editError}
                          </p>
                        )}
                        <button
                          onClick={submitEdit}
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
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id} className="h-[52px] hover:bg-surface">
                    <td className="px-4 py-2 font-medium text-ink">{d.name}</td>
                    <td className="px-2 py-2 tabular-nums text-muted">
                      {d.code}
                    </td>
                    <td className="px-2 py-2 text-muted">
                      {departmentLevelRangeLabel(d.yearLevels)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          d.isActive
                            ? "bg-primary text-white"
                            : "bg-border/40 text-muted"
                        }`}
                      >
                        {d.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted">
                      {d.mappingCount}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => startEdit(d)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setEditingLevelsFor(d)}
                        title="Choose which year levels this program offers"
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                      >
                        Year levels
                      </button>
                      {d.isActive ? (
                        <button
                          onClick={() => setDeactivating(d)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-error/80 transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 hover:text-error active:scale-[0.97]"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => activate(d)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-[transform,background-color] duration-100 ease-out hover:bg-primary/10 active:scale-[0.97]"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>

        {adding && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              aria-label="New department name"
              placeholder="Department name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
              }}
            />
            {addError && (
              <p className="w-full text-xs text-error" role="alert">
                {addError}
              </p>
            )}
            <button
              onClick={submitAdd}
              disabled={addMutation.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <YearLevelModal
        open={editingLevelsFor !== null}
        department={editingLevelsFor}
        busy={yearLevelsMutation.isPending}
        onsaved={saveYearLevels}
        onclose={() => setEditingLevelsFor(null)}
      />

      <ConfirmDialog
        open={deactivating !== null}
        title={deactivating ? `Deactivate ${deactivating.name}?` : ""}
        body="Students can no longer join this department's queue. Queued students and past verifications are unaffected."
        confirmLabel="Deactivate"
        destructive
        busy={busyAny}
        onconfirm={confirmDeactivate}
        onclose={() => setDeactivating(null)}
      />
    </div>
  );
}
