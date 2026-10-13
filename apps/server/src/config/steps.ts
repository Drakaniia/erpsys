import { z } from "zod";
import { STEP_CODES, UPLOAD_STEP_CODES } from "./constants.js";

export const KIND_FOR_STEP: Record<string, string> = {
  SOCIAL_MEDIA: "SOCIAL_SCREENSHOT",
  PROFILING: "PROFILING_SCREENSHOT",
  MUGSHOT: "MUGSHOT",
  CONSENT: "CONSENT_SCAN",
};

export const uploadStepCodeSchema = z.enum(UPLOAD_STEP_CODES);

export type ChipTone = "success" | "warning" | "info" | "muted";

export function chipForStatus(status: string): {
  label: string;
  tone: ChipTone;
} {
  switch (status) {
    case "VERIFIED":
      return { label: "Verified", tone: "success" };
    case "RETURNED":
      return { label: "Returned", tone: "warning" };
    case "APPLIED":
      return { label: "Applied", tone: "info" };
    case "SUBMITTED":
      return { label: "Pending review", tone: "info" };
    default:
      return { label: "Pending", tone: "muted" };
  }
}

const STEP_HINTS: Record<string, string> = {
  ASSESSMENT: "Apply for assessment",
  SOCIAL_MEDIA: "Upload screenshot",
  PROFILING: "Complete the form",
  MUGSHOT: "Upload photo",
  CONSENT: "Upload signed papers",
};

export type StepHintContext = {
  readyForQueue: boolean;
  queueStatus: string | null;
  hasProfilingForm: boolean;
};

export function stepHintFor(
  code: string,
  status: string,
  ctx: StepHintContext,
): string {
  if (status === "VERIFIED") {
    return code === "ENROLLMENT" ? "Enrolled" : "";
  }
  if (status === "RETURNED") return "Review the officer's reply";
  if (status === "APPLIED" || status === "SUBMITTED")
    return "Awaiting officer review";

  if (code === "PROFILING") {
    return ctx.hasProfilingForm ? STEP_HINTS.PROFILING : "See SBO office";
  }
  if (code === "ENROLLMENT") {
    if (ctx.queueStatus === "IN_PROGRESS") return "Adviser is serving you";
    if (ctx.queueStatus) return "Waiting in queue";
    return ctx.readyForQueue ? "You can now queue" : "Complete steps 1–5 first";
  }
  return STEP_HINTS[code] ?? "";
}

export function progressOf(statuses: readonly string[]): {
  verifiedCount: number;
  progressPercent: number;
} {
  const verifiedCount = statuses.filter((s) => s === "VERIFIED").length;
  return {
    verifiedCount,
    progressPercent: Math.round((verifiedCount / STEP_CODES.length) * 100),
  };
}

export function evidenceUploadIds(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== "object") return [];
  const ids = (evidence as { uploadIds?: unknown }).uploadIds;
  return Array.isArray(ids)
    ? ids.filter((x): x is string => typeof x === "string")
    : [];
}
