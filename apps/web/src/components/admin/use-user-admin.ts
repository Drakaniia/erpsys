import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import type { UserItem } from "$lib/admin/types";

type RoleLever = "SBO_OFFICER" | "STUDENT";

/**
 * The admin-user mutations and the three confirmation dialogs they drive:
 * set-role (single + bulk), delete (soft/hard), and permanent purge. Split out
 * of `UserTable` so the table reads as query + selection + rows.
 */
export function useUserAdmin({
  selectedPromotable,
  selectedDemotable,
  selectedDeletable,
  selectedCount,
  clearSelection,
  removeSelected,
  ontoast,
}: {
  selectedPromotable: UserItem[];
  selectedDemotable: UserItem[];
  selectedDeletable: UserItem[];
  selectedCount: number;
  clearSelection: () => void;
  removeSelected: (id: string) => void;
  ontoast: (message: string, kind?: "success" | "error") => void;
}) {
  const setRoleMutation = useMutation(api.admin.setRole.mutationOptions());
  const setRoleBulkMutation = useMutation(
    api.admin.setRoleBulk.mutationOptions(),
  );
  const deleteAccountsMutation = useMutation(
    api.admin.deleteAccounts.mutationOptions(),
  );
  const purgeAccountMutation = useMutation(
    api.admin.purgeAccount.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  const [roleDialog, setRoleDialog] = useState<{
    role: RoleLever;
    targets: UserItem[];
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    targets: UserItem[];
  } | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<UserItem | null>(null);
  const [busy, setBusy] = useState(false);

  function askSingle(item: UserItem, role: RoleLever) {
    setRoleDialog({ role, targets: [item] });
  }

  function askBulk(role: RoleLever) {
    const targets =
      role === "SBO_OFFICER" ? selectedPromotable : selectedDemotable;
    if (targets.length === 0) return;
    setRoleDialog({ role, targets });
  }

  async function confirmRoleChange() {
    if (!roleDialog) return;
    const { role: targetRole, targets } = roleDialog;
    setBusy(true);
    try {
      if (targets.length === 1) {
        await setRoleMutation.mutateAsync({
          userId: targets[0].id,
          role: targetRole,
        });
        ontoast(
          targetRole === "SBO_OFFICER"
            ? `Promoted ${targets[0].name} to SBO Officer`
            : `Demoted ${targets[0].name} to Student`,
        );
      } else {
        const res = await setRoleBulkMutation.mutateAsync({
          userIds: targets.map((t) => t.id),
          role: targetRole,
        });
        ontoast(
          targetRole === "SBO_OFFICER"
            ? `Promoted ${res.updated} student${res.updated === 1 ? "" : "s"}`
            : `Demoted ${res.updated} student${res.updated === 1 ? "" : "s"}`,
          res.updated === 0 ? "error" : "success",
        );
      }
      invalidate();
      setRoleDialog(null);
      clearSelection();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not change role",
        "error",
      );
      setRoleDialog(null);
    } finally {
      setBusy(false);
    }
  }

  function skipMessage(
    skipped: readonly {
      userId: string;
      reason: "ADMIN" | "BLOCKED" | "NOT_FOUND";
    }[],
  ): string {
    if (skipped.length === 0) return "Could not delete account";
    const n = (reason: "ADMIN" | "BLOCKED" | "NOT_FOUND") =>
      skipped.filter((s) => s.reason === reason).length;
    const parts: string[] = [];
    const admins = n("ADMIN");
    const blocked = n("BLOCKED");
    const missing = n("NOT_FOUND");
    if (admins > 0) parts.push(`${admins} admin`);
    if (blocked > 0) parts.push(`${blocked} already disabled`);
    if (missing > 0) parts.push(`${missing} not found`);
    const label = parts.join(", ");
    return skipped.length === 1
      ? `Could not delete account — ${label}`
      : `No accounts deleted — ${label}`;
  }

  function askDelete(item: UserItem) {
    setDeleteDialog({ targets: [item] });
  }

  function askBulkDelete() {
    if (selectedDeletable.length === 0) return;
    setDeleteDialog({ targets: selectedDeletable });
  }

  async function confirmDelete() {
    if (!deleteDialog) return;
    const { targets } = deleteDialog;
    setBusy(true);
    try {
      const res = await deleteAccountsMutation.mutateAsync({
        userIds: targets.map((t) => t.id),
      });
      const { hardDeleted, blocked, skipped } = res;
      if (targets.length === 1) {
        if (blocked.length === 1) ontoast(`Disabled ${targets[0].name}`);
        else if (hardDeleted.length === 1)
          ontoast(`Deleted ${targets[0].name}`);
        else ontoast(skipMessage(skipped), "error");
      } else if (hardDeleted.length + blocked.length === 0) {
        ontoast(skipMessage(skipped), "error");
      } else {
        const parts: string[] = [];
        if (hardDeleted.length > 0) {
          parts.push(
            `Deleted ${hardDeleted.length} account${hardDeleted.length === 1 ? "" : "s"}`,
          );
        }
        if (blocked.length > 0) {
          parts.push(`disabled ${blocked.length}`);
        }
        ontoast(parts.join("; "));
      }
      invalidate();
      setDeleteDialog(null);
      clearSelection();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not delete account",
        "error",
      );
      setDeleteDialog(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPurge() {
    const target = purgeTarget;
    if (!target) return;
    setBusy(true);
    try {
      await purgeAccountMutation.mutateAsync({ userId: target.id });
      ontoast(`Permanently deleted ${target.name}`);
      invalidate();
      setPurgeTarget(null);
      removeSelected(target.id);
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not permanently delete account",
        "error",
      );
      setPurgeTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return {
    roleDialog,
    deleteDialog,
    purgeTarget,
    busy,
    selectedPromotableCount: selectedPromotable.length,
    selectedDemotableCount: selectedDemotable.length,
    selectedCount,
    selectedDeletableCount: selectedDeletable.length,
    askSingle,
    askBulk,
    askDelete,
    askBulkDelete,
    setPurgeTarget,
    confirmRoleChange,
    confirmDelete,
    confirmPurge,
    closeRole: () => setRoleDialog(null),
    closeDelete: () => setDeleteDialog(null),
    closePurge: () => setPurgeTarget(null),
  };
}
