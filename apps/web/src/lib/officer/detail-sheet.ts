import { useState } from "react";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { useStorageUpload } from "$lib/storage/use-storage-upload";
import type { StepStatus } from "$lib/officer/types";
import {
  doCapture,
  doReply,
  doRevoke,
  doVerify,
} from "$lib/officer/detail-handlers";

/**
 * React port of `createDetailSheetState`. `getVerificationId` is the current
 * detail id, `getOfficerName` the signed-in officer — both read fresh on each
 * render, so a changed id refetches exactly as the rune version did.
 */
export function useDetailSheetState(
  getVerificationId: () => string | null,
  getOfficerName: () => string,
) {
  const verificationId = getVerificationId();
  const officerName = getOfficerName();

  const detailQuery = useQuery(
    api.officer.getStepDetail.queryOptions({
      input: verificationId ? { verificationId } : skipToken,
      enabled: Boolean(verificationId),
    }),
  );
  const stampQuery = useQuery(
    api.officer.getStamp.queryOptions({
      enabled: Boolean(verificationId),
    }),
  );

  const verifyMutation = useMutation(api.officer.verifyStep.mutationOptions());
  const replyMutation = useMutation(api.officer.replyStep.mutationOptions());
  const revokeMutation = useMutation(api.officer.revokeStamp.mutationOptions());
  const captureMutation = useMutation(
    api.officer.captureMugshot.mutationOptions(),
  );
  const { upload: uploadMugshot } = useStorageUpload("mugshotCapture");

  const [stampOpen, setStampOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [captureDismissed, setCaptureDismissed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [justVerified, setJustVerified] = useState(false);

  const [localStatus, setLocalStatus] = useState<StepStatus | null>(null);
  const [localStampName, setLocalStampName] = useState<string | null>(null);
  const [localStampGraphic, setLocalStampGraphic] = useState<string | null>(
    null,
  );
  const [localStampSignature, setLocalStampSignature] = useState<string | null>(
    null,
  );
  const [localStampAt, setLocalStampAt] = useState<string | null>(null);
  const [localRevocation, setLocalRevocation] = useState<{
    revokedByName: string;
    revokedAt: string;
  } | null>(null);
  const [localReply, setLocalReply] = useState<{
    chips: string[];
    note: string | null;
    respondedByName: string;
    respondedAt: string;
  } | null>(null);

  function resetLocal() {
    setStampOpen(false);
    setRevokeOpen(false);
    setReplyOpen(false);
    setLightboxIndex(-1);
    setCaptureDismissed(false);
    setAnnouncement("");
    setLocalStatus(null);
    setLocalStampName(null);
    setLocalStampGraphic(null);
    setLocalStampSignature(null);
    setLocalStampAt(null);
    setLocalRevocation(null);
    setLocalReply(null);
    setJustVerified(false);
  }

  const data: any = detailQuery.data;
  const step = data?.step ?? null;
  const student = data?.student ?? null;
  const status: StepStatus = localStatus ?? data?.status ?? "PENDING";
  const isVerified = status === "VERIFIED";

  const effectiveStamp = (() => {
    const q = data?.stamp;
    if (q)
      return {
        stampName: q.stampName ?? q.verifiedByName,
        stampGraphicUrl: q.stampGraphicUrl,
        stampSignatureUrl: q.stampSignatureUrl,
        verifiedAt: q.verifiedAt,
      };
    if (localStatus === "VERIFIED" && localStampAt)
      return {
        stampName: localStampName ?? "Officer",
        stampGraphicUrl: localStampGraphic,
        stampSignatureUrl: localStampSignature,
        verifiedAt: localStampAt,
      };
    return null;
  })();
  const effectiveRevocation = localRevocation ?? data?.revocation ?? null;
  const effectiveReply = localReply ?? data?.reply ?? null;
  const sendBackLabel =
    step?.code === "ASSESSMENT"
      ? "Missing requirements"
      : "Mark as wrong / Request reupload";
  const dialogStampName = (stampQuery.data as any)?.name ?? "Officer";
  const dateLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const busyAny =
    verifyMutation.isPending ||
    replyMutation.isPending ||
    revokeMutation.isPending ||
    captureMutation.isPending;
  const canStamp = !isVerified && !busyAny && Boolean(verificationId);

  function afterMutation(message: string) {
    setAnnouncement(message);
    queryClient.invalidateQueries({ queryKey: ["officer"] });
  }

  async function handleVerify() {
    await doVerify(
      verificationId,
      verifyMutation,
      stampQuery.data as never,
      (p) => {
        setLocalStatus(p.localStatus as StepStatus);
        setLocalStampName(p.localStampName);
        setLocalStampGraphic(p.localStampGraphic);
        setLocalStampSignature(p.localStampSignature);
        setLocalStampAt(p.localStampAt);
      },
      setStampOpen,
      setAnnouncement,
      setJustVerified,
    );
  }
  async function handleReply(chips: string[], note: string) {
    await doReply(
      verificationId,
      replyMutation,
      chips,
      note,
      officerName,
      (patch) => {
        if (patch.localStatus) setLocalStatus(patch.localStatus as StepStatus);
        if (patch.localReply) setLocalReply(patch.localReply as never);
      },
      setReplyOpen,
      setAnnouncement,
    );
  }
  async function handleRevoke() {
    await doRevoke(
      verificationId,
      revokeMutation,
      officerName,
      (patch) => {
        if (patch.localStatus) setLocalStatus(patch.localStatus as StepStatus);
        if (patch.localRevocation)
          setLocalRevocation(patch.localRevocation as never);
      },
      setRevokeOpen,
      setAnnouncement,
    );
  }
  async function handleCaptureSave(dataUrl: string) {
    await doCapture(
      dataUrl,
      verificationId,
      captureMutation,
      {
        uploadFile: async (file: File) => {
          const done = await uploadMugshot(file, {
            studentProfileId: (student as { id?: string })?.id,
          });
          return { key: done.fileKey, url: done.fileUrl };
        },
      },
      stampQuery.data as never,
      (patch) => {
        setLocalStatus(patch.localStatus as StepStatus);
        setLocalStampName(patch.localStampName as string | null);
        setLocalStampGraphic(patch.localStampGraphic as string | null);
        setLocalStampSignature(patch.localStampSignature as string | null);
        setLocalStampAt(patch.localStampAt as string);
      },
      setAnnouncement,
      setJustVerified,
    );
  }

  return {
    detailQuery,
    stampQuery,
    verifyMutation,
    replyMutation,
    revokeMutation,
    captureMutation,
    stampOpen,
    setStampOpen,
    revokeOpen,
    setRevokeOpen,
    replyOpen,
    setReplyOpen,
    lightboxIndex,
    setLightboxIndex,
    captureDismissed,
    setCaptureDismissed,
    announcement,
    setAnnouncement,
    justVerified,
    setJustVerified,
    afterMutation,
    data,
    step,
    student,
    status,
    isVerified,
    effectiveStamp,
    effectiveRevocation,
    effectiveReply,
    sendBackLabel,
    dialogStampName,
    dateLabel,
    busyAny,
    canStamp,
    resetLocal,
    handleVerify,
    handleReply,
    handleRevoke,
    handleCaptureSave,
  };
}
