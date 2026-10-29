import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ConfirmDialog from "../ConfirmDialog";
import ActivateYearDialog from "./ActivateYearDialog";
import { api, queryClient } from "$lib/api";
import type { AcademicYearItem } from "$lib/admin/types";

export default function AcademicYearTable({
  onyearactivated,
  ontoast,
  registerrefresh = () => {},
}: {
  onyearactivated: () => void;
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  // ---- Query ----
  const yearsQuery = useQuery(
    api.admin.listAcademicYears.queryOptions({ refetchOnWindowFocus: true }),
  );
  const years: AcademicYearItem[] = yearsQuery.data?.data ?? [];
  const { refetch: refetchYears } = yearsQuery;
  useEffect(() => {
    registerrefresh(() => refetchYears());
  }, [registerrefresh, refetchYears]);

  // ---- Mutations ----
  const addMutation = useMutation(
    api.admin.createAcademicYear.mutationOptions(),
  );
  const updateMutation = useMutation(
    api.admin.updateAcademicYear.mutationOptions(),
  );
  const deleteMutation = useMutation(
    api.admin.deleteAcademicYear.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  // ---- Create ----
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSemester, setNewSemester] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(false);
  const [createError, setCreateError] = useState("");

  function startCreate() {
    setNewLabel("");
    setNewSemester("");
    setActivateImmediately(false);
    setCreateError("");
    setCreating(true);
  }

  async function submitCreate() {
    if (!newLabel.trim() || !newSemester.trim()) {
      setCreateError("Year label and semester label are required.");
      return;
    }
    try {
      const created = await addMutation.mutateAsync({
        label: newLabel.trim(),
        semesterLabel: newSemester.trim(),
        activate: activateImmediately,
      });
      ontoast(`Created ${created.label} · ${created.semesterLabel}`);
      setCreating(false);
      invalidate();
      if (activateImmediately) onyearactivated();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create year.");
    }
  }

  // ---- Edit (active year only) ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editError, setEditError] = useState("");

  function startEdit(y: AcademicYearItem) {
    setEditingId(y.id);
    setEditLabel(y.label);
    setEditSemester(y.semesterLabel);
    setEditError("");
  }

  async function submitEdit() {
    if (!editingId) return;
    if (!editLabel.trim() || !editSemester.trim()) {
      setEditError("Both labels are required.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        label: editLabel.trim(),
        semesterLabel: editSemester.trim(),
      });
      ontoast("Academic year updated");
      setEditingId(null);
      invalidate();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not update year.");
    }
  }

  // ---- Delete (empty years only) ----
  const [deleting, setDeleting] = useState<AcademicYearItem | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync({ id: deleting.id });
      ontoast("Academic year deleted");
      setDeleting(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not delete year",
        "error",
      );
      setDeleting(null);
    }
  }

  // ---- Activate dialog ----
  const [activating, setActivating] = useState<AcademicYearItem | null>(null);

  const busyAny =
    addMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          One active year at a time. Activating a new year resets students'
          steps for the new cycle.
        </p>
        <button
          onClick={startCreate}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
        >
          Create year
        </button>
      </div>

      {yearsQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load academic years.</p>
          <button
            onClick={() => yearsQuery.refetch()}
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
              <th className="px-4 py-2 font-medium">Academic year</th>
              <th className="px-2 py-2 font-medium">Semester</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Created</th>
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {yearsQuery.isPending ? (
              Array.from({ length: 3 }, (_, i) => i).map((i) => (
                <tr
                  key={i}
                  className="h-[52px]"
                  aria-hidden="true"
                  style={{ "--skeleton-i": i } as React.CSSProperties}
                >
                  <td className="px-4">
                    <div className="skeleton h-3 w-32 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-24 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-20 rounded" />
                  </td>
                  <td className="px-2">
                    <div className="skeleton h-3 w-16 rounded" />
                  </td>
                </tr>
              ))
            ) : years.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-14 text-center text-sm text-muted"
                >
                  No academic years yet — create and activate the first one.
                </td>
              </tr>
            ) : (
              years.map((y) =>
                editingId === y.id ? (
                  <tr key={y.id} className="bg-surface">
                    <td className="px-4 py-2">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.currentTarget.value)}
                        aria-label="Year label"
                        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={editSemester}
                        onChange={(e) => setEditSemester(e.currentTarget.value)}
                        aria-label="Semester label"
                        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
                      />
                    </td>
                    <td colSpan={3} className="px-2 py-2">
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
                  <tr key={y.id} className="h-[52px] hover:bg-surface">
                    <td className="px-4 py-2 font-medium tabular-nums text-ink">
                      {y.label}
                    </td>
                    <td className="px-2 py-2 text-muted">{y.semesterLabel}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          y.isActive
                            ? "bg-primary text-white"
                            : "bg-border/40 text-muted"
                        }`}
                      >
                        {y.isActive ? "Active" : "Past"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted">
                      {new Date(y.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {y.isActive ? (
                        <>
                          <button
                            onClick={() => startEdit(y)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleting(y)}
                            disabled={y.hasData}
                            title={
                              y.hasData
                                ? "Cannot delete — contains records"
                                : undefined
                            }
                            className="rounded-md px-2 py-1 text-xs font-medium text-error/80 transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 hover:text-error active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setActivating(y)}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
                          >
                            Activate
                          </button>
                          <button
                            onClick={() => setDeleting(y)}
                            disabled={y.hasData}
                            title={
                              y.hasData
                                ? "Cannot delete — contains records"
                                : undefined
                            }
                            className="rounded-md px-2 py-1 text-xs font-medium text-error/80 transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 hover:text-error active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>

        {creating && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.currentTarget.value)}
              aria-label="Year label"
              placeholder="Year (e.g. 2027-2028)"
              className="w-36 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink tabular-nums"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
              }}
            />
            <input
              value={newSemester}
              onChange={(e) => setNewSemester(e.currentTarget.value)}
              aria-label="Semester label"
              placeholder="Semester (e.g. 1st Semester)"
              className="w-44 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
              }}
            />
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={activateImmediately}
                onChange={(e) =>
                  setActivateImmediately(e.currentTarget.checked)
                }
                className="h-4 w-4 accent-primary"
              />
              Activate immediately
            </label>
            {createError && (
              <p className="w-full text-xs text-error" role="alert">
                {createError}
              </p>
            )}
            <button
              onClick={submitCreate}
              disabled={addMutation.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting
            ? `Delete ${deleting.label} · ${deleting.semesterLabel}?`
            : ""
        }
        body="Only empty years can be deleted. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={busyAny}
        onconfirm={confirmDelete}
        onclose={() => setDeleting(null)}
      />

      <ActivateYearDialog
        year={activating}
        onclose={() => setActivating(null)}
        ontoast={ontoast}
        onactivated={() => {
          invalidate();
          onyearactivated();
        }}
      />
    </div>
  );
}
