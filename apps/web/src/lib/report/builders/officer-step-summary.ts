import { STEP_CODES, stepLabel } from "$lib/domain/constants";
import {
  formatCount,
  formatDateTime,
  formatPercent,
  toWinAnsi,
} from "../format";
import {
  baseStyles,
  pageFurniture,
  sectionTitle,
  simpleTable,
} from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

/**
 * The subset of `officer.getOverview` (`apps/server/src/services/officer/overview.ts:24-47`)
 * that R2 prints. Field names are the server's; the types stay structural so
 * the oRPC output is assignable without importing the service module.
 */
export type StepStatusSummary = {
  steps: {
    code: string;
    name: string;
    order: number;
    unverified: number;
    verified: number;
  }[];
  recentActivity: {
    id: string;
    studentName: string;
    stepCode: string;
    stepName: string;
    action: string;
    at: string;
  }[];
  hasActiveYear: boolean;
  yearLabel: string | null;
};

/**
 * R2 (spec 6.2). Portrait, two blocks, and no filters -- so the filter echo is
 * forced off here rather than trusted from the caller, and the header can
 * never grow an empty "Filters:" line.
 */
export function buildStepStatusSummary(
  overview: StepStatusSummary,
  meta: ReportMeta,
): ReportDocDefinition {
  const byCode = new Map(overview.steps.map((step) => [step.code, step]));

  // STEP_CODES order, not the database's `order` field, so the table reads the
  // same as every other step list in the app. A code the officer console does
  // not track is left out rather than printed as a fabricated 0/0 -> 0%.
  const stepRows = STEP_CODES.flatMap((code) => {
    const step = byCode.get(code);
    if (!step) return [];
    const total = step.unverified + step.verified;
    return [
      [
        toWinAnsi(step.name || stepLabel(code)),
        formatCount(step.unverified),
        formatCount(step.verified),
        formatCount(total),
        formatPercent(step.verified, total),
      ],
    ];
  });

  const byStep = {
    ...simpleTable(
      ["Step", "Unverified", "Verified", "Total", "% verified"],
      stepRows,
      ["*", 60, 55, 50, 60],
    ),
    fontSize: 8,
  };

  const recent = {
    ...simpleTable(
      ["When", "Student", "Step", "Action"],
      overview.recentActivity.map((entry) => [
        formatDateTime(entry.at),
        toWinAnsi(entry.studentName),
        toWinAnsi(entry.stepName || stepLabel(entry.stepCode)),
        toWinAnsi(entry.action),
      ]),
      [95, "*", "*", 60],
    ),
    fontSize: 8,
  };

  const content: ContentNode[] = [
    sectionTitle("By step"),
    byStep,
    sectionTitle("Recent activity"),
    recent,
  ];

  return {
    ...pageFurniture({ ...meta, filterEcho: null }, "portrait"),
    styles: baseStyles(),
    content,
  };
}
