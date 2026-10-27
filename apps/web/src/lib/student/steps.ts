import type { QueueEntry, StepCode, StepRow } from "./types";

export const STEP_META: Record<
  StepCode,
  { number: number; name: string; hint: string }
> = {
  ASSESSMENT: { number: 1, name: "Assessment", hint: "Apply for assessment" },
  SOCIAL_MEDIA: { number: 2, name: "Social Media", hint: "Upload screenshot" },
  PROFILING: { number: 3, name: "Profiling", hint: "Complete the form" },
  MUGSHOT: { number: 4, name: "Mugshot", hint: "Upload photo" },
  CONSENT: {
    number: 5,
    name: "Consent / Medical",
    hint: "Upload signed papers",
  },
  ENROLLMENT: { number: 6, name: "Enrollment", hint: "Join the queue" },
};

export const STEP_ORDER: StepCode[] = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
  "ENROLLMENT",
];

/**
 * Server-owned presentation: `GET /api/v1/me/student` ships `hint` + `chip` per
 * step, so every client (web, mobile, desktop) renders one set of rules.
 * The context arg stays so call sites don't churn; it is ignored.
 */
export function stepHint(
  step: StepRow,
  _ctx?: { readyForQueue: boolean; queue: QueueEntry | null },
): string {
  return typeof step.hint === "string" ? step.hint : "";
}

export type ChipStyle = {
  label: string;
  classes: string;
  icon?: "check";
};

// Presentation stays in the web app (tone -> Tailwind); the rule
// (which label/tone a status gets) lives on the server.
const TONE_CLASSES: Record<string, string> = {
  success: "bg-primary text-white",
  warning: "bg-warning/15 text-warning",
  info: "bg-primary/10 text-primary",
  muted: "bg-ink/5 text-muted",
};

export function chipFor(step: StepRow): ChipStyle {
  const chip = (step as { chip?: { label?: unknown; tone?: unknown } }).chip;
  if (chip && typeof chip.label === "string") {
    const tone = typeof chip.tone === "string" ? chip.tone : "muted";
    return {
      label: chip.label,
      classes: TONE_CLASSES[tone] ?? TONE_CLASSES.muted,
      ...(tone === "success" ? { icon: "check" as const } : {}),
    };
  }
  return { label: "Pending", classes: TONE_CLASSES.muted };
}
