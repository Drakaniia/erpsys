import DetailSheetActions from "./DetailSheetActions";
import DetailSheetBody from "./DetailSheetBody";
import RevokeConfirmDialog from "./RevokeConfirmDialog";
import StampConfirmDialog from "./StampConfirmDialog";
import StampLanding from "./StampLanding";
import type { StepStatus } from "$lib/officer/types";

export default function DetailSheetMain({
  data,
  status,
  reply,
  stamp,
  revocation,
  replyOpen,
  replyBusy,
  captureBusy,
  captureDismissed,
  isVerified,
  busyAny,
  sendBackLabel,
  revokeBusy,
  onclose,
  onopenlightbox,
  oncapturesave,
  oncapturecancel,
  onshowcamera,
  onreplyclose,
  onreplysend,
  onstamp,
  onrevoke,
  ontogglesendback,
  justVerified,
  dialogStampName,
  dialogGraphicUrl,
  dialogSignatureUrl,
  dateLabel,
  stampOpen,
  revokeOpen,
  studentName,
  verifyBusy,
  onconfirm,
  oncancel,
  onrevokeconfirm,
  onrevokecancel,
  onfinish,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  status: StepStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stamp: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revocation: any;
  replyOpen: boolean;
  replyBusy: boolean;
  captureBusy: boolean;
  captureDismissed: boolean;
  isVerified: boolean;
  busyAny: boolean;
  sendBackLabel: string;
  revokeBusy: boolean;
  onclose: () => void;
  onopenlightbox: (i: number) => void;
  oncapturesave: (url: string) => void;
  oncapturecancel: () => void;
  onshowcamera: () => void;
  onreplyclose: () => void;
  onreplysend: (chips: string[], note: string) => void;
  onstamp: () => void;
  onrevoke: () => void;
  ontogglesendback: () => void;
  justVerified: boolean;
  dialogStampName: string;
  dialogGraphicUrl: string | null;
  dialogSignatureUrl: string | null;
  dateLabel: string;
  stampOpen: boolean;
  revokeOpen: boolean;
  studentName: string;
  verifyBusy: boolean;
  onconfirm: () => void;
  oncancel: () => void;
  onrevokeconfirm: () => void;
  onrevokecancel: () => void;
  onfinish: () => void;
}) {
  return (
    <>
      <DetailSheetBody
        data={data}
        status={status}
        reply={reply}
        stamp={stamp}
        revocation={revocation}
        replyOpen={replyOpen}
        replyBusy={replyBusy}
        captureBusy={captureBusy}
        captureDismissed={captureDismissed}
        onclose={onclose}
        onopenlightbox={onopenlightbox}
        oncapturesave={oncapturesave}
        oncapturecancel={oncapturecancel}
        onshowcamera={onshowcamera}
        onreplyclose={onreplyclose}
        onreplysend={onreplysend}
      />
      <DetailSheetActions
        isVerified={isVerified}
        busyAny={busyAny}
        replyOpen={replyOpen}
        sendBackLabel={sendBackLabel}
        revokeBusy={revokeBusy}
        onstamp={onstamp}
        onrevoke={onrevoke}
        ontogglesendback={ontogglesendback}
      />
      {justVerified && (
        <StampLanding
          active={true}
          stampName={dialogStampName}
          stampGraphicUrl={dialogGraphicUrl}
          stampSignatureUrl={dialogSignatureUrl}
          dateLabel={dateLabel}
          onfinish={onfinish}
        />
      )}
      <StampConfirmDialog
        open={stampOpen}
        stampName={dialogStampName}
        stampGraphicUrl={dialogGraphicUrl}
        stampSignatureUrl={dialogSignatureUrl}
        dateLabel={dateLabel}
        onconfirm={onconfirm}
        oncancel={oncancel}
        busy={verifyBusy}
      />
      <RevokeConfirmDialog
        open={revokeOpen}
        studentName={studentName}
        onconfirm={onrevokeconfirm}
        oncancel={onrevokecancel}
        busy={revokeBusy}
      />
    </>
  );
}
