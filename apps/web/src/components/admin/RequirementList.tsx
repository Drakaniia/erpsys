import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ConfirmDialog from "../ConfirmDialog";
import AppleSwitch from "../ui/AppleSwitch";
import { api, queryClient } from "$lib/api";
import type { RequirementItem } from "$lib/admin/types";

export default function RequirementList({
  ontoast,
  registerrefresh = () => {},
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  // ---- Query ----
  const listQuery = useQuery(
    api.admin.listRequirementItems.queryOptions({ refetchOnWindowFocus: true }),
  );
  const items: any[] = listQuery.data?.data ?? [];
  const { refetch } = listQuery;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  // ---- Mutations ----
  const addMutation = useMutation(
    api.admin.createRequirementItem.mutationOptions(),
  );
  const updateMutation = useMutation(
    api.admin.updateRequirementItem.mutationOptions(),
  );
  const deleteMutation = useMutation(
    api.admin.deleteRequirementItem.mutationOptions(),
  );
  const reorderMutation = useMutation(
    api.admin.reorderRequirementItem.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  // ---- Add ----
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState("");

  function startAdd() {
    setNewLabel("");
    setAddError("");
    setAdding(true);
  }

  async function submitAdd() {
    if (!newLabel.trim()) {
      setAddError("Enter a requirement label.");
      return;
    }
    try {
      await addMutation.mutateAsync({ label: newLabel.trim() });
      ontoast("Requirement added — students see it at step 1");
      setAdding(false);
      invalidate();
    } catch (e) {
      setAddError(
        e instanceof Error ? e.message : "Could not add requirement.",
      );
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  function startEdit(item: RequirementItem) {
    setEditingId(item.id);
    setEditLabel(item.label);
  }

  async function commitEdit() {
    if (!editingId) return;
    const label = editLabel.trim();
    const id = editingId;
    setEditingId(null);
    if (!label) return;
    try {
      await updateMutation.mutateAsync({ id, label });
      ontoast("Requirement updated");
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not update requirement",
        "error",
      );
    }
  }

  async function toggle(item: RequirementItem) {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        isActive: !item.isActive,
      });
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not update requirement",
        "error",
      );
    }
  }

  // ---- Reorder ----
  async function reorder(item: RequirementItem, direction: "up" | "down") {
    const ids = items.map((i) => i.id);
    const idx = ids.indexOf(item.id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    try {
      await reorderMutation.mutateAsync({ orderedIds: ids });
      invalidate();
    } catch (e) {
      ontoast(e instanceof Error ? e.message : "Could not reorder", "error");
    }
  }

  // ---- Delete ----
  const [deleting, setDeleting] = useState<RequirementItem | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync({ id: deleting.id });
      ontoast("Requirement deleted");
      setDeleting(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not delete requirement",
        "error",
      );
      setDeleting(null);
    }
  }

  const busyAny =
    addMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Shown to students at step 1 (Assessment). Edits go live immediately;
          inactive items are hidden but kept.
        </p>
        <button
          onClick={startAdd}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
        >
          Add requirement
        </button>
      </div>

      {listQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load requirements.</p>
          <button
            onClick={() => listQuery.refetch()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        {listQuery.isPending ? (
          <div className="divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => i).map((i) => (
              <div
                key={i}
                className="flex h-[52px] items-center gap-3 px-4"
                style={{ "--skeleton-i": i } as React.CSSProperties}
              >
                <div className="skeleton h-3 w-6 rounded" />
                <div className="skeleton h-3 w-64 rounded" />
                <div className="skeleton ml-auto h-5 w-10 rounded-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted">
            No requirements yet — add the first one.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item, i) => (
              <li
                key={item.id}
                className={`flex h-[52px] items-center gap-3 px-4 hover:bg-surface ${!item.isActive ? "opacity-60" : ""}`}
              >
                <span
                  className="w-6 shrink-0 text-center text-xs tabular-nums text-muted"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => reorder(item, "up")}
                    disabled={i === 0 || reorderMutation.isPending}
                    aria-label="Move up"
                    className="rounded p-1 text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface-raised hover:text-ink active:scale-[0.97] disabled:opacity-30"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => reorder(item, "down")}
                    disabled={
                      i === items.length - 1 || reorderMutation.isPending
                    }
                    aria-label="Move down"
                    className="rounded p-1 text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface-raised hover:text-ink active:scale-[0.97] disabled:opacity-30"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {editingId === item.id ? (
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.currentTarget.value)}
                    aria-label="Requirement label"
                    className="min-w-0 flex-1 rounded-lg border border-primary/40 bg-surface px-3 py-1.5 text-sm text-ink"
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-primary"
                    title={`${item.label} — click to edit`}
                  >
                    {item.label}
                  </button>
                )}

                <AppleSwitch
                  size="sm"
                  checked={item.isActive}
                  ariaLabel={`${item.isActive ? "Deactivate" : "Activate"}: ${item.label}`}
                  onchange={() => toggle(item)}
                />

                <button
                  onClick={() => setDeleting(item)}
                  aria-label={`Delete ${item.label}`}
                  className="shrink-0 rounded p-1 text-muted hover:bg-error/5 hover:text-error"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding && (
          <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-3">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.currentTarget.value)}
              aria-label="New requirement label"
              placeholder="New requirement (students see it at step 1)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
              }}
            />
            {addError && (
              <p className="text-xs text-error" role="alert">
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

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete '${deleting.label}'?` : ""}
        body="Students will no longer see this requirement."
        confirmLabel="Delete"
        destructive
        busy={busyAny}
        onconfirm={confirmDelete}
        onclose={() => setDeleting(null)}
      />
    </div>
  );
}
