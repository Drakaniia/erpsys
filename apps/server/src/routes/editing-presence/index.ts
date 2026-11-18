import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../config/errors.js";
import { canEnterSurface } from "../../config/roles.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { outsideTransaction } from "../../lib/db/timestamp-ordering.js";
import { requireSession, sessionUser, type SessionUser } from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parsePagination, parseQuery } from "../../middleware/http.js";
import { changePresence, listPresence, readPresence } from "../../models/EditingPresenceModel.js";
import { assertDepartmentAssigned, assertStudentLevelInScope } from "../../services/queues.js";
import { assertIntegrationKey } from "../../services/integrations.js";

/**
 * `/api/v1` — advisory editor presence, isolated from business transactions.
 */
export const editingPresenceRouter = Router();
const params = z.object({
  resource: z.enum(["academic-year", "department", "requirement", "adviser", "user", "stamp", "chatbot-knowledge", "profiling-form", "social-link", "schedule", "student-profile", "student-enrollment", "submission", "queue-entry", "integration"]),
  recordId: z.string().min(1).max(200),
});
const editorParams = params.extend({ editorId: z.string().regex(/^[\w-]{1,100}$/) });
const forbidden = () => new ApiError("FORBIDDEN", { message: "You cannot edit this record." });
const missing = () => new ApiError("NOT_FOUND", { message: "Record not found." });

type Row = { _id: unknown; [key: string]: unknown };
async function authorize(user: SessionUser, resource: z.infer<typeof params>["resource"], requestedId: string) {
  const db = getDbSync();
  const admin = user.role === "ADMIN";
  const officer = canEnterSurface(user.role, "officer");
  const instructor = canEnterSurface(user.role, "instructor");
  const student = canEnterSurface(user.role, "student");
  const find = async (collection: string, id: string): Promise<Row> => {
    const row = await db.collection<Row>(collection).findOne(idIn([id]) as never);
    if (!row) throw missing();
    return row;
  };
  if (["academic-year", "requirement", "adviser", "user", "chatbot-knowledge", "integration"].includes(resource) && !admin) throw forbidden();
  if (["social-link", "profiling-form", "submission", "stamp"].includes(resource) && !officer && !(resource === "submission" && student)) throw forbidden();
  if (resource === "integration") {
    assertIntegrationKey(requestedId);
    return requestedId;
  }
  if (resource === "chatbot-knowledge" || resource === "profiling-form") {
    if (requestedId !== "default") throw missing();
    if (resource === "profiling-form") {
      const year = await db.collection<Row>(COLLECTIONS.academicYear).findOne({ isActive: true });
      if (!year) throw missing();
      return String(year._id);
    }
    return "default";
  }
  if (resource === "schedule") {
    if (!instructor) throw forbidden();
    const [rawUserId, departmentId, extra] = requestedId.split("~");
    const userId = rawUserId === "me" ? user.id : rawUserId;
    if (extra || userId !== user.id || !departmentId) throw forbidden();
    await assertDepartmentAssigned(user.id, departmentId);
    const year = await db.collection<Row>(COLLECTIONS.academicYear).findOne({ isActive: true });
    if (!year) throw missing();
    return `${user.id}~${departmentId}~${year._id}`;
  }
  if (resource === "stamp") {
    const id = requestedId === "me" ? user.id : requestedId;
    if (id !== user.id) throw forbidden();
    await find(COLLECTIONS.user, id);
    return id;
  }
  const simple = {
    "academic-year": COLLECTIONS.academicYear, department: COLLECTIONS.department,
    requirement: COLLECTIONS.requirementItem, adviser: COLLECTIONS.user,
    user: COLLECTIONS.user, "social-link": COLLECTIONS.socialMediaLink,
  } as const;
  if (resource in simple) {
    if (resource === "department" && !instructor) throw forbidden();
    const row = await find(simple[resource as keyof typeof simple], requestedId);
    return String(row._id);
  }
  if (resource === "student-profile" || resource === "student-enrollment") {
    let profile: Row;
    if (requestedId === "me") {
      if (!student) throw forbidden();
      const row = await db.collection<Row>(COLLECTIONS.studentProfile).findOne({ userId: user.id });
      if (!row) throw missing();
      profile = row;
    } else profile = await find(COLLECTIONS.studentProfile, requestedId);
    if (String(profile.userId) !== user.id && !officer) throw forbidden();
    if (resource === "student-enrollment") {
      if (String(profile.userId) !== user.id || !student) throw forbidden();
      const year = await db.collection<Row>(COLLECTIONS.academicYear).findOne({ isActive: true });
      if (!year) throw missing();
      return `${profile._id}~${year._id}`;
    }
    return String(profile._id);
  }
  if (resource === "submission") {
    if (requestedId.startsWith("me~")) {
      if (!student) throw forbidden();
      const code = requestedId.slice(3);
      const [profile, step, year] = await Promise.all([
        db.collection<Row>(COLLECTIONS.studentProfile).findOne({ userId: user.id }),
        db.collection<Row>(COLLECTIONS.step).findOne({ code }),
        db.collection<Row>(COLLECTIONS.academicYear).findOne({ isActive: true }),
      ]);
      if (!profile || !step || !year) throw missing();
      const row = await db.collection<Row>(COLLECTIONS.stepVerification).findOne({
        studentProfileId: profile._id, stepId: step._id, academicYearId: String(year._id),
      });
      return row ? String(row._id) : `${profile._id}~${step._id}~${year._id}`;
    }
    const row = await find(COLLECTIONS.stepVerification, requestedId);
    if (!officer) {
      const profile = await find(COLLECTIONS.studentProfile, String(row.studentProfileId));
      if (!student || String(profile.userId) !== user.id) throw forbidden();
    }
    return String(row._id);
  }
  if (resource === "queue-entry") {
    const row = await find(COLLECTIONS.enrollmentQueue, requestedId);
    if (!instructor) throw forbidden();
    await assertDepartmentAssigned(user.id, String(row.departmentId));
    await assertStudentLevelInScope(user.id, String(row.departmentId), String(row.studentProfileId), String(row.academicYearId));
    return String(row._id);
  }
  throw forbidden();
}

/**
 * `GET /api/v1/editing-presence`
 * Access: session + admin surface.
 * Use: list active editing records — query `{ page?, pageSize? }`.
 * Returns: `{ data: [{ resource, recordId, editors }], page, pageSize, total }`.
 */
editingPresenceRouter.get("/editing-presence", requireSession, catchAsync(async (req, res) => {
  if (sessionUser(req).role !== "ADMIN") throw forbidden();
  const { page, pageSize } = parsePagination(req, 100);
  const result = await outsideTransaction(() => listPresence(page, pageSize));
  res.setHeader("Cache-Control", "private, no-store");
  okList(res, result.rows, page, pageSize, result.total);
}));

/**
 * `GET /api/v1/editing-presence/:resource/:recordId`
 * Access: session.
 * Use: read active editors after checking write access to the allowlisted resource.
 * Returns: `{ data: { resource, recordId, editors } }`; no business read stamps.
 */
editingPresenceRouter.get("/editing-presence/:resource/:recordId", requireSession, catchAsync(async (req, res) => {
  const { resource, recordId } = parseQuery(params, req);
  const result = await outsideTransaction(async () => readPresence(resource, await authorize(sessionUser(req), resource, recordId)));
  res.setHeader("Cache-Control", "private, no-store");
  okOne(res, result);
}));

/**
 * `PUT /api/v1/editing-presence/:resource/:recordId/:editorId`
 * Access: session.
 * Concurrency: atomic revision compare-and-swap; presence never stamps business `readTs` or `writeTs`.
 * Use: join or renew one tab's 60-second lease — empty body; identity and dates are server supplied.
 * Returns: `{ data: { resource, recordId, editors } }` after checking resource write access.
 */
editingPresenceRouter.put("/editing-presence/:resource/:recordId/:editorId", requireSession, catchAsync(async (req, res) => {
  const { resource, recordId, editorId } = parseQuery(editorParams, req);
  parseBody(z.object({}).strict(), req);
  const user = sessionUser(req);
  const result = await outsideTransaction(async () => changePresence(resource, await authorize(user, resource, recordId), user.id, editorId, user.name || "Unnamed editor"));
  res.setHeader("Cache-Control", "private, no-store");
  okOne(res, result);
}));

/**
 * `DELETE /api/v1/editing-presence/:resource/:recordId/:editorId`
 * Access: session.
 * Concurrency: atomic revision compare-and-swap; only this user's tab is removed.
 * Use: leave editing mode; leases also expire after missed heartbeats.
 * Returns: `{ data: { resource, recordId, editors } }`; no business timestamp changes.
 */
editingPresenceRouter.delete("/editing-presence/:resource/:recordId/:editorId", requireSession, catchAsync(async (req, res) => {
  const { resource, recordId, editorId } = parseQuery(editorParams, req);
  const user = sessionUser(req);
  const result = await outsideTransaction(async () => changePresence(resource, await authorize(user, resource, recordId), user.id, editorId));
  res.setHeader("Cache-Control", "private, no-store");
  okOne(res, result);
}));
