import { describe, expect, it, vi } from "vitest";
import { STEP_CODES } from "$lib/domain/constants";
import type { StudentRecord } from "$lib/domain/types";
import {
  AUTHENTICITY_NOTE,
  NOT_READY_MESSAGE,
  REPORT_FAILED_MESSAGE,
  createEnrollmentReport,
  type EnrollmentReportDeps,
} from "./enrollment-report";
import type { PreparedReview } from "$lib/report/review";

/**
 * The flow is driven entirely through injected effects, so these tests assert
 * the contract D5/D10/D13 describe: `null` becomes a not-ready state that never
 * reaches the generator, a record becomes exactly one `prepareReview` call
 * with the student-role inputs, and a failure becomes a failed state plus one
 * error toast. No pdfmake, no RPC link, and no save -- the flow only ever
 * returns a document for the review modal to show.
 */

function record(over: Partial<StudentRecord> = {}): StudentRecord {
  return {
    student: {
      name: "Juan Dela Cruz",
      email: "2401117078@student.buksu.edu.ph",
      studentNumber: "2401117078",
      isOutsideOrg: false,
      createdAt: "2026-08-01T02:00:00.000Z",
    },
    year: { id: "ay1", label: "2026-2027", semesterLabel: "First Semester" },
    enrollment: null,
    enrolledAt: null,
    steps: STEP_CODES.map((code) => ({
      code,
      status:
        code === "ENROLLMENT" ? ("VERIFIED" as const) : ("MISSING" as const),
      submittedAt: null,
      verifiedAt: null,
      verifiedByName: null,
      respondedAt: null,
      respondedByName: null,
      evidenceCount: 0,
      replyChips: [],
      replyNote: null,
    })),
    queue: null,
    ...over,
  };
}

const PREPARED: PreparedReview = {
  summary: {
    title: "Student Verification Record",
    description: null,
    generatedBy: "Juan Dela Cruz",
    period: "AY 2026-2027 \u00b7 First Semester",
    filters: [],
    returnedCount: null,
    matchedCount: null,
    capNotice: "",
    filename: "student-record-2401117078-2026-09-30.pdf",
    authenticityNote: AUTHENTICITY_NOTE,
  },
  blob: new Blob(),
  url: "blob:review",
};

type Harness = {
  deps: EnrollmentReportDeps;
  prepare: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  getRecord: ReturnType<typeof vi.fn>;
};

function harness(over: Partial<EnrollmentReportDeps> = {}): Harness {
  const getRecord = vi.fn(async () => record());
  const prepare = vi.fn(async () => PREPARED);
  const notify = vi.fn();
  const deps = {
    getRecord,
    prepare,
    notify,
    ...over,
  } as unknown as EnrollmentReportDeps;
  return { deps, prepare, notify, getRecord };
}

describe("createEnrollmentReport", () => {
  it("starts idle", () => {
    const flow = createEnrollmentReport(harness().deps);
    expect(flow.state).toBe("idle");
    expect(flow.isPending).toBe(false);
  });

  it("prepares the student-role record for review when a record is ready", async () => {
    const { deps, prepare } = harness();
    const flow = createEnrollmentReport(deps);

    await expect(flow.prepare()).resolves.toBe(PREPARED);

    expect(prepare).toHaveBeenCalledTimes(1);
    const input = prepare.mock.calls[0][0];
    expect(input).toMatchObject({
      role: "student",
      kind: "record",
      title: "Student Verification Record",
      description: expect.stringContaining("verification record"),
      generatedBy: "Juan Dela Cruz",
      yearLabel: "2026-2027",
      semester: "First Semester",
      discriminator: "2401117078",
      authenticityNote: AUTHENTICITY_NOTE,
    });
    // The builder gets exactly the loaded record.
    await expect(input.load()).resolves.toEqual([record()]);
    expect(flow.state).toBe("idle");
  });

  it("falls back to the name when the student has no number", async () => {
    const { deps, prepare } = harness({
      getRecord: async () =>
        record({ student: { ...record().student, studentNumber: null } }),
    } as Partial<EnrollmentReportDeps>);
    const flow = createEnrollmentReport(deps);

    await flow.prepare();

    expect(prepare.mock.calls[0][0].discriminator).toBe("Juan Dela Cruz");
  });

  it("maps a null record to the not-ready state and never prepares a document", async () => {
    const { deps, prepare } = harness({
      getRecord: async () => null,
    } as Partial<EnrollmentReportDeps>);
    const flow = createEnrollmentReport(deps);

    await expect(flow.prepare()).resolves.toBeNull();

    expect(flow.state).toBe("notReady");
    expect(prepare).not.toHaveBeenCalled();
    expect(NOT_READY_MESSAGE).toMatch(/isn't ready yet/i);
  });

  it("maps a render failure to the failed state and one error toast", async () => {
    const { deps, notify } = harness({
      prepare: (async () => {
        throw new Error("pdfmake chunk blocked");
      }) as unknown as EnrollmentReportDeps["prepare"],
    } as Partial<EnrollmentReportDeps>);
    const flow = createEnrollmentReport(deps);

    await expect(flow.prepare()).resolves.toBeNull();

    expect(flow.state).toBe("failed");
    expect(notify).toHaveBeenCalledWith(REPORT_FAILED_MESSAGE, "error");
  });

  it("ignores a second invocation that lands while the first is in flight", async () => {
    let release!: (value: StudentRecord | null) => void;
    const gate = new Promise<StudentRecord | null>((resolve) => {
      release = resolve;
    });
    const { deps, prepare } = harness({
      getRecord: () => gate,
    } as Partial<EnrollmentReportDeps>);
    const flow = createEnrollmentReport(deps);

    const first = flow.prepare();
    const second = flow.prepare();
    expect(flow.isPending).toBe(true);
    expect(prepare).not.toHaveBeenCalled();

    release(record());
    await Promise.all([first, second]);

    // Exactly one document for a double-click, not two.
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
