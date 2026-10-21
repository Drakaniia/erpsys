import { Router } from "express";
import { studentsController } from "../../controllers/students/StudentsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — student self paths and the officer/admin student views. Literal
 * `/me/student/profile` sits before `/me/student`.
 */
export const studentsRouter = Router();

const student = [requireSession, requireSurface("student")];

/**
 * `GET /api/v1/me/student/profile`
 * Access: session + student surface.
 * Use: has this student claimed a student number yet.
 * Returns: `{ data: profile status }`.
 */
studentsRouter.get(
  "/me/student/profile",
  student,
  studentsController.myProfile,
);

/**
 * `GET /api/v1/students`
 * Access: session.
 * Use: roster, directory or picker, by role and query (`q`, `role`, `outside`,
 * `academicYearId`, `departmentId`, `yearLevel`, `scope`, `enrolled`,
 * `stepState`, `unassigned`, paging).
 * Returns: `{ data, page, pageSize, total }`.
 */
studentsRouter.get("/students", requireSession, studentsController.list);

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
  [requireSession, requireSurface("instructor")],
  studentsController.rosterBoard,
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
  [requireSession, requireSurface("instructor")],
  studentsController.reminders,
);

/**
 * `GET /api/v1/me/student`
 * Access: session + student surface.
 * Use: my step chart.
 * Returns: `{ data: steps }`.
 */
studentsRouter.get("/me/student", student, studentsController.mySteps);

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
  studentsController.saveStudentNumber,
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
  studentsController.officerRecord,
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
  studentsController.captureMugshot,
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
  studentsController.officerDetail,
);

/**
 * `GET /api/v1/me/record`
 * Access: session + student surface.
 * Use: my record sheet.
 * Returns: `{ data: record }`.
 */
studentsRouter.get("/me/record", student, studentsController.myRecord);

/**
 * `POST /api/v1/me/assessment`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: apply for assessment.
 * Returns: `{ data: assessment }`.
 */
studentsRouter.post("/me/assessment", student, studentsController.assessment);
