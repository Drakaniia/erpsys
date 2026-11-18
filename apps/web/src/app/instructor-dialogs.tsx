import ConfirmDialog from "../components/ConfirmDialog";
import ConfirmEnrollmentDialog from "../components/instructor/ConfirmEnrollmentDialog";
import InstructorGuideDialog from "../components/instructor/InstructorGuideDialog";
import RevertConfirmDialog from "../components/instructor/RevertConfirmDialog";
import StillThereDialog from "../components/instructor/StillThereDialog";
import TransferRequestDialog from "../components/instructor/TransferRequestDialog";
import type { useInstructorState } from "$lib/instructor/state";
import type { YearLevel } from "$lib/domain/constants";

type S = ReturnType<typeof useInstructorState>;
type Transfer = {
  id: string;
  requesterName: string;
  departmentCode: string;
  departmentName: string;
  yearLevels: YearLevel[];
  expiresAt: string;
} | null;

export default function InstructorDialogs({
  s,
  incomingTransferRequest,
  onGuideClose,
}: {
  s: S;
  incomingTransferRequest: Transfer;
  onGuideClose: (persist: boolean) => void;
}) {
  return (
    <>
      <ConfirmEnrollmentDialog
        open={s.queue.showValidateDialog}
        entry={s.queue.servingEntry}
        departmentName={s.queue.activeDept?.name ?? ""}
        semesterLabel={s.queue.semesterLabel}
        yearLabel={s.queue.yearBare}
        busy={s.enrolled.enrollMutation.isPending}
        onconfirm={s.confirmServe}
        onreturntoqueue={() => s.queue.closeValidateDialog()}
        onmovetoend={() => {
          s.queue.closeValidateDialog();
          void s.queue.moveServingToEnd();
        }}
      />
      <ConfirmDialog
        open={s.queue.closeConfirmOpen}
        title={`${s.queue.activeDept?.waitingCount ?? 0} ${s.queue.activeDept?.waitingCount === 1 ? "student" : "students"} still waiting — close anyway?`}
        body="They stay queued and see the queue as closed until you reopen."
        confirmLabel="Close"
        warning
        busy={s.queue.availabilityMutation.isPending}
        onconfirm={s.queue.confirmCloseQueue}
        onclose={() => s.queue.setCloseConfirmOpen(false)}
      />
      <ConfirmDialog
        open={s.queue.removeConfirmOpen}
        title={
          s.queue.removeCandidate
            ? `Remove ${s.queue.removeCandidate.name} from queue?`
            : "Remove from queue?"
        }
        body={
          s.queue.removeCandidate
            ? `${s.queue.removeCandidate.studentNumber ?? ""} • Joined ${s.queue.removeCandidate.joinedAt ? new Date(s.queue.removeCandidate.joinedAt).toLocaleString() : ""} — they can re-join while the queue is open. You can undo for 5 seconds after.`
            : "They can re-join while the queue is open. You can undo for 5 seconds after."
        }
        confirmLabel="Remove"
        destructive
        busy={s.queue.removeMutation.isPending}
        onconfirm={() => void s.queue.executeRemove()}
        onclose={s.queue.cancelRemove}
      />
      <RevertConfirmDialog
        open={s.enrolled.revertEntry !== null}
        student={
          s.enrolled.revertEntry
            ? {
                name: s.enrolled.revertEntry.studentName,
                number: null,
                completedAt: s.enrolled.revertEntry.completedAt,
                servedByName: s.enrolled.revertEntry.servedByName,
              }
            : null
        }
        departmentName={s.queue.activeDept?.name ?? ""}
        busy={s.enrolled.revertMutation.isPending}
        onconfirm={(reason) => void s.confirmRevert(reason)}
        onclose={s.enrolled.closeRevert}
      />
      <RevertConfirmDialog
        open={s.enrolled.bulkConfirmOpen}
        count={s.enrolled.selectedCount}
        departmentName={s.queue.activeDept?.name ?? ""}
        busy={s.enrolled.bulkRevertMutation.isPending}
        onconfirm={(reason) => void s.confirmBulkRevert(reason)}
        onclose={s.enrolled.closeBulkRevert}
      />
      <TransferRequestDialog
        open={incomingTransferRequest !== null}
        requesterName={incomingTransferRequest?.requesterName ?? ""}
        departmentCode={incomingTransferRequest?.departmentCode ?? ""}
        departmentName={incomingTransferRequest?.departmentName ?? ""}
        yearLevels={incomingTransferRequest?.yearLevels ?? []}
        expiresAt={incomingTransferRequest?.expiresAt ?? ""}
        busy={s.respondTransferMutation.isPending}
        onaccept={() => {
          if (incomingTransferRequest)
            void s.respondTransfer(incomingTransferRequest.id, true);
        }}
        ondecline={() => {
          if (incomingTransferRequest)
            void s.respondTransfer(incomingTransferRequest.id, false);
        }}
      />
      <StillThereDialog
        open={s.queue.stillThereOpen}
        onhere={s.queue.answerStillThere}
        onclosequeue={s.queue.closeAllQueues}
      />
      <InstructorGuideDialog
        open={s.queue.guideOpen}
        step={s.queue.guideStep}
        dontShow={s.queue.guideDontShow}
        onStepChange={(n) => s.queue.setGuideStep(n)}
        onDontShowChange={(v) => s.queue.setGuideDontShow(v)}
        onclose={onGuideClose}
      />
    </>
  );
}
