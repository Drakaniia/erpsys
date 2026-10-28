import { useState } from "react";
import { toast as sonnerToast } from "sonner";
import { notify } from "$lib/notifications";
import type { QueueEntry } from "$lib/instructor/types";

export type RemoveSnapshot = {
  entryId: string;
  departmentId: string;
  studentProfileId: string;
  academicYearId: string;
  joinedAt: string;
  studentName: string;
  token: string;
};

const NOT_REMOVED: Record<string, string> = {
  ALREADY_REMOVED: "already left the queue",
  ALREADY_COMPLETED: "is already enrolled",
  NOW_IN_PROGRESS: "is being served now",
};

/**
 * Remove-a-student flow: confirm dialog, optimistic row lock, and the
 * undo toast that restores the last removed entry.
 */
export function useRemoveFlow({
  hasActiveDept,
  invalidateQueues,
  noteActivity,
  runRemove,
  runUndo,
}: {
  hasActiveDept: boolean;
  invalidateQueues: () => void;
  noteActivity: () => void;
  runRemove: (entryId: string) => Promise<{
    removed: boolean;
    reason: string | null;
    snapshot: RemoveSnapshot;
  }>;
  runUndo: (snapshot: RemoveSnapshot) => Promise<unknown>;
}) {
  const [removeCandidate, setRemoveCandidate] = useState<QueueEntry | null>(
    null,
  );
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function requestRemove(entry: QueueEntry) {
    setRemoveCandidate(entry);
    setRemoveConfirmOpen(true);
  }

  function cancelRemove() {
    setRemoveConfirmOpen(false);
    requestAnimationFrame(() => setRemoveCandidate(null));
  }

  async function executeRemove() {
    const candidate = removeCandidate;
    if (!candidate) return;
    if (!hasActiveDept) return;
    setRemovingId(candidate.entryId);
    setRemoveConfirmOpen(false);
    try {
      const res = await runRemove(candidate.entryId);
      invalidateQueues();
      noteActivity();
      const name = candidate.name;
      if (!res.removed) {
        notify.error(
          `${name} ${NOT_REMOVED[res.reason ?? ""] ?? "is no longer waiting"} — not removed.`,
        );
        return;
      }
      // Each toast undoes its own removal (5 s).
      const snapshot = res.snapshot;
      let undone = false;
      sonnerToast.success(`Removed ${name} from queue`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            if (undone) return;
            undone = true;
            void undoRemove(snapshot);
          },
        },
      });
    } catch (e) {
      const msg =
        (e as { message?: string }).message ?? "Could not remove from queue";
      notify.error(msg);
    } finally {
      setRemovingId(null);
      setTimeout(() => setRemoveCandidate(null), 300);
    }
  }

  async function undoRemove(snap: RemoveSnapshot) {
    try {
      await runUndo(snap);
      invalidateQueues();
      notify.success(`Restored ${snap.studentName} to queue`);
    } catch (e) {
      const msg =
        (e as { message?: string }).message ??
        "Could not undo — student may have re-joined.";
      notify.error(msg);
    }
  }

  return {
    removeCandidate,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    removingId,
    requestRemove,
    cancelRemove,
    executeRemove,
  };
}
