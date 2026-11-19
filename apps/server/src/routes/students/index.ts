import { Router } from "express";
import { z } from "zod";
import {
  NOTIFICATION_STEPS_REMINDER,
  STEP_CODES,
  STUDENT_NUMBER_PATTERN,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { resolveYear } from "../../services/academic-years.js";
import {
  listStudents,
  rosterFilter,
  rosterStats,
} from "../../services/roster.js";
import {
  ensureProfileForYear,
  loadStudentSteps,
  myRecord,
  officerDetail,
  officerRecord,
  requireStudentContext,
  studentProfileStatus,
} from "../../services/students.js";
import { captureMugshot } from "../../services/submissions.js";

/**
 * `/api/v1` — student self paths and the officer/admin student views. Literal
 * `/me/student/profile` sits before `/me/student`.
 */
export const studentsRouter = Router();

const student = [requireSession, requireSurface("student")];
const instructor = [requireSession, requireSurface("instructor")];

const officerQuery = z.object({
  academicYearId: z.string().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
});

const listQuery = z.object({
  q: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sort: z.string().default("joined"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  role: z.string().default("ALL"),
  outside: z.string().default("ALL"),
  academicYearId: z.string().optional(),
  departmentId: z.string().optional(),
  yearLevel: z.string().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  unassigned: z.string().optional(),
  enrolled: z.string().optional(),
  stepState: z.string().optional(),
});

const boardQuery = z.object({
  academicYearId: z.string().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  sort: z.string().default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(100).optional(),
  stepState: z.string().optional(),
  enrolled: z.string().optional(),
  unassigned: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const noYear = () =>
  new ApiError("PRECONDITION_FAILED", {
    message: "No academic year is configured — ask an admin to add one first.",
  });

/**
 * `GET /api/v1/me/student/profile`
 * Access: session + student surface.
 * Use: has this student claimed a student number yet.
 * Returns: `{ data: profile status }`.
 */
studentsRouter.get(
  "/me/student/profile",
  student,
  catchAsync(async (req, res) => {
    okOne(res, await studentProfileStatus(sessionUser(req).id));
  }),
);

/**
 * `GET /api/v1/students`
 * Access: session.
 * Use: roster, directory or picker, by role and query (`q`, `role`, `outside`,
 * `academicYearId`, `departmentId`, `yearLevel`, `scope`, `enrolled`,
 * `stepState`, `unassigned`, paging).
 * Returns: `{ data, page, pageSize, total }`.
 */
studentsRouter.get(
  "/students",
  requireSession,
  catchAsync(async (req, res) => {
    const input = parseQuery(listQuery, req);
    const { items, total } = await listStudents(
      sessionUser(req),
      input,
      req.query as Record<string, unknown>,
    );
    okList(res, items, input.page, input.limit, total);
  }),
);

/**
 * `GET /api/v1/students/board`
 * Access: session + instructor surface.
 * Use: the students tab in one call — the roster page and its bucket stats,
 * from the same filters `/students` and `/reports/roster-stats` take, plus
 * `sort`, `dir`, `limit` and `cursor`.
 * Returns: `{ data: { roster, stats } }`.
 */
studentsRouter.get(
  "/students/board",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseQuery(boardQuery, req);
    const user = sessionUser(req);
    const scope = user.role === "ADMIN" ? "all" : input.scope;
    const query = { ...(req.query as Record<string, unknown>), scope };
    const [roster, stats] = await Promise.all([
      listStudents(
        user,
        {
          ...input,
          q: input.q ?? "",
          page: 1,
          pageSize: input.limit,
          role: "ALL",
          outside: "ALL",
          scope,
        },
        query,
      ),
      rosterStats(
        user.id,
        rosterFilter({ ...input, scope }, req.query as Record<string, unknown>),
      ),
    ]);
    okOne(res, {
      roster: {
        data: roster.items,
        page: 1,
        pageSize: input.limit,
        total: roster.total,
      },
      stats,
    });
  }),
);

/**
 * `POST /api/v1/students/reminders`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: nudge up to 200 students — body
 * `{ studentProfileIds, academicYearId? }`.
 * Returns: `{ data: send result }`.
 */
studentsRouter.post(
  "/students/reminders",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({
        studentProfileIds: z.array(z.string().min(1)).min(1).max(200),
        academicYearId: z.string().optional(),
      }),
      req,
    );
    const adviserId = sessionUser(req).id;
    const year = await resolveYear(input.academicYearId);
    if (!year) throw noYear();
    const yearId = String(year._id);
    const ids = [...new Set(input.studentProfileIds)];
    const [links, enrollments, verifications, completed, profiles, steps] =
      await Promise.all([
        AdviserDepartmentModel.listForAdviser(adviserId),
        StudentEnrollmentModel.listByProfiles(ids, yearId),
        StepVerificationModel.listByProfiles(ids, yearId),
        EnrollmentQueueModel.listCompletedProfiles(ids, yearId),
        StudentProfileModel.findByIds(ids),
        StepModel.listCodeMap(),
      ]);
    const myDepartments = new Set(links.map((link) => link.departmentId));
    const departmentOf = new Map(
      enrollments.map((row) => [
        String(row.studentProfileId),
        String(row.departmentId ?? ""),
      ]),
    );
    const userIdOf = new Map(
      profiles.map((profile) => [String(profile._id), String(profile.userId)]),
    );
    const completedProfiles = new Set(completed);
    const codeById = new Map(
      steps.map((step) => [String(step._id), step.code]),
    );
    const verifiedByProfile = new Map<string, Set<string>>();
    for (const row of verifications) {
      const code = codeById.get(String(row.stepId));
      if (row.status !== "VERIFIED" || !code) continue;
      const profileId = String(row.studentProfileId);
      verifiedByProfile.set(
        profileId,
        (verifiedByProfile.get(profileId) ?? new Set<string>()).add(code),
      );
    }

    const now = new Date();
    const rows = ids.flatMap((profileId) => {
      const departmentId = departmentOf.get(profileId);
      const verified = verifiedByProfile.get(profileId) ?? new Set<string>();
      const userId = userIdOf.get(profileId);
      if (
        (departmentId !== undefined && !myDepartments.has(departmentId)) ||
        completedProfiles.has(profileId) ||
        verified.has("ENROLLMENT") ||
        !userId
      ) {
        return [];
      }
      const pending = STEP_CODES.filter((code) => !verified.has(code)).length;
      return [
        {
          _id: genId("notification"),
          userId,
          type: NOTIFICATION_STEPS_REMINDER,
          title: "Pending requirements",
          body: `You still have ${pending} requirement(s) to complete for ${year.label} — open ERPSYS to continue.`,
          createdAt: now,
        },
      ];
    });
    await NotificationModel.insertMany(rows);
    okOne(res, { sent: rows.length, skipped: ids.length - rows.length });
  }),
);

/**
 * `GET /api/v1/me/student`
 * Access: session + student surface.
 * Use: my step chart.
 * Returns: `{ data: steps }`.
 */
studentsRouter.get(
  "/me/student",
  student,
  catchAsync(async (req, res) => {
    okOne(res, await loadStudentSteps(sessionUser(req)));
  }),
);

/**
 * `PATCH /api/v1/me/student`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: claim the student number — body `{ studentNumber }`, digits only.
 * Returns: `{ data: profile }`.
 */
studentsRouter.patch(
  "/me/student",
  student,
  catchAsync(async (req, res) => {
    const { studentNumber } = parseBody(
      z.object({
        studentNumber: z
          .string()
          .trim()
          .min(1, "Student number is required")
          .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed"),
      }),
      req,
    );
    const user = sessionUser(req);
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year yet.",
      });
    }
    const profile = await ensureProfileForYear({
      userId: user.id,
      email: user.email,
      studentNumber,
      academicYearId: year._id,
    });
    if (!profile) {
      throw new ApiError("BAD_REQUEST", {
        message: "Student number is required.",
      });
    }
    okOne(res, { studentNumber: profile.studentNumber });
  }),
);

/**
 * `GET /api/v1/students/:id/record`
 * Access: session.
 * Use: staff view of one student's verification record (query `academicYearId`,
 * `scope`).
 * Returns: `{ data: record }`.
 */
studentsRouter.get(
  "/students/:id/record",
  requireSession,
  catchAsync(async (req, res) => {
    const input = parseQuery(officerQuery, req);
    okOne(
      res,
      await officerRecord(
        sessionUser(req),
        String(req.params.id),
        input.academicYearId,
        input.scope,
      ),
    );
  }),
);

/**
 * `PUT /api/v1/students/:id/mugshot`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: store the capture and stamp at once — body `{ fileKey, fileUrl }`.
 * Returns: `{ data: record }`.
 */
studentsRouter.put(
  "/students/:id/mugshot",
  [requireSession, requireSurface("officer")],
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({
        fileKey: z.string().min(1).max(500),
        fileUrl: z.string().min(1).max(2_000_000),
      }),
      req,
    );
    okOne(
      res,
      await captureMugshot(sessionUser(req).id, String(req.params.id), input),
    );
  }),
);

/**
 * `GET /api/v1/students/:id`
 * Access: session.
 * Use: one student's steps, queue and enrollment (query `academicYearId`,
 * `scope`).
 * Returns: `{ data: student }`.
 */
studentsRouter.get(
  "/students/:id",
  requireSession,
  catchAsync(async (req, res) => {
    const input = parseQuery(officerQuery, req);
    okOne(
      res,
      await officerDetail(
        sessionUser(req),
        String(req.params.id),
        input.academicYearId,
        input.scope,
      ),
    );
  }),
);

/**
 * `GET /api/v1/me/record`
 * Access: session + student surface.
 * Use: my record sheet.
 * Returns: `{ data: record }`.
 */
studentsRouter.get(
  "/me/record",
  student,
  catchAsync(async (req, res) => {
    okOne(res, await myRecord(sessionUser(req).id));
  }),
);

/**
 * `POST /api/v1/me/assessment`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: apply for assessment.
 * Returns: `{ data: assessment }`.
 */
studentsRouter.post(
  "/me/assessment",
  student,
  catchAsync(async (req, res) => {
    const { profile, year } = await requireStudentContext(sessionUser(req));
    const step = await StepModel.findByCode("ASSESSMENT");
    if (!step) {
      throw new ApiError("NOT_FOUND", {
        message: "Assessment step not configured.",
      });
    }
    const key = {
      studentProfileId: profile._id,
      stepId: String(step._id),
      academicYearId: String(year._id),
    };
    const existing = await StepVerificationModel.findByStep(key);
    if (!existing) {
      const now = new Date();
      await StepVerificationModel.insert({
        _id: genId("verification"),
        ...key,
        status: "PENDING",
        appliedAt: now,
        createdAt: now,
      });
    } else if (existing.status === "VERIFIED") {
      okOne(res, { status: "VERIFIED" });
      return;
    } else if (!existing.appliedAt || existing.status === "RETURNED") {
      await StepVerificationModel.updateById(existing._id, {
        status: "PENDING",
        appliedAt: existing.appliedAt ?? new Date(),
      });
    }
    okOne(res, { status: "APPLIED" });
  }),
);
