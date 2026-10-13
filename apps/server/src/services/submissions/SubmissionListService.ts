import { z } from "zod";
import { PRE_ENROLLMENT_STEP_CODES } from "../../config/constants.js";
import { evidenceUploadIds } from "../../config/steps.js";
import { ApiError } from "../../config/errors.js";
import { escapeQueryRegex } from "../../config/queue.js";
import { REPORT_ROW_CAP } from "../../config/report.js";
import { isR2FileKey } from "../../lib/storage/storage.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import type { AcademicYearRow } from "../../models/AcademicYearModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UploadModel } from "../../models/UploadModel.js";
import { UserModel } from "../../models/UserModel.js";

export const submissionListQuery = z.object({
  step: z.enum(PRE_ENROLLMENT_STEP_CODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(["submittedAt", "studentName", "status"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(100).default(""),
  status: z
    .enum(["ALL", "PENDING", "SUBMITTED", "VERIFIED", "RETURNED"])
    .default("ALL"),
  evidence: z.enum(["ALL", "HAS", "NONE"]).default("ALL"),
  range: z.enum(["ALL", "today", "7d", "30d", "year"]).default("ALL"),
});

export type SubmissionListInput = z.infer<typeof submissionListQuery>;

export type SubmissionFilterInput = Omit<
  SubmissionListInput,
  "page" | "pageSize"
>;

function displayNameOf(
  user: { name?: string | null; email?: string | null } | undefined,
): string {
  const name = user?.name?.trim() ?? "";
  if (name) return name;
  const local = user?.email?.split("@")[0]?.trim() ?? "";
  return local || "Unknown";
}

function displayImageOf(
  user: { image?: string | null } | undefined,
): string | null {
  const image = user?.image?.trim() ?? "";
  return image || null;
}

function isoOf(...dates: (Date | null | undefined)[]): string {
  const found = dates.find((date) => date);
  return found ? new Date(found).toISOString() : "";
}

function rangeClause(range: string, year: AcademicYearRow) {
  const now = Date.now();
  const from =
    range === "today"
      ? new Date(new Date().setHours(0, 0, 0, 0))
      : range === "7d"
        ? new Date(now - 7 * 86_400_000)
        : range === "30d"
          ? new Date(now - 30 * 86_400_000)
          : year.createdAt;
  return [{ appliedAt: { $gte: from } }, { appliedAt: { $exists: false } }];
}

export type SubmissionListItem = {
  verificationId: string;
  student: {
    id: string;
    name: string;
    studentNumber: string | null;
    image: string | null;
  };
  status: string;
  submittedAt: string;
  verifiedAt: string | null;
  evidence: {
    id: string;
    fileUrl: string;
    fileKey: string | null;
    mime: string | null;
    name: string | null;
    kind: string;
  }[];
  evidenceCount: number;
  hasReply: boolean;
  stepCode: string | null;
  stepName: string;
};

export class SubmissionListService {
  private static async where(
    year: AcademicYearRow,
    stepIds: string[],
    input: SubmissionFilterInput,
  ): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = {
      academicYearId: String(year._id),
      stepId: { $in: stepIds },
    };
    const text = input.q.trim();
    if (text) {
      const rx = { $regex: escapeQueryRegex(text), $options: "i" };
      const [byNumber, byName] = await Promise.all([
        StudentProfileModel.searchByStudentNumber(rx),
        UserModel.searchByName(rx),
      ]);
      const viaUser = await StudentProfileModel.listByUserIds(
        byName.map((user) => String(user._id)),
      );
      const ids = [
        ...new Set([
          ...byNumber.map((profile) => String(profile._id)),
          ...viaUser.map((profile) => String(profile._id)),
        ]),
      ];
      if (ids.length === 0) where["_id"] = "__no_match__";
      else where["studentProfileId"] = { $in: ids };
    }
    if (input.status !== "ALL") where["status"] = input.status;
    if (input.range !== "ALL") where["$or"] = rangeClause(input.range, year);
    if (input.evidence === "HAS") where["evidenceCount"] = { $gt: 0 };
    else if (input.evidence === "NONE") where["evidenceCount"] = 0;
    return where;
  }

  private static sortSpec(
    input: SubmissionFilterInput,
  ): Record<string, 1 | -1> {
    const direction = input.dir === "asc" ? 1 : -1;
    if (input.sort === "studentName") return { createdAt: direction };
    if (input.sort === "status")
      return { status: direction, createdAt: direction };
    return input.dir === "asc"
      ? { status: 1, createdAt: 1 }
      : { createdAt: -1 };
  }

  static async register(input: SubmissionFilterInput, stepCode: string) {
    const year = await AcademicYearService.activeOrThrow();
    const steps = await StepModel.listByCodes([stepCode]);
    if (steps.length === 0) {
      throw new ApiError("NOT_FOUND", { message: "Step not configured." });
    }
    const step = steps[0]!;
    const where = await SubmissionListService.where(
      year,
      [String(step._id)],
      input,
    );
    const [matchedCount, rows] = await Promise.all([
      StepVerificationModel.countWhere(where),
      StepVerificationModel.search(
        where,
        SubmissionListService.sortSpec(input),
        0,
        REPORT_ROW_CAP,
      ),
    ]);
    const profiles = await StudentProfileModel.findByIds([
      ...new Set(rows.map((row) => String(row.studentProfileId))),
    ]);
    const users = await UserModel.findByIds(
      profiles.map((profile) => String(profile.userId)),
    );
    const verifiers = await UserModel.findByIds(
      rows
        .map((row) => row.verifiedById)
        .filter((id): id is string => typeof id === "string"),
    );
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const verifierById = new Map(verifiers.map((u) => [String(u._id), u]));
    const items = rows.map((row) => {
      const profile = profileById.get(String(row.studentProfileId));
      const student = profile
        ? userById.get(String(profile.userId))
        : undefined;
      return {
        student: {
          studentProfileId: String(row.studentProfileId),
          name: displayNameOf(student),
          studentNumber: profile?.studentNumber ?? null,
        },
        status: String(row.status),
        submittedAt: isoOf(row.appliedAt, row.createdAt),
        verifiedAt: row.verifiedAt
          ? new Date(row.verifiedAt).toISOString()
          : null,
        verifiedByName: row.verifiedById
          ? (verifierById.get(String(row.verifiedById))?.name ?? null)
          : null,
        evidenceCount: evidenceUploadIds(row.evidence).length,
        hasReply: Boolean(row.respondedAt ?? row.replyNote),
      };
    });
    if (input.sort === "studentName") {
      items.sort((a, b) => {
        const cmp = a.student.name.localeCompare(b.student.name, undefined, {
          numeric: true,
        });
        return input.dir === "asc" ? cmp : -cmp;
      });
    }
    return {
      year: {
        id: String(year._id),
        label: year.label,
        semesterLabel: year.semesterLabel,
      },
      step: { code: stepCode, name: step.name ?? "" },
      rows: items,
      matchedCount,
      truncated: matchedCount > REPORT_ROW_CAP,
    };
  }

  static async page(input: SubmissionListInput) {
    const year = await AcademicYearService.activeOrThrow();
    const steps = await StepModel.listByCodes([
      ...(input.step ? [input.step] : [...PRE_ENROLLMENT_STEP_CODES]),
    ]);
    if (input.step && steps.length === 0) {
      throw new ApiError("NOT_FOUND", { message: "Step not configured." });
    }
    const stepIds = steps.map((step) => String(step._id));
    const where = await SubmissionListService.where(year, stepIds, input);
    const limit = input.pageSize;
    const [total, rows] = await Promise.all([
      StepVerificationModel.countWhere(where),
      StepVerificationModel.search(
        where,
        SubmissionListService.sortSpec(input),
        (input.page - 1) * limit,
        limit,
      ),
    ]);

    const profileIds = [
      ...new Set(rows.map((row) => String(row.studentProfileId))),
    ];
    const [profiles, uploads] = await Promise.all([
      StudentProfileModel.findByIds(profileIds),
      UploadModel.findByIds(
        rows.flatMap((row) => evidenceUploadIds(row.evidence)),
      ),
    ]);
    const users = await UserModel.findByIds(
      profiles.map((profile) => String(profile.userId)),
    );
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const uploadById = new Map(uploads.map((u) => [String(u._id), u]));
    const stepById = new Map(steps.map((step) => [String(step._id), step]));

    const items = rows.map((row) => {
      const profile = profileById.get(String(row.studentProfileId));
      const studentUser = profile
        ? userById.get(String(profile.userId))
        : undefined;
      const ids = evidenceUploadIds(row.evidence);
      const step = stepById.get(String(row.stepId));
      const item: SubmissionListItem = {
        verificationId: String(row._id),
        student: {
          id: String(row.studentProfileId),
          name: displayNameOf(studentUser),
          studentNumber: profile?.studentNumber ?? null,
          image: displayImageOf(studentUser),
        },
        status: String(row.status),
        submittedAt: isoOf(row.appliedAt, row.createdAt),
        verifiedAt: row.verifiedAt
          ? new Date(row.verifiedAt).toISOString()
          : null,
        evidence: ids
          .map((id) => {
            const upload = uploadById.get(id);
            return {
              id,
              fileUrl: upload?.fileUrl ?? "",
              fileKey: upload?.fileKey ?? null,
              mime: upload?.mimeType ?? null,
              name: null,
              kind: upload?.kind ?? "",
            };
          })
          .filter((entry) => entry.fileUrl || isR2FileKey(entry.fileKey)),
        evidenceCount: ids.length,

        hasReply: Boolean(row.respondedAt ?? row.replyNote),
        stepCode: step?.code ?? input.step ?? null,
        stepName: step?.name ?? "",
      };
      return item;
    });

    if (input.sort === "studentName") {
      items.sort((a, b) => {
        const cmp = a.student.name.localeCompare(b.student.name, undefined, {
          numeric: true,
        });
        return input.dir === "asc" ? cmp : -cmp;
      });
    }
    return { data: items, total };
  }
}
