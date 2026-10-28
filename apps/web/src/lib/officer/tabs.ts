import type { StepCode } from "./types";

export type OfficerTab =
  | "overview"
  | "assessment"
  | "social-media"
  | "profiling"
  | "mugshot"
  | "consent"
  | "social-media-links"
  | "profiling-form"
  | "reports";

export const OFFICER_TABS: ReadonlyArray<{
  id: OfficerTab;
  label: string;
  stepCode: StepCode | null;
  hint: string;
  key: string;
}> = [
  { id: "overview", label: "Overview", stepCode: null, hint: "", key: "0" },
  {
    id: "assessment",
    label: "Assessment",
    stepCode: "ASSESSMENT",
    hint: "Check SIMS balance",
    key: "1",
  },
  {
    id: "social-media",
    label: "Social Media",
    stepCode: "SOCIAL_MEDIA",
    hint: "Review screenshot",
    key: "2",
  },
  {
    id: "profiling",
    label: "Profiling",
    stepCode: "PROFILING",
    hint: "Review screenshot",
    key: "3",
  },
  {
    id: "mugshot",
    label: "Mugshot",
    stepCode: "MUGSHOT",
    hint: "Capture or review photo",
    key: "4",
  },
  {
    id: "consent",
    label: "Consent",
    stepCode: "CONSENT",
    hint: "Review scan",
    key: "5",
  },
  {
    id: "social-media-links",
    label: "Social Media Links",
    stepCode: null,
    hint: "",
    key: "6",
  },
  {
    id: "profiling-form",
    label: "Profiling Form",
    stepCode: null,
    hint: "",
    key: "7",
  },
  { id: "reports", label: "Reports", stepCode: null, hint: "", key: "8" },
] as const;

export const TAB_BY_ID = new Map(OFFICER_TABS.map((t) => [t.id, t]));
export const TAB_BY_STEP = new Map(
  OFFICER_TABS.filter((t) => t.stepCode).map((t) => [
    t.stepCode as StepCode,
    t,
  ]),
);

export function isOfficerTab(
  value: string | null | undefined,
): value is OfficerTab {
  return (
    value !== null && value !== undefined && TAB_BY_ID.has(value as OfficerTab)
  );
}
