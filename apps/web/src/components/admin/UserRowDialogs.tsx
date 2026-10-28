import RoleChangeDialog from "./RoleChangeDialog";
import DeleteAccountDialog from "./DeleteAccountDialog";
import PurgeAccountDialog from "./PurgeAccountDialog";
import type { UserItem } from "$lib/admin/types";

type RoleLever = "SBO_OFFICER" | "STUDENT";

/** The role-change, delete, and purge confirmations `UserTable` can raise. */
export default function UserRowDialogs({
  roleDialog,
  deleteDialog,
  purgeTarget,
  busy,
  selectedPromotableCount,
  selectedDemotableCount,
  selectedCount,
  selectedDeletableCount,
  onConfirmRole,
  onConfirmDelete,
  onConfirmPurge,
  onCloseRole,
  onCloseDelete,
  onClosePurge,
}: {
  roleDialog: { role: RoleLever; targets: UserItem[] } | null;
  deleteDialog: { targets: UserItem[] } | null;
  purgeTarget: UserItem | null;
  busy: boolean;
  selectedPromotableCount: number;
  selectedDemotableCount: number;
  selectedCount: number;
  selectedDeletableCount: number;
  onConfirmRole: () => void;
  onConfirmDelete: () => void;
  onConfirmPurge: () => void;
  onCloseRole: () => void;
  onCloseDelete: () => void;
  onClosePurge: () => void;
}) {
  return (
    <>
      <RoleChangeDialog
        open={roleDialog !== null}
        role={roleDialog?.role ?? "SBO_OFFICER"}
        names={(roleDialog?.targets ?? []).map((t) => t.name)}
        excludedCount={
          roleDialog
            ? roleDialog.targets.length -
              (roleDialog.role === "SBO_OFFICER"
                ? selectedPromotableCount
                : selectedDemotableCount)
            : 0
        }
        busy={busy}
        onconfirm={onConfirmRole}
        onclose={onCloseRole}
      />

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
        onconfirm={onConfirmDelete}
        onclose={onCloseDelete}
      />

      <PurgeAccountDialog
        open={purgeTarget !== null}
        name={purgeTarget?.name ?? ""}
        busy={busy}
        onconfirm={onConfirmPurge}
        onclose={onClosePurge}
      />
    </>
  );
}
