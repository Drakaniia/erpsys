import {
  chipForStatus,
  evidenceUploadIds,
  stepHintFor,
  type ChipTone,
} from "../config/steps.js";
import { expiresAtOf, isDraftExpired } from "../config/evidence.js";
import type { UploadRow } from "../models/UploadModel.js";
import type { StepRow } from "../models/StepModel.js";
import type { StepVerificationRow } from "../models/StepVerificationModel.js";

export type EvidenceWire = {
  id: string;
  fileKey: string | null;
  fileUrl: string;
  kind: string;
  expiresAt: string | null;
  expired: boolean;
};

export type StudentStepWire = {
  code: string;
  name: string;
  order: number;
  status: "PENDING" | "APPLIED" | "SUBMITTED" | "RETURNED" | "VERIFIED";
  hint: string;
  chip: { label: string; tone: ChipTone };
  appliedAt: string | null;
  evidence: EvidenceWire[];
  requirements: { id: string; label: string }[] | null;
  profilingFormUrl: string | null;
  socialMediaLinks: { id: string; name: string; url: string }[] | null;
  reply: {
    chips: string[];
    note: string | null;
    respondedByName: string;
    respondedAt: string;
  } | null;
  stamp: {
    verifiedByName: string;
    stampName: string | null;
    stampGraphicUrl: string | null;
    stampSignatureUrl: string | null;
    verifiedAt: string;
  } | null;
};

export const attachedEvidenceWire = (u: UploadRow): EvidenceWire => ({
  id: String(u._id),
  fileKey: u.fileKey ?? null,
  fileUrl: u.fileUrl ?? "",
  kind: u.kind ?? "",
  expiresAt: null,
  expired: false,
});

export const draftEvidenceWire = (u: UploadRow, now: number): EvidenceWire => ({
  id: String(u._id),
  fileKey: u.fileKey ?? null,
  fileUrl: u.fileUrl ?? "",
  kind: u.kind ?? "",
  expiresAt: expiresAtOf(u)?.toISOString() ?? null,
  expired: isDraftExpired(u, now),
});

type ActorView = {
  name: string;
  stampName?: string | null;
  stampGraphicUrl?: string | null;
  stampSignatureUrl?: string | null;
};

function statusOf(
  verification: StepVerificationRow | null,
): StudentStepWire["status"] {
  if (verification?.status === "VERIFIED") return "VERIFIED";
  if (verification?.status === "RETURNED") return "RETURNED";
  if (verification?.status === "SUBMITTED") return "SUBMITTED";
  return verification?.appliedAt ? "APPLIED" : "PENDING";
}

export function buildStepRow(
  step: StepRow,
  verification: StepVerificationRow | null,
  requirements: { id: string; label: string }[],
  profilingFormUrl: string | null,
  socialMediaLinks: { id: string; name: string; url: string }[],
  userById: Map<string, ActorView>,
  uploads: EvidenceWire[],
  draftUploads: EvidenceWire[] = [],
): StudentStepWire {
  const uploadById = new Map(uploads.map((u) => [u.id, u]));
  const referencedIds = new Set(
    verification ? evidenceUploadIds(verification.evidence) : [],
  );
  const referencedEvidence: EvidenceWire[] = verification
    ? evidenceUploadIds(verification.evidence)
        .map((id) => uploadById.get(id))
        .filter((u): u is EvidenceWire => Boolean(u))
    : [];
  const drafts = draftUploads.filter((u) => !referencedIds.has(u.id));
  const includeDrafts = !verification || verification.status === "RETURNED";

  const verifiedBy = verification?.verifiedById
    ? userById.get(verification.verifiedById)
    : undefined;
  const respondedBy = verification?.respondedById
    ? userById.get(verification.respondedById)
    : undefined;
  const status = statusOf(verification);
  const chips = Array.isArray(verification?.replyChips)
    ? verification.replyChips.filter((c): c is string => typeof c === "string")
    : [];

  return {
    code: step.code,
    name: step.name,
    order: step.order,
    status,
    hint: stepHintFor(step.code, status, {
      readyForQueue: false,
      queueStatus: null,
      hasProfilingForm: profilingFormUrl != null,
    }),
    chip: chipForStatus(status),
    appliedAt: verification?.appliedAt
      ? new Date(verification.appliedAt).toISOString()
      : null,
    evidence: includeDrafts
      ? [...referencedEvidence, ...drafts]
      : referencedEvidence,
    requirements: requirements.length > 0 ? requirements : null,
    profilingFormUrl,
    socialMediaLinks: socialMediaLinks.length > 0 ? socialMediaLinks : null,
    reply:
      verification?.status === "RETURNED" &&
      verification.respondedAt &&
      respondedBy
        ? {
            chips,
            note: verification.replyNote ?? null,
            respondedByName: respondedBy.name,
            respondedAt: new Date(verification.respondedAt).toISOString(),
          }
        : null,
    stamp:
      verification?.verifiedAt && verifiedBy
        ? {
            verifiedByName: verifiedBy.name,
            stampName: verifiedBy.stampName ?? verifiedBy.name,
            stampGraphicUrl: verifiedBy.stampGraphicUrl ?? null,
            stampSignatureUrl: verifiedBy.stampSignatureUrl ?? null,
            verifiedAt: new Date(verification.verifiedAt).toISOString(),
          }
        : null,
  };
}
