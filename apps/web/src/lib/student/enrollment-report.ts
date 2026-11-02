import { api } from "$lib/api";
import { notify } from "$lib/notifications";
import { prepareReview, type PreparedReview } from "$lib/report/review";
import { reportsForRole } from "$lib/report/types";
import type { StudentRecord } from "$lib/domain/types";

/**
 * The one flow behind both doors (D4): the `ENROLLED` notification's action and
 * the Profile tab's button. There is exactly one generator, so the two entry
 * points cannot drift on filename, payload, or error handling.
 *
 * It is a factory rather than a plain module so each surface owns its own
 * state and two buttons never share a busy flag -- but it takes its three
 * effects as dependencies, which is what makes the whole flow testable without
 * pdfmake, the RPC link, or a toast library.
 *
 * It returns a RENDERED document rather than saving one: both doors open the
 * review modal and save only after the student confirms.
 */

/** The `kind` the notification action carries (D8). */
export const ENROLLMENT_REPORT_ACTION = "enrollment-report";

/**
 * The self-service note (D12). It is what makes a printed copy legible as the
 * student's own rather than institution-issued; the exact wording is a spec
 * open question, so it lives in one place to change cheaply.
 */
export const AUTHENTICITY_NOTE =
  "Generated from ERPSYS by the student; verify with the SBO office.";

/** One friendly message for every "not ready" cause (D10). */
export const NOT_READY_MESSAGE =
  "Your enrollment report isn't ready yet — finish your enrollment, then try again.";

export const REPORT_FAILED_MESSAGE =
  "Could not generate your enrollment report — try again.";

export type EnrollmentReportState =
  | "idle"
  | "preparing"
  | "notReady"
  | "failed";

export type EnrollmentReportDeps = {
  /** `student.getMyRecord` in production; `null` is "not ready". */
  getRecord: () => Promise<StudentRecord | null>;
  /** `prepareReview` in production; injected so tests skip pdfmake. */
  prepare: typeof prepareReview;
  /** The toast surface; injected so tests assert instead of popping one. */
  notify: (message: string, kind?: "success" | "error") => void;
};

/** The profile's own label, taken from the catalogue so it cannot drift. */
const RECORD_TITLE =
  reportsForRole("student").find((def) => def.kind === "record")?.label ??
  "Student Verification Record";

function defaults(): EnrollmentReportDeps {
  return {
    getRecord: () => api.student.getMyRecord.call(),
    prepare: prepareReview,
    notify,
  };
}

export function createEnrollmentReport(
  overrides: Partial<EnrollmentReportDeps> = {},
) {
  const deps: EnrollmentReportDeps = { ...defaults(), ...overrides };

  // ponytail: plain field, not useState — the factory is instantiated per
  // component via useMemo/useState initializer; add useSyncExternalStore
  // only if two surfaces ever share one instance.
  let state: EnrollmentReportState = "idle";
  // A plain flag, not `$derived`: it guards a second invocation that lands
  // before the first render, when `state` may still read "idle" (D14 double-click).
  let inFlight = false;

  /**
   * Renders the record sheet for review. `null` means there is nothing to
   * review: the student is not ready, or the render failed and a toast already
   * explained it. Saving is the caller's job (`saveReview`), so this factory
   * never writes a file on its own.
   */
  async function prepare(): Promise<PreparedReview | null> {
    if (inFlight) return null;
    inFlight = true;
    state = "preparing";
    try {
      const record = await deps.getRecord();
      if (!record) {
        // The not-ready state never reaches pdfmake (D10): no partial document
        // is ever produced for a student who is not yet enrolled.
        state = "notReady";
        return null;
      }
      const review = await deps.prepare({
        role: "student",
        kind: "record",
        title: RECORD_TITLE,
        description: reportsForRole("student")[0]?.description,
        generatedBy: record.student.name,
        yearLabel: record.year.label,
        semester: record.year.semesterLabel,
        discriminator: record.student.studentNumber ?? record.student.name,
        authenticityNote: AUTHENTICITY_NOTE,
        load: async () => [record],
      });
      state = "idle";
      return review;
    } catch {
      state = "failed";
      deps.notify(REPORT_FAILED_MESSAGE, "error");
      return null;
    } finally {
      inFlight = false;
    }
  }

  return {
    get state() {
      return state;
    },
    get isPending() {
      return state === "preparing";
    },
    prepare,
  };
}

export type EnrollmentReport = ReturnType<typeof createEnrollmentReport>;
