import { Router } from "express";
import { z } from "zod";
import {
  STUDENT_NUMBER_PATTERN,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  deriveDepartmentCode,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody } from "../../middleware/http.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { UserModel } from "../../models/UserModel.js";
import { complete, revert, revertMany } from "../../services/enrollments.js";
import {
  ensureProfileForYear,
  listEnrollments,
} from "../../services/students.js";

/**
 * `/api/v1` — the student's own enrollments, and the instructor's completion
 * and revert paths.
 */
export const enrollmentsRouter = Router();

const student = [requireSession, requireSurface("student")];
const instructor = [requireSession, requireSurface("instructor")];

const revertInput = z.object({
  departmentId: z.string().min(1),
  reason: z.string().min(10).max(500),
});

/**
 * `GET /api/v1/me/enrollments`
 * Access: session + student surface.
 * Use: every year I am enrolled in.
 * Returns: `{ data, page: 1, pageSize, total }`.
 */
enrollmentsRouter.get(
  "/me/enrollments",
  student,
  catchAsync(async (req, res) => {
    const [profile, year] = await Promise.all([
      UserModel.findProfileByUserId(sessionUser(req).id),
      AcademicYearModel.findActive(),
    ]);
    const summaries = profile ? await listEnrollments(profile._id) : [];
    const activeId = year ? String(year._id) : null;
    const rows = summaries.map((summary) => ({
      ...summary,
      isActiveYear: summary.academicYearId === activeId,
    }));
    okList(res, rows, 1, rows.length);
  }),
);

/**
 * `POST /api/v1/me/enrollments`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set or change the course for a year — body
 * `{ academicYearId, departmentId, yearLevel, studentNumber? }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.post(
  "/me/enrollments",
  student,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({
        academicYearId: z.string().min(1),
        departmentId: z.string().min(1),
        yearLevel: z.enum(YEAR_LEVELS),
        studentNumber: z
          .string()
          .trim()
          .min(1, "Student number is required")
          .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed")
          .optional(),
      }),
      req,
    );
    const user = sessionUser(req);
    const year = await AcademicYearModel.findById(input.academicYearId);
    if (!year) {
      throw new ApiError("BAD_REQUEST", {
        message: "Pick an academic year from the list.",
      });
    }
    const department = await DepartmentModel.findById(input.departmentId);
    if (!department || !department.isActive) {
      throw new ApiError("BAD_REQUEST", {
        message: "Pick a course from the list.",
      });
    }
    const profile = await ensureProfileForYear({
      userId: user.id,
      email: user.email,
      studentNumber: input.studentNumber,
      academicYearId: year._id,
    });
    if (!profile) {
      throw new ApiError("BAD_REQUEST", {
        message: "Student number is required.",
      });
    }

    const current = await StudentEnrollmentModel.findByProfileYear(
      profile._id,
      year._id,
    );
    const unchanged =
      current?.departmentId === input.departmentId &&
      current.yearLevel === input.yearLevel;
    if (
      !unchanged &&
      !departmentAcceptsLevel(department.yearLevels ?? [], input.yearLevel)
    ) {
      throw new ApiError("BAD_REQUEST", {
        message: `${department.name} doesn't offer ${YEAR_LEVEL_LABELS[input.yearLevel]}.`,
      });
    }
    if (!unchanged && current) {
      const entry = await EnrollmentQueueModel.findByProfileYear(
        profile._id,
        year._id,
      );
      if (entry) {
        throw new ApiError("CONFLICT", {
          message:
            entry.status === "COMPLETED"
              ? "You're already enrolled this year — ask an admin to change your course."
              : "Leave the queue before changing your course or year level.",
        });
      }
    }

    await StudentEnrollmentModel.upsert({
      studentProfileId: profile._id,
      academicYearId: year._id,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel,
    });
    okOne(res, {
      enrollment: {
        academicYearId: year._id,
        academicYearLabel: year.label,
        semesterLabel: year.semesterLabel,
        departmentId: String(department._id),
        departmentName: department.name,
        departmentCode: deriveDepartmentCode(department.name),
        yearLevel: input.yearLevel,
      },
      studentNumber: profile.studentNumber,
    });
  }),
);

/**
 * `DELETE /api/v1/enrollments/completions`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: undo 1–50 completions — body
 * `{ departmentId, reason, enrollmentIds | ids }`; literal path, so it never
 * falls to `/:id`.
 * Returns: `{ data: revert result }`.
 */
enrollmentsRouter.delete(
  "/enrollments/completions",
  instructor,
  catchAsync(async (req, res) => {
    const { departmentId, enrollmentIds, ids, reason } = parseBody(
      revertInput.extend({
        enrollmentIds: z.array(z.string().min(1)).min(1).max(50).optional(),
        ids: z.array(z.string().min(1)).min(1).max(50).optional(),
      }),
      req,
    );
    const bulkIds = [...new Set([...(enrollmentIds ?? []), ...(ids ?? [])])];
    if (bulkIds.length === 0 || bulkIds.length > 50) {
      throw new ApiError("BAD_REQUEST", {
        message: "Provide 1–50 enrollment ids.",
      });
    }
    okOne(
      res,
      await revertMany(sessionUser(req).id, departmentId, bulkIds, reason),
    );
  }),
);

/**
 * `POST /api/v1/enrollments/:id/completion`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: complete a served student — body `{ departmentId }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.post(
  "/enrollments/:id/completion",
  instructor,
  catchAsync(async (req, res) => {
    const { departmentId } = parseBody(
      z.object({ departmentId: z.string().min(1) }),
      req,
    );
    okOne(
      res,
      await complete(sessionUser(req).id, String(req.params.id), departmentId),
    );
  }),
);

/**
 * `DELETE /api/v1/enrollments/:id/completion`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: undo one enrollment — body `{ departmentId, reason }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.delete(
  "/enrollments/:id/completion",
  instructor,
  catchAsync(async (req, res) => {
    const { departmentId, reason } = parseBody(revertInput, req);
    okOne(
      res,
      await revert(
        sessionUser(req).id,
        String(req.params.id),
        departmentId,
        reason,
      ),
    );
  }),
);
