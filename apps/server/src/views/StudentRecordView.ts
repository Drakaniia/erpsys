import { STEP_CODES, deriveDepartmentCode } from "../config/constants.js";
import { evidenceUploadIds } from "../config/steps.js";
import type { StudentEnrollmentRow } from "../models/StudentEnrollmentModel.js";
import type { QueueEntryRow } from "../models/EnrollmentQueueModel.js";
import type { StepVerificationRow } from "../models/StepVerificationModel.js";
import type { UserRow } from "../models/UserModel.js";

const STEP_STATUSES = [
  "MISSING",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "RETURNED",
] as const;
type RecordStepStatus = (typeof STEP_STATUSES)[number];

export type StudentRecordStep = {
  code: string;
  status: RecordStepStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  respondedAt: string | null;
  respondedByName: string | null;
  evidenceCount: number;
  replyChips: string[];
  replyNote: string | null;
};

export type StudentRecord = {
  student: {
    name: string;
    email: string;
    studentNumber: string | null;
    isOutsideOrg: boolean;
    createdAt: string;
  };
  year: { id: string; label: string; semesterLabel: string };
  enrollment: {
    departmentName: string;
    departmentCode: string;
    yearLevel: string;
    enrolledAt: string | null;
  } | null;
  enrolledAt: string | null;
  steps: StudentRecordStep[];
  queue: {
    status: string;
    joinedAt: string;
    servedAt: string | null;
    completedAt: string | null;
    servedByName: string | null;
  } | null;
};

export type StudentRecordSource = {
  year: { id: string; label: string; semesterLabel: string };
  profile: {
    _id: string;
    userId: string;
    studentNumber?: string | null;
    createdAt?: Date | null;
  };
  owner?: UserRow;
  enrollment: StudentEnrollmentRow | null;
  departmentName: string;
  verifications: StepVerificationRow[];
  codeByStepId: Map<string, string>;
  queue: QueueEntryRow | null;
  users: Map<string, UserRow>;
};

export function displayNameOf(
  user: Pick<UserRow, "name" | "email"> | undefined | null,
): string {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name;
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const local = email.split("@")[0]?.trim() ?? "";
  return local || "Unknown";
}

export function isoOrEmpty(
  ...candidates: Array<Date | string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "")
      continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
}

function stepStatus(status: string | null | undefined): RecordStepStatus {
  if (
    status === "VERIFIED" ||
    status === "RETURNED" ||
    status === "SUBMITTED"
  ) {
    return status;
  }
  return "PENDING";
}

function missingStep(code: string): StudentRecordStep {
  return {
    code,
    status: "MISSING",
    submittedAt: null,
    verifiedAt: null,
    verifiedByName: null,
    respondedAt: null,
    respondedByName: null,
    evidenceCount: 0,
    replyChips: [],
    replyNote: null,
  };
}

export function buildStudentRecord(source: StudentRecordSource): StudentRecord {
  const verificationByCode = new Map<string, StepVerificationRow>();
  for (const verification of source.verifications) {
    const code = source.codeByStepId.get(String(verification.stepId));
    if (!code || verificationByCode.has(code)) continue;
    verificationByCode.set(code, verification);
  }

  const nameOf = (id: string | null | undefined) =>
    id ? (source.users.get(String(id))?.name ?? null) : null;

  const steps = STEP_CODES.map((code): StudentRecordStep => {
    const verification = verificationByCode.get(code);
    if (!verification) return missingStep(code);
    return {
      code,
      status: stepStatus(verification.status),
      submittedAt:
        isoOrEmpty(verification.appliedAt, verification.createdAt) || null,
      verifiedAt: isoOrEmpty(verification.verifiedAt) || null,
      verifiedByName: nameOf(verification.verifiedById),
      respondedAt: isoOrEmpty(verification.respondedAt) || null,
      respondedByName: nameOf(verification.respondedById),
      evidenceCount: evidenceUploadIds(verification.evidence).length,
      replyChips: Array.isArray(verification.replyChips)
        ? verification.replyChips.filter(
            (chip): chip is string => typeof chip === "string",
          )
        : [],
      replyNote: verification.replyNote ?? null,
    };
  });

  const enrolledAt =
    isoOrEmpty(
      source.queue?.completedAt,
      verificationByCode.get("ENROLLMENT")?.verifiedAt,
    ) || null;

  return {
    student: {
      name: displayNameOf(source.owner),
      email: source.owner?.email ?? "",
      studentNumber: source.profile.studentNumber ?? null,
      isOutsideOrg: source.owner?.isOutsideOrg === true,
      createdAt: isoOrEmpty(source.owner?.createdAt, source.profile.createdAt),
    },
    year: source.year,
    enrollment: source.enrollment
      ? {
          departmentName: source.departmentName,
          departmentCode: source.departmentName
            ? deriveDepartmentCode(source.departmentName)
            : "",
          yearLevel: source.enrollment.yearLevel,
          enrolledAt,
        }
      : null,
    enrolledAt,
    steps,
    queue: source.queue
      ? {
          status: source.queue.status ?? "",
          joinedAt: isoOrEmpty(source.queue.joinedAt),
          servedAt: isoOrEmpty(source.queue.servedAt) || null,
          completedAt: isoOrEmpty(source.queue.completedAt) || null,
          servedByName: nameOf(source.queue.servedById),
        }
      : null,
  };
}
