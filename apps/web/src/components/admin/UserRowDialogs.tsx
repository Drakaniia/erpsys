import { useState } from "react";
import RoleChangeDialog from "./RoleChangeDialog";
import ActiveEditors from "../ActiveEditors";

import DeleteAccountDialog from "./DeleteAccountDialog";
import PurgeAccountDialog from "./PurgeAccountDialog";
import ReactivateAccountDialog from "./ReactivateAccountDialog";
import type { UserItem } from "$lib/admin/types";

type RoleLever = "SBO_OFFICER" | "STUDENT" | "ADMIN";

/** The account-action confirmations `UserTable` can raise. */
export default function UserRowDialogs({
  roleDialog,
  deleteDialog,
  purgeTarget,
  reactivateTarget,
  busy,
  selectedPromotableCount,
  selectedDemotableCount,
  selectedCount,
  selectedDeletableCount,
  onConfirmRole,
  onConfirmDelete,
  onConfirmPurge,
  onConfirmReactivate,
  onCloseReactivate,
  onCloseRole,
  onCloseDelete,
  onClosePurge,
}: {
  roleDialog: {
    role: RoleLever;
    targets: UserItem[];
    excluded: number;
  } | null;
  deleteDialog: { targets: UserItem[] } | null;
  purgeTarget: UserItem | null;
  reactivateTarget: UserItem | null;
  busy: boolean;
  selectedPromotableCount: number;
  selectedDemotableCount: number;
  selectedCount: number;
  selectedDeletableCount: number;
  onConfirmRole: () => void;
  onConfirmDelete: () => void;
  onConfirmPurge: () => void;
  onConfirmReactivate: () => void;
  onCloseReactivate: () => void;
  onCloseRole: () => void;
  onCloseDelete: () => void;
  onClosePurge: () => void;
}) {
  const targets = roleDialog?.targets ?? deleteDialog?.targets ?? (purgeTarget ? [purgeTarget] : reactivateTarget ? [reactivateTarget] : []);
  const targetKey = JSON.stringify([roleDialog?.role, Boolean(deleteDialog), Boolean(purgeTarget), targets.map((target) => target.id)]);
  const [locks, setLocks] = useState<{ key: string; values: Record<string, boolean> }>({ key: "", values: {} });
  const blocked = targets.length === 0 || locks.key !== targetKey || targets.some((target) => locks.values[target.id] !== false);
  function report(id: string, value: boolean) {
    setLocks((old) => old.key === targetKey && old.values[id] === value ? old : {
      key: targetKey, values: { ...(old.key === targetKey ? old.values : {}), [id]: value },
    });
  }
  return (
    <>
      <RoleChangeDialog
        open={roleDialog !== null}
        role={roleDialog?.role ?? "SBO_OFFICER"}
        names={(roleDialog?.targets ?? []).map((t) => t.name)}
        excludedCount={roleDialog?.excluded ?? 0}
        busy={busy}
        confirmDisabled={blocked}
        onconfirm={onConfirmRole}
        onclose={onCloseRole}
      >
        {roleDialog?.targets.map((target) => (
          <ActiveEditors key={targetKey + target.id} resource="user" id={target.id} className="mt-3" onBlockedChange={(value) => report(target.id, value)} />
        ))}
      </RoleChangeDialog>

      <DeleteAccountDialog
        open={deleteDialog !== null}
        names={(deleteDialog?.targets ?? []).map((t) => t.name)}
        excludedCount={
          deleteDialog ? selectedCount - selectedDeletableCount : 0
        }
        adviserNote={
          deleteDialog?.targets.length === 1 &&
          deleteDialog.targets[0].role === "ENROLLMENT_ADVISER"
        }
        busy={busy}
        confirmDisabled={blocked}
        onconfirm={onConfirmDelete}
        onclose={onCloseDelete}
      >
        {deleteDialog?.targets.map((target) => (
          <ActiveEditors key={targetKey + target.id} resource="user" id={target.id} className="mt-3" onBlockedChange={(value) => report(target.id, value)} />
        ))}
      </DeleteAccountDialog>

      <ReactivateAccountDialog
        open={reactivateTarget !== null}
        name={reactivateTarget?.name ?? ""}
        busy={busy}
        confirmDisabled={blocked}
        onconfirm={onConfirmReactivate}
        onclose={onCloseReactivate}
      >
        {reactivateTarget && (
          <ActiveEditors key={targetKey} resource="user" id={reactivateTarget.id} className="mt-3" onBlockedChange={(value) => report(reactivateTarget.id, value)} />
        )}
      </ReactivateAccountDialog>

      <PurgeAccountDialog
        open={purgeTarget !== null}
        name={purgeTarget?.name ?? ""}
        busy={busy}
        confirmDisabled={blocked}
        onconfirm={onConfirmPurge}
        onclose={onClosePurge}
      >
        {purgeTarget && (
          <ActiveEditors key={targetKey} resource="user" id={purgeTarget.id} className="mt-3" onBlockedChange={(value) => report(purgeTarget.id, value)} />
        )}
      </PurgeAccountDialog>
    </>
  );
}
