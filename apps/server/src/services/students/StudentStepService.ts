import {
  PRE_ENROLLMENT_STEP_CODES,
  STEP_CODES,
  deriveStudentNumberFromEmail,
} from "../../config/constants.js";
import {
  KIND_FOR_STEP,
  evidenceUploadIds,
  stepHintFor,
} from "../../config/steps.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { ProfilingFormModel } from "../../models/ProfilingFormModel.js";
import { RequirementModel } from "../../models/RequirementModel.js";
import { SocialMediaLinkModel } from "../../models/SocialMediaLinkModel.js";
import type { StepRow } from "../../models/StepModel.js";
import { StepModel } from "../../models/StepModel.js";
import type { StepVerificationRow } from "../../models/StepVerificationModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UploadModel, type UploadRow } from "../../models/UploadModel.js";
import { UserModel } from "../../models/UserModel.js";
import {
  attachedEvidenceWire,
  buildStepRow,
  draftEvidenceWire,
  type EvidenceWire,
  type StudentStepWire,
} from "../../views/StudentStepView.js";
import { DraftEvidenceService } from "../evidence/DraftEvidenceService.js";
import type { EnrollmentSummary } from "./StudentProfileService.js";
import { StudentProfileService } from "./StudentProfileService.js";

const KNOWN_CODES = new Set<string>(STEP_CODES);

export type StudentSessionUser = {
  id: string;
  email: string;
  isOutsideOrg?: boolean;
};

export type StudentStepsView = {
  profile: {
    studentNumber: string | null;
    derivedStudentNumber: string | null;
    isOutsideOrg: boolean;
    enrollment: EnrollmentSummary | null;
    enrollments: EnrollmentSummary[];
  };
  hasActiveYear: boolean;
  academicYearId: string | null;
  academicYearLabel: string | null;
  semesterLabel: string | null;
  steps: StudentStepWire[];
  readyForQueue: boolean;
  allComplete: boolean;
  verifiedCount: number;
  progressPercent: number;
  queueStatus: string | null;
};

type ActorView = {
  name: string;
  stampName: string | null;
  stampGraphicUrl: string | null;
  stampSignatureUrl: string | null;
};

function actorView(user: {
  name?: string | null;
  stampName?: string | null;
  stampGraphicUrl?: string | null;
  stampSignatureUrl?: string | null;
}): ActorView {
  return {
    name: user.name ?? "SBO Officer",
    stampName: user.stampName ?? null,
    stampGraphicUrl: user.stampGraphicUrl ?? null,
    stampSignatureUrl: user.stampSignatureUrl ?? null,
  };
}

type RowInput = {
  verification: StepVerificationRow | null;
  requirements: { _id: string; label: string }[];
  profilingFormUrl: string | null;
  socialLinks: { _id: string; name: string; url: string }[];
  userById: Map<string, ActorView>;
  evidenceWire: EvidenceWire[];
  draftUploads: UploadRow[];
  draftsByKind: Map<string, UploadRow[]>;
  now: number;
};

function rowFor(step: StepRow, input: RowInput): StudentStepWire {
  const kind = KIND_FOR_STEP[step.code];
  const fileDrafts = kind ? (input.draftsByKind.get(kind) ?? []) : [];
  const externalDrafts = input.draftUploads.filter(
    (u) =>
      u.kind === "EXTERNAL_LINK" &&
      (u.fileKey ?? "").startsWith(`external:${step.code}:`),
  );
  return buildStepRow(
    step,
    input.verification,
    step.code === "ASSESSMENT"
      ? input.requirements.map((r) => ({ id: String(r._id), label: r.label }))
      : [],
    step.code === "PROFILING" ? input.profilingFormUrl : null,
    step.code === "SOCIAL_MEDIA"
      ? input.socialLinks.map((l) => ({
          id: String(l._id),
          name: l.name,
          url: l.url,
        }))
      : [],
    input.userById,
    input.evidenceWire,
    [
      ...fileDrafts.map((u) => draftEvidenceWire(u, input.now)),
      ...externalDrafts.map(attachedEvidenceWire),
    ],
  );
}

export class StudentStepService {
  static async load(user: StudentSessionUser): Promise<StudentStepsView> {
    const profile = await StudentProfileModel.findByUserId(user.id);
    const derivedStudentNumber =
      profile?.studentNumber ?? deriveStudentNumberFromEmail(user.email);

    const stepRows = (await StepModel.listOrdered()).filter((s) =>
      KNOWN_CODES.has(s.code),
    );
    const year = await AcademicYearModel.findActive();
    const enrollments = await StudentProfileService.listEnrollments(
      profile?._id ?? "",
    );

    if (!year) {
      return {
        profile: {
          studentNumber: profile?.studentNumber ?? null,
          derivedStudentNumber,
          isOutsideOrg: Boolean(user.isOutsideOrg),
          enrollment: null,
          enrollments,
        },
        hasActiveYear: false,
        academicYearId: null,
        academicYearLabel: null,
        semesterLabel: null,
        steps: stepRows.map((step) =>
          buildStepRow(step, null, [], null, [], new Map(), []),
        ),
        readyForQueue: false,
        allComplete: false,
        verifiedCount: 0,
        progressPercent: 0,
        queueStatus: null,
      };
    }

    const yearId = String(year._id);

    if (profile) {
      await DraftEvidenceService.sweep({
        studentProfileId: profile._id,
        userId: profile.userId,
      });
    }

    const [
      verifications,
      requirements,
      profilingForm,
      socialLinks,
      queueEntry,
    ] = await Promise.all([
      profile
        ? StepVerificationModel.listByProfileYear(profile._id, yearId)
        : Promise.resolve([] as StepVerificationRow[]),
      RequirementModel.listActive(),
      ProfilingFormModel.findByYear(yearId),
      SocialMediaLinkModel.listActive(),
      profile
        ? EnrollmentQueueModel.findByProfileYear(profile._id, yearId)
        : Promise.resolve(null),
    ]);

    const verificationByStep = new Map(
      verifications.map((v) => [String(v.stepId), v] as const),
    );

    const uploads = await UploadModel.findByIds(
      verifications.flatMap((v) => evidenceUploadIds(v.evidence)),
    );
    const draftUploads = profile
      ? await UploadModel.listForProfileSince(profile._id, year.createdAt)
      : [];

    const draftsByKind = new Map<string, UploadRow[]>();
    for (const upload of draftUploads) {
      const kind = upload.kind ?? "";
      const list = draftsByKind.get(kind) ?? [];
      list.push(upload);
      draftsByKind.set(kind, list);
    }

    const actorIds = new Set<string>();
    for (const verification of verifications) {
      if (verification.verifiedById) actorIds.add(verification.verifiedById);
      if (verification.respondedById) actorIds.add(verification.respondedById);
    }
    const actors = await UserModel.findByIds([...actorIds]);
    const userById = new Map(
      actors.map((actor) => [String(actor._id), actorView(actor)] as const),
    );

    const now = Date.now();
    const evidenceWire = uploads.map(attachedEvidenceWire);
    const rows = stepRows.map((step) =>
      rowFor(step, {
        verification: verificationByStep.get(String(step._id)) ?? null,
        requirements,
        profilingFormUrl: profilingForm?.formId
          ? (profilingForm.responderUri ?? null)
          : null,
        socialLinks,
        userById,
        evidenceWire,
        draftUploads,
        draftsByKind,
        now,
      }),
    );

    const statusByCode = new Map(rows.map((r) => [r.code, r.status] as const));
    const readyForQueue = PRE_ENROLLMENT_STEP_CODES.every(
      (code) => statusByCode.get(code) === "VERIFIED",
    );
    const queueStatus = queueEntry?.status ?? null;
    const presented = rows.map((row) => ({
      ...row,
      hint: stepHintFor(row.code, row.status, {
        readyForQueue,
        queueStatus,
        hasProfilingForm: row.profilingFormUrl != null,
      }),
    }));
    const verifiedCount = rows.filter((r) => r.status === "VERIFIED").length;

    return {
      profile: {
        studentNumber: profile?.studentNumber ?? null,
        derivedStudentNumber,
        isOutsideOrg: Boolean(user.isOutsideOrg),
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
      steps: presented,
      readyForQueue,
      allComplete: statusByCode.get("ENROLLMENT") === "VERIFIED",
      verifiedCount,
      progressPercent: Math.round((verifiedCount / STEP_CODES.length) * 100),
      queueStatus,
    };
  }
}
