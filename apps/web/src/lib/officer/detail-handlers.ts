import { queryClient } from "$lib/api";

type VerifyMutation = {
  mutateAsync: (p: { verificationId: string }) => Promise<unknown>;
};
type ReplyMutation = {
  mutateAsync: (p: {
    verificationId: string;
    chips: string[];
    note?: string;
  }) => Promise<unknown>;
};
type RevokeMutation = {
  mutateAsync: (p: { verificationId: string }) => Promise<unknown>;
};
type CaptureMutation = {
  mutateAsync: (p: {
    verificationId: string;
    fileKey: string;
    fileUrl: string;
  }) => Promise<unknown>;
};
type StampData =
  | {
      name: string | null;
      graphicUrl: string | null;
      signatureUrl: string | null;
    }
  | undefined;

export async function doVerify(
  verificationId: string | null,
  verifyMutation: VerifyMutation,
  stampData: StampData,
  setVerified: (patch: {
    localStatus: string;
    localStampName: string | null;
    localStampGraphic: string | null;
    localStampSignature: string | null;
    localStampAt: string;
  }) => void,
  setStampOpen: (v: boolean) => void,
  setAnnouncement: (m: string) => void,
  setJustVerified: (v: boolean) => void,
) {
  if (!verificationId) return;
  try {
    await verifyMutation.mutateAsync({ verificationId });
    setVerified({
      localStatus: "VERIFIED",
      localStampName: stampData?.name ?? null,
      localStampGraphic: stampData?.graphicUrl ?? null,
      localStampSignature: stampData?.signatureUrl ?? null,
      localStampAt: new Date().toISOString(),
    });
    setStampOpen(false);
    setAnnouncement("Verified");
    queryClient.invalidateQueries({ queryKey: ["officer"] });
    setJustVerified(true);
  } catch {
    setAnnouncement("Could not verify — please try again.");
  }
}

export async function doReply(
  verificationId: string | null,
  replyMutation: ReplyMutation,
  chips: string[],
  note: string,
  officerName: string,
  setState: (patch: Record<string, unknown>) => void,
  setReplyOpen: (v: boolean) => void,
  setAnnouncement: (m: string) => void,
) {
  if (!verificationId) return;
  try {
    await replyMutation.mutateAsync({
      verificationId,
      chips,
      note: note || undefined,
    });
    setState({
      localStatus: "RETURNED",
      localReply: {
        chips,
        note: note || null,
        respondedByName: officerName || "an officer",
        respondedAt: new Date().toISOString(),
      },
    });
    setReplyOpen(false);
    setAnnouncement("Submission returned to the student");
    queryClient.invalidateQueries({ queryKey: ["officer"] });
  } catch {
    setAnnouncement("Could not send the reply — please try again.");
  }
}

export async function doRevoke(
  verificationId: string | null,
  revokeMutation: RevokeMutation,
  officerName: string,
  setState: (patch: Record<string, unknown>) => void,
  setRevokeOpen: (v: boolean) => void,
  setAnnouncement: (m: string) => void,
) {
  if (!verificationId) return;
  try {
    await revokeMutation.mutateAsync({ verificationId });
    setState({
      localStatus: "PENDING",
      localRevocation: {
        revokedByName: officerName || "an officer",
        revokedAt: new Date().toISOString(),
      },
    });
    setRevokeOpen(false);
    setAnnouncement("Stamp revoked");
    queryClient.invalidateQueries({ queryKey: ["officer"] });
  } catch {
    setAnnouncement("Could not revoke the stamp — please try again.");
  }
}

export async function doCapture(
  dataUrl: string,
  verificationId: string | null,
  captureMutation: CaptureMutation,
  captureUpload: {
    uploadFile: (file: File) => Promise<{ key: string; url: string }>;
  },
  stampData: StampData,
  setVerified: (patch: Record<string, unknown>) => void,
  setAnnouncement: (m: string) => void,
  setJustVerified: (v: boolean) => void,
) {
  if (!verificationId) return;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "mugshot.jpg", { type: "image/jpeg" });
    const uploaded = await captureUpload.uploadFile(file);
    if (!uploaded) throw new Error("Mugshot upload failed.");
    await captureMutation.mutateAsync({
      verificationId,
      fileKey: uploaded.key,
      fileUrl: uploaded.url,
    });
    setVerified({
      localStatus: "VERIFIED",
      localStampName: stampData?.name ?? null,
      localStampGraphic: stampData?.graphicUrl ?? null,
      localStampSignature: stampData?.signatureUrl ?? null,
      localStampAt: new Date().toISOString(),
    });
    setAnnouncement("Verified");
    queryClient.invalidateQueries({ queryKey: ["officer"] });
    setJustVerified(true);
  } catch {
    setAnnouncement("Could not save the photo — please try again.");
  }
}

export function trapTabKey(e: KeyboardEvent, container: HTMLElement) {
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey) {
    if (
      document.activeElement === first ||
      !container.contains(document.activeElement)
    ) {
      e.preventDefault();
      last.focus();
    }
  } else if (
    document.activeElement === last ||
    !container.contains(document.activeElement)
  ) {
    e.preventDefault();
    first.focus();
  }
}
