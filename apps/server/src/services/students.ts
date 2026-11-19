import {
  PRE_ENROLLMENT_STEP_CODES,
  STEP_CODES,
  STUDENT_NUMBER_IN_USE_MESSAGE,
  deriveDepartmentCode,
  deriveStudentNumberFromEmail,
  type YearLevel,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import {
  KIND_FOR_STEP,
  chipForStatus,
  evidenceUploadIds,
  stepHintFor,
} from "../config/steps.js";
import { getDbSync } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";
import { purgeUserById } from "../lib/db/user-purge.js";
import type { SessionUser } from "../middleware/auth.js";
import type { AcademicYearRow } from "../models/AcademicYearModel.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";

import { RequirementModel } from "../models/RequirementModel.js";
import { SocialMediaLinkModel } from "../models/SocialMediaLinkModel.js";
import { StepModel, type StepRow } from "../models/StepModel.js";
import {
  StepVerificationModel,
  type StepVerificationRow,
} from "../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";
import {
  StudentProfileModel,
  type StudentProfileRow,
} from "../models/StudentProfileModel.js";
import { UploadModel, type UploadRow } from "../models/UploadModel.js";
import { UserModel, type UserRow } from "../models/UserModel.js";
import { resolveYear } from "./academic-years.js";
import {
  attachedEvidence,
  draftEvidence,
  sweepDrafts,
  type EvidenceWire,
} from "./evidence.js";
import { displayName } from "./submissions.js";

const KNOWN_CODES = new Set<string>(STEP_CODES);

type StepContext = {
  requirements: { _id: string; label: string }[];
  profilingFormUrl: string | null;
  socialLinks: { _id: string; name: string; url: string }[];
  actors: Map<string, UserRow>;
  evidenceById: Map<string, EvidenceWire>;
  draftUploads: UploadRow[];
  now: number;
  readyForQueue: boolean;
  queueStatus: string | null;
};

const iso = (date: Date | string | null | undefined) =>
  date ? new Date(date).toISOString() : null;

const chipsOf = (verification: StepVerificationRow) =>
  Array.isArray(verification.replyChips)
    ? verification.replyChips.filter((c): c is string => typeof c === "string")
    : [];

const stepStatus = (verification: StepVerificationRow | null | undefined) =>
  verification?.status === "VERIFIED" ||
  verification?.status === "RETURNED" ||
  verification?.status === "SUBMITTED"
    ? verification.status
    : verification?.appliedAt
      ? "APPLIED"
      : "PENDING";

function stepRow(
  step: StepRow,
  verification: StepVerificationRow | null,
  ctx: StepContext,
) {
  const status = stepStatus(verification);
  const referencedIds = verification
    ? evidenceUploadIds(verification.evidence)
    : [];
  const referenced = referencedIds.flatMap(
    (id) => ctx.evidenceById.get(id) ?? [],
  );
  const kind = KIND_FOR_STEP[step.code];
  const drafts = [
    ...ctx.draftUploads
      .filter((u) => kind && u.kind === kind)
      .map((u) => draftEvidence(u, ctx.now)),
    ...ctx.draftUploads
      .filter(
        (u) =>
          u.kind === "EXTERNAL_LINK" &&
          (u.fileKey ?? "").startsWith(`external:${step.code}:`),
      )
      .map(attachedEvidence),
  ].filter((u) => !referencedIds.includes(u.id));
  const actor = (id: string | null | undefined) =>
    id ? ctx.actors.get(id) : undefined;
  const verifiedBy = actor(verification?.verifiedById);
  const respondedBy = actor(verification?.respondedById);
  const requirements =
    step.code === "ASSESSMENT"
      ? ctx.requirements.map((r) => ({ id: String(r._id), label: r.label }))
      : [];
  const socialMediaLinks =
    step.code === "SOCIAL_MEDIA"
      ? ctx.socialLinks.map((l) => ({
          id: String(l._id),
          name: l.name,
          url: l.url,
        }))
      : [];

  return {
    code: step.code,
    name: step.name,
    order: step.order,
    status,
    hint: stepHintFor(step.code, status, {
      readyForQueue: ctx.readyForQueue,
      queueStatus: ctx.queueStatus,
      hasProfilingForm: ctx.profilingFormUrl != null,
    }),
    chip: chipForStatus(status),
    appliedAt: iso(verification?.appliedAt),
    evidence:
      !verification || verification.status === "RETURNED"
        ? [...referenced, ...drafts]
        : referenced,
    requirements: requirements.length > 0 ? requirements : null,
    profilingFormUrl: step.code === "PROFILING" ? ctx.profilingFormUrl : null,
    socialMediaLinks: socialMediaLinks.length > 0 ? socialMediaLinks : null,
    reply:
      verification?.status === "RETURNED" &&
      verification.respondedAt &&
      respondedBy
        ? {
            chips: chipsOf(verification),
            note: verification.replyNote ?? null,
            respondedByName: respondedBy.name ?? "SBO Officer",
            respondedAt: new Date(verification.respondedAt).toISOString(),
          }
        : null,
    stamp:
      verification?.verifiedAt && verifiedBy
        ? {
            verifiedByName: verifiedBy.name ?? "SBO Officer",
            stampName: verifiedBy.stampName ?? verifiedBy.name ?? "SBO Officer",
            stampGraphicUrl: verifiedBy.stampGraphicUrl ?? null,
            stampSignatureUrl: verifiedBy.stampSignatureUrl ?? null,
            verifiedAt: new Date(verification.verifiedAt).toISOString(),
          }
        : null,
  };
}

export async function requireStudentContext(user: { id: string }) {
  const [profile, year] = await Promise.all([
    StudentProfileModel.findByUserId(user.id),
    AcademicYearModel.findActive(),
  ]);
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No active academic year yet.",
    });
  }
  if (!profile) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Save your student number first.",
    });
  }
  return { profile, year };
}

export async function studentProfileStatus(userId: string) {
  const profile = await StudentProfileModel.findByUserId(userId);
  return {
    hasProfile: profile !== null,
    studentNumber: profile?.studentNumber ?? null,
  };
}

export async function ensureProfileForYear(params: {
  userId: string;
  email: string;
  studentNumber?: string | null;
  academicYearId: string;
}): Promise<StudentProfileRow | null> {
  const { userId, email, academicYearId } = params;
  const existing = await StudentProfileModel.findByUserId(userId);
  if (existing) return existing;

  const studentNumber =
    params.studentNumber?.trim() || deriveStudentNumberFromEmail(email);
  if (!studentNumber) return null;

  const createFresh = async (): Promise<StudentProfileRow> => {
    const doc = {
      _id: genId("profile"),
      userId,
      studentNumber,
      academicYearId,
    };
    await StudentProfileModel.insert(doc);
    return doc;
  };
  const inUse = () =>
    new ApiError("CONFLICT", { message: STUDENT_NUMBER_IN_USE_MESSAGE });

  const colliding =
    await StudentProfileModel.findByStudentNumber(studentNumber);
  if (!colliding) {
    try {
      return await createFresh();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const retry =
        await StudentProfileModel.findByStudentNumber(studentNumber);
      if (!retry) throw error;
      if (retry.userId === userId) return retry;
      throw inUse();
    }
  }
  if (colliding.userId === userId) return colliding;

  const owner = await UserModel.findById(colliding.userId);
  if (owner?.blockedAt) {
    await purgeUserById(getDbSync(), String(owner._id));
    return createFresh();
  }
  if (deriveStudentNumberFromEmail(email) !== studentNumber || !owner?.email) {
    throw inUse();
  }
  if (deriveStudentNumberFromEmail(owner.email) === studentNumber) {
    throw new ApiError("CONFLICT", {
      message:
        "This student number is already claimed — contact the SBO office.",
    });
  }
  await StudentProfileModel.assignUser(colliding._id, userId);
  await purgeUserById(getDbSync(), colliding.userId);
  return (
    (await StudentProfileModel.findById(colliding._id)) ?? {
      ...colliding,
      userId,
    }
  );
}

export async function listEnrollments(studentProfileId: string): Promise<
  {
    academicYearId: string;
    academicYearLabel: string;
    semesterLabel: string;
    departmentId: string;
    departmentName: string;
    departmentCode: string;
    yearLevel: YearLevel;
  }[]
> {
  const rows = await StudentEnrollmentModel.listByProfile(studentProfileId);
  if (rows.length === 0) return [];
  const [years, departments] = await Promise.all([
    AcademicYearModel.findByIds(rows.map((r) => r.academicYearId)),
    DepartmentModel.findByIds(rows.map((r) => r.departmentId)),
  ]);
  const yearById = new Map(years.map((y) => [String(y._id), y]));
  const departmentById = new Map(departments.map((d) => [String(d._id), d]));
  const createdAt = (id: string) => yearById.get(id)?.createdAt?.getTime() ?? 0;
  return rows
    .map((row) => {
      const year = yearById.get(row.academicYearId);
      const department = departmentById.get(row.departmentId);
      return {
        academicYearId: row.academicYearId,
        academicYearLabel: year?.label ?? "",
        semesterLabel: year?.semesterLabel ?? "",
        departmentId: row.departmentId,
        departmentName: department?.name ?? "",
        departmentCode: department ? deriveDepartmentCode(department.name) : "",
        yearLevel: row.yearLevel,
      };
    })
    .sort((a, b) => createdAt(b.academicYearId) - createdAt(a.academicYearId));
}

export async function loadStudentSteps(user: SessionUser) {
  const profile = await StudentProfileModel.findByUserId(user.id);
  const steps = (await StepModel.listOrdered()).filter((s) =>
    KNOWN_CODES.has(s.code),
  );
  const year = await AcademicYearModel.findActive();
  const enrollments = await listEnrollments(profile?._id ?? "");
  const identity = {
    studentNumber: profile?.studentNumber ?? null,
    derivedStudentNumber:
      profile?.studentNumber ?? deriveStudentNumberFromEmail(user.email),
    isOutsideOrg: Boolean(user.isOutsideOrg),
  };

  if (!year) {
    const empty: StepContext = {
      requirements: [],
      profilingFormUrl: null,
      socialLinks: [],
      actors: new Map(),
      evidenceById: new Map(),
      draftUploads: [],
      now: Date.now(),
      readyForQueue: false,
      queueStatus: null,
    };
    return {
      profile: { ...identity, enrollment: null, enrollments },
      hasActiveYear: false,
      academicYearId: null,
      academicYearLabel: null,
      semesterLabel: null,
      steps: steps.map((step) => stepRow(step, null, empty)),
      readyForQueue: false,
      allComplete: false,
      verifiedCount: 0,
      progressPercent: 0,
      queueStatus: null,
    };
  }

  const yearId = String(year._id);
  if (profile) await sweepDrafts(profile._id, profile.userId);
  const [verifications, requirements, profilingForm, socialLinks, queueEntry] =
    await Promise.all([
      profile
        ? StepVerificationModel.listByProfileYear(profile._id, yearId)
        : [],
      RequirementModel.listActive(),
      AcademicYearModel.profilingForm(yearId),
      SocialMediaLinkModel.listActive(),
      profile
        ? EnrollmentQueueModel.findByProfileYear(profile._id, yearId)
        : null,
    ]);
  const uploads = await UploadModel.findByIds(
    verifications.flatMap((v) => evidenceUploadIds(v.evidence)),
  );
  const draftUploads = profile
    ? await UploadModel.listForProfileSince(profile._id, year.createdAt)
    : [];
  const actors = await UserModel.findByIds([
    ...new Set(
      verifications.flatMap((v) =>
        [v.verifiedById, v.respondedById].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ]);

  const verificationOf = new Map(
    verifications.map((v) => [String(v.stepId), v]),
  );
  const verification = (step: StepRow) =>
    verificationOf.get(String(step._id)) ?? null;
  const statusByCode = new Map(
    steps.map((step) => [step.code, stepStatus(verification(step))]),
  );
  const readyForQueue = PRE_ENROLLMENT_STEP_CODES.every(
    (code) => statusByCode.get(code) === "VERIFIED",
  );
  const queueStatus = queueEntry?.status ?? null;
  const ctx: StepContext = {
    requirements,
    profilingFormUrl: profilingForm?.formId
      ? (profilingForm.responderUri ?? null)
      : null,
    socialLinks,
    actors: new Map(actors.map((actor) => [String(actor._id), actor])),
    evidenceById: new Map(
      uploads.map((u) => [String(u._id), attachedEvidence(u)]),
    ),
    draftUploads,
    now: Date.now(),
    readyForQueue,
    queueStatus,
  };
  const rows = steps.map((step) => stepRow(step, verification(step), ctx));
  const verifiedCount = rows.filter((r) => r.status === "VERIFIED").length;

  return {
    profile: {
      ...identity,
      enrollment:
        enrollments.find((e) => e.academicYearId === yearId) ??
        enrollments[0] ??
        null,
      enrollments,
    },
    hasActiveYear: true,
    academicYearId: yearId,
    academicYearLabel: year.label,
    semesterLabel: year.semesterLabel,
    steps: rows,
    readyForQueue,
    allComplete: statusByCode.get("ENROLLMENT") === "VERIFIED",
    verifiedCount,
    progressPercent: Math.round((verifiedCount / STEP_CODES.length) * 100),
    queueStatus,
  };
}

function isoOrEmpty(...candidates: (Date | string | null | undefined)[]) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") {
      continue;
    }
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
}

async function studentRecord(studentProfileId: string, year: AcademicYearRow) {
  const yearId = String(year._id);
  const profile = await StudentProfileModel.findById(studentProfileId);
  if (!profile) return null;
  const profileId = String(profile._id);
  const [enrollment, verifications, queue, stepRows] = await Promise.all([
    StudentEnrollmentModel.findByProfileYear(profileId, yearId),
    StepVerificationModel.listByProfileYear(profileId, yearId),
    EnrollmentQueueModel.findByProfileYear(profileId, yearId),
    StepModel.listCodeMap(),
  ]);
  const actorIds = [
    profile.userId,
    queue?.servedById,
    ...verifications.flatMap((v) => [v.verifiedById, v.respondedById]),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const [users, department] = await Promise.all([
    UserModel.findByIds([...new Set(actorIds)]),
    enrollment ? DepartmentModel.findById(enrollment.departmentId) : null,
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const nameOf = (id: string | null | undefined) =>
    id ? (userById.get(String(id))?.name ?? null) : null;
  const owner = userById.get(String(profile.userId));
  const codeByStepId = new Map(stepRows.map((s) => [String(s._id), s.code]));
  const verificationByCode = new Map<string, StepVerificationRow>();
  for (const verification of verifications) {
    const code = codeByStepId.get(String(verification.stepId));
    if (code && !verificationByCode.has(code)) {
      verificationByCode.set(code, verification);
    }
  }
  const enrolledAt =
    isoOrEmpty(
      queue?.completedAt,
      verificationByCode.get("ENROLLMENT")?.verifiedAt,
    ) || null;
  const departmentName = department?.name ?? "";

  return {
    student: {
      name: displayName(owner),
      email: owner?.email ?? "",
      studentNumber: profile.studentNumber ?? null,
      isOutsideOrg: owner?.isOutsideOrg === true,
      createdAt: isoOrEmpty(owner?.createdAt, profile.createdAt),
    },
    year: { id: yearId, label: year.label, semesterLabel: year.semesterLabel },
    enrollment: enrollment
      ? {
          departmentName,
          departmentCode: departmentName
            ? deriveDepartmentCode(departmentName)
            : "",
          yearLevel: enrollment.yearLevel,
          enrolledAt,
        }
      : null,
    enrolledAt,
    steps: STEP_CODES.map((code) => {
      const v = verificationByCode.get(code);
      return {
        code,
        status: v
          ? v.status === "VERIFIED" ||
            v.status === "RETURNED" ||
            v.status === "SUBMITTED"
            ? v.status
            : "PENDING"
          : "MISSING",
        submittedAt: (v && isoOrEmpty(v.appliedAt, v.createdAt)) || null,
        verifiedAt: (v && isoOrEmpty(v.verifiedAt)) || null,
        verifiedByName: nameOf(v?.verifiedById),
        respondedAt: (v && isoOrEmpty(v.respondedAt)) || null,
        respondedByName: nameOf(v?.respondedById),
        evidenceCount: v ? evidenceUploadIds(v.evidence).length : 0,
        replyChips: v ? chipsOf(v) : [],
        replyNote: v?.replyNote ?? null,
      };
    }),
    queue: queue
      ? {
          status: queue.status ?? "",
          joinedAt: isoOrEmpty(queue.joinedAt),
          servedAt: isoOrEmpty(queue.servedAt) || null,
          completedAt: isoOrEmpty(queue.completedAt) || null,
          servedByName: nameOf(queue.servedById),
        }
      : null,
  };
}

export async function myRecord(userId: string) {
  const year = await AcademicYearModel.findActive();
  const profile = year && (await StudentProfileModel.findByUserId(userId));
  const record =
    year && profile ? await studentRecord(profile._id, year) : null;
  const enrollment = record?.steps.find((step) => step.code === "ENROLLMENT");
  return enrollment?.status === "VERIFIED" ? record : null;
}

async function officerYear(
  actor: { role?: string },
  academicYearId: string | undefined,
) {
  if (actor.role === "STUDENT") {
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
  const year = await resolveYear(academicYearId);
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message:
        "No academic year is configured — ask an admin to add one first.",
    });
  }
  return year;
}

async function assertInScope(adviserId: string, departmentId: string) {
  if (
    departmentId &&
    !(await AdviserDepartmentModel.findLink(adviserId, departmentId))
  ) {
    throw new ApiError("FORBIDDEN", {
      message: "This student belongs to another department.",
    });
  }
}

export async function officerRecord(
  actor: SessionUser,
  studentProfileId: string,
  academicYearId: string | undefined,
  scope: "mine" | "all",
) {
  const year = await officerYear(actor, academicYearId);
  if (actor.role === "ENROLLMENT_ADVISER" && scope !== "all") {
    const enrollment = await StudentEnrollmentModel.findByProfileYear(
      studentProfileId,
      String(year._id),
    );
    if (enrollment) {
      await assertInScope(actor.id, String(enrollment.departmentId));
    }
  }
  const record = await studentRecord(studentProfileId, year);
  if (!record) {
    throw new ApiError("NOT_FOUND", { message: "Student not found." });
  }
  return record;
}

export async function officerDetail(
  actor: SessionUser,
  studentProfileId: string,
  academicYearId: string | undefined,
  requestedScope: "mine" | "all",
) {
  const year = await officerYear(actor, academicYearId);
  const scope = actor.role === "ENROLLMENT_ADVISER" ? requestedScope : "all";
  const yearId = String(year._id);
  const profile = await StudentProfileModel.findById(studentProfileId);
  if (!profile) {
    throw new ApiError("NOT_FOUND", { message: "Student not found." });
  }
  const pid = String(profile._id);
  const [enrollment, steps, verifications, queue, owner] = await Promise.all([
    StudentEnrollmentModel.findByProfileYear(pid, yearId),
    StepModel.listOrdered(),
    StepVerificationModel.listByProfileYear(pid, yearId),
    EnrollmentQueueModel.findByProfileYear(pid, yearId),
    UserModel.findById(String(profile.userId)),
  ]);
  if (enrollment && scope !== "all") {
    await assertInScope(actor.id, String(enrollment.departmentId));
  }
  const actors = await UserModel.findByIds([
    ...new Set(
      verifications.flatMap((v) =>
        [v.verifiedById, v.respondedById].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ]);
  const nameById = new Map(actors.map((u) => [String(u._id), u.name ?? ""]));
  const nameOf = (id: string | null | undefined) =>
    id ? (nameById.get(String(id)) ?? null) : null;
  const verificationOf = new Map(
    verifications.map((v) => [String(v.stepId), v]),
  );
  const stepRows = steps.map((step) => {
    const v = verificationOf.get(String(step._id));
    return {
      code: step.code,
      name: step.name,
      order: step.order,
      status: v?.status ?? "MISSING",
      submittedAt: iso(v?.appliedAt),
      verifiedAt: iso(v?.verifiedAt),
      verifiedByName: nameOf(v?.verifiedById),
      respondedAt: iso(v?.respondedAt),
      respondedByName: nameOf(v?.respondedById),
      replyNote: v?.replyNote ?? null,
    };
  });
  const [department, queueDepartment] = await Promise.all([
    enrollment
      ? DepartmentModel.findById(String(enrollment.departmentId))
      : null,
    queue ? DepartmentModel.findById(String(queue.departmentId)) : null,
  ]);

  return {
    student: {
      studentProfileId: pid,
      studentName: owner?.name ?? "",
      studentNumber: profile.studentNumber ?? null,
    },
    year: { id: yearId, label: year.label, semesterLabel: year.semesterLabel },
    enrollment:
      enrollment && department
        ? {
            academicYearId: yearId,
            academicYearLabel: year.label,
            semesterLabel: year.semesterLabel,
            departmentId: String(enrollment.departmentId),
            departmentName: department.name,
            departmentCode: deriveDepartmentCode(department.name),
            yearLevel: enrollment.yearLevel,
          }
        : null,
    steps: stepRows,
    queue: queue
      ? {
          status: queue.status,
          departmentId: String(queue.departmentId),
          departmentName: queueDepartment?.name ?? "",
          departmentCode: queueDepartment
            ? deriveDepartmentCode(queueDepartment.name)
            : "",
          joinedAt: iso(queue.joinedAt),
          servedAt: iso(queue.servedAt),
          completedAt: iso(queue.completedAt),
        }
      : null,
    pendingRequirements: STEP_CODES.filter(
      (code) =>
        stepRows.find((row) => row.code === code)?.status !== "VERIFIED",
    ).length,
  };
}
