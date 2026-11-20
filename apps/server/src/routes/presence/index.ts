import { Router } from "express";
import { z } from "zod";
import type { Filter } from "mongodb";
import {
  PRE_ENROLLMENT_STEP_CODES,
  departmentAcceptsLevel,
  type YearLevel,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, idIn, rawDb } from "../../lib/db/db.js";
import { outsideTransaction } from "../../lib/db/timestamp-ordering.js";
import { INTEGRATION_KEYS } from "../../lib/platform/integration-settings.js";
import {
  leavePresence,
  touchPresence,
  type PresenceDocument,
  type PresenceTarget,
} from "../../lib/presence.js";
import {
  requireSession,
  sessionUser,
  type SessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody } from "../../middleware/http.js";

/**
 * `/api/v1` — first-arrival editor leases on records and collection-owned creation scopes.
 */
export const presenceRouter = Router();

const resources = {
  "academic-year": COLLECTIONS.academicYear,
  adviser: COLLECTIONS.department,
  "chatbot-knowledge": COLLECTIONS.chatbotKnowledge,
  department: COLLECTIONS.department,
  "queue-entry": COLLECTIONS.enrollmentQueue,
  requirement: COLLECTIONS.content,
  schedule: COLLECTIONS.adviserSchedule,
  "social-link": COLLECTIONS.content,
  submission: COLLECTIONS.stepVerification,
  user: COLLECTIONS.user,
  integration: COLLECTIONS.integrationSetting,
  "profiling-form": COLLECTIONS.academicYear,
  transfer: COLLECTIONS.departmentTransferRequest,
  enrollment: COLLECTIONS.enrollmentQueue,
  stamp: COLLECTIONS.user,
  "queue-share": COLLECTIONS.department,
} as const;

const input = z
  .object({
    resource: z.enum(
      Object.keys(resources) as [
        keyof typeof resources,
        ...(keyof typeof resources)[],
      ],
    ),
    id: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (id) => !id.startsWith("@edit-presence:"),
        "Use scope for creation presence.",
      )
      .optional(),
    scope: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
      .optional(),
    leaseId: z.uuid(),
  })
  .refine(
    (value) => !(value.id && value.scope),
    "Use either id or scope, not both.",
  );
type Input = z.infer<typeof input>;

const missing = () =>
  new ApiError("NOT_FOUND", { message: "Presence target not found." });
const forbidden = () =>
  new ApiError("FORBIDDEN", { message: "You cannot edit this resource." });

async function activeYear() {
  const year = await rawDb()
    .collection<PresenceDocument>(COLLECTIONS.academicYear)
    .findOne({ isActive: true, kind: { $ne: "edit-presence" } });
  if (!year)
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No active academic year.",
    });
  return year;
}

async function department(id: string) {
  const row = await rawDb()
    .collection<PresenceDocument>(COLLECTIONS.department)
    .findOne({ ...idIn([id]), kind: { $ne: "edit-presence" } });
  if (!row) throw missing();
  return row;
}

function assignment(
  row: PresenceDocument,
  userId: string,
): { adviserId: string; yearLevels?: YearLevel[] } | undefined {
  return (
    row.advisers as
      | { adviserId: string; yearLevels?: YearLevel[] }[]
      | undefined
  )?.find((link) => String(link.adviserId) === userId);
}

function assertRole(resource: Input["resource"], user: SessionUser) {
  const allowed = ["submission", "stamp"].includes(resource)
    ? ["SBO_OFFICER"]
    : [
          "schedule",
          "queue-entry",
          "transfer",
          "enrollment",
          "queue-share",
        ].includes(resource)
      ? ["ENROLLMENT_ADVISER"]
      : ["department", "adviser"].includes(resource)
        ? ["ADMIN", "ENROLLMENT_ADVISER"]
        : ["social-link", "profiling-form"].includes(resource)
          ? ["ADMIN", "SBO_OFFICER"]
          : ["ADMIN"];
  if (!allowed.includes(user.role ?? "")) throw forbidden();
}

async function markerTarget(
  value: Input,
  user: SessionUser,
): Promise<PresenceTarget> {
  const { resource } = value;
  if (["submission", "queue-entry", "enrollment"].includes(resource)) {
    throw new ApiError("BAD_REQUEST", {
      message: "This resource requires an existing record id.",
    });
  }
  let scope = value.scope ?? "new";
  if (resource === "schedule") {
    if (!value.scope)
      throw new ApiError("BAD_REQUEST", {
        message: "Schedule scope must be a department id.",
      });
    const dept = await department(scope);
    if (!assignment(dept, user.id)) throw forbidden();
    const year = await activeYear();
    scope = `${String(year._id)}:${user.id}:${scope}`;
  } else if (resource === "queue-share") {
    if (!value.scope)
      throw new ApiError("BAD_REQUEST", {
        message: "Queue-share scope must be a department id.",
      });
    const dept = await department(scope);
    if (!dept.isActive || !assignment(dept, user.id)) throw forbidden();
    scope = `${String((await activeYear())._id)}:${scope}`;
  } else if (resource === "transfer") {
    if (!value.scope)
      throw new ApiError("BAD_REQUEST", {
        message: "Transfer scope must be a department id.",
      });
    const dept = await department(scope);
    if (!dept.isActive) throw forbidden();
    scope = `${String((await activeYear())._id)}:${scope}`;
  } else if (resource === "profiling-form") {
    const yearId = String((await activeYear())._id);
    if (value.scope && value.scope !== yearId) throw forbidden();
    return {
      collection: COLLECTIONS.academicYear,
      filter: {
        ...idIn([yearId]),
        isActive: true,
        kind: { $ne: "edit-presence" },
      },
    };
  } else if (resource === "stamp") {
    if (value.scope)
      throw new ApiError("BAD_REQUEST", {
        message: "Stamp does not accept a scope.",
      });
    return {
      collection: COLLECTIONS.user,
      filter: {
        ...idIn([user.id]),
        role: "SBO_OFFICER",
        kind: { $ne: "edit-presence" },
      },
    };
  } else if (resource === "chatbot-knowledge") {
    if (value.scope && !["new", "default"].includes(value.scope))
      throw new ApiError("BAD_REQUEST", {
        message: "Knowledge uses its default shared scope.",
      });
    scope = "new";
  } else if (resource === "integration") {
    if (!(INTEGRATION_KEYS as readonly string[]).includes(scope)) {
      throw new ApiError("BAD_REQUEST", {
        message: "Integration scope must be an integration key.",
      });
    }
  }
  if (
    ![
      "schedule",
      "queue-share",
      "transfer",
      "integration",
      "chatbot-knowledge",
    ].includes(resource) &&
    scope !== "new"
  ) {
    throw new ApiError("BAD_REQUEST", {
      message: "Creation scope must be new.",
    });
  }
  const _id = `@edit-presence:${resource}:${scope}`;
  const marker: PresenceDocument = { _id, kind: "edit-presence" };
  if (resources[resource] === COLLECTIONS.user)
    marker.email = `${_id}@edit-presence.invalid`;
  if (resource === "integration") marker.key = _id;
  return {
    collection: resources[resource],
    filter: { _id, kind: "edit-presence" } as Filter<PresenceDocument>,
    marker,
  };
}

async function targetFor(
  value: Input,
  user: SessionUser,
): Promise<PresenceTarget> {
  assertRole(value.resource, user);
  if (value.resource === "adviser") {
    if (!value.id)
      throw new ApiError("BAD_REQUEST", {
        message: "Adviser requires an existing instructor id.",
      });
    const adviser = await rawDb()
      .collection<PresenceDocument>(COLLECTIONS.user)
      .findOne({
        ...idIn([value.id]),
        role: "ENROLLMENT_ADVISER",
        kind: { $ne: "edit-presence" },
      });
    if (!adviser) throw missing();
    if (user.role !== "ADMIN" && value.id !== user.id) throw forbidden();
    const _id = `@edit-presence:adviser:${value.id}`;
    return {
      collection: COLLECTIONS.department,
      filter: { _id, kind: "edit-presence" } as Filter<PresenceDocument>,
      marker: { _id, kind: "edit-presence" },
    };
  }
  if (!value.id) return markerTarget(value, user);
  const { resource, id } = value;
  if (resource === "queue-share")
    throw new ApiError("BAD_REQUEST", {
      message: "Queue-share requires a department scope, not an id.",
    });
  if (resource === "stamp" && id !== user.id) throw forbidden();
  const filter: Filter<PresenceDocument> = {
    ...idIn([id]),
    kind: { $ne: "edit-presence" },
  };
  if (resource === "requirement") filter.kind = "requirement";
  if (resource === "social-link") filter.kind = "socialLink";
  if (resource === "stamp") filter.role = "SBO_OFFICER";
  if (resource === "submission") {
    filter.academicYearId = String((await activeYear())._id);
    filter.stepId = { $in: [...PRE_ENROLLMENT_STEP_CODES] };
  }
  if (resource === "profiling-form") filter.isActive = true;
  const collection = resources[resource];
  const row = await rawDb()
    .collection<PresenceDocument>(collection)
    .findOne(filter);
  if (!row) throw missing();
  if (
    resource === "department" &&
    user.role === "ENROLLMENT_ADVISER" &&
    !assignment(row, user.id)
  )
    throw forbidden();
  if (resource === "schedule") {
    if (row.adviserId !== user.id) throw forbidden();
    const dept = await department(String(row.departmentId));
    if (!assignment(dept, user.id)) throw forbidden();
    filter.adviserId = user.id;
    filter.academicYearId = String((await activeYear())._id);
    if (String(row.academicYearId) !== filter.academicYearId) throw missing();
  }
  if (resource === "transfer") {
    if (row.ownerId !== user.id && row.requesterId !== user.id)
      throw forbidden();
    filter.$or = [{ ownerId: user.id }, { requesterId: user.id }];
  }
  if (resource === "queue-entry" || resource === "enrollment") {
    const yearId = String((await activeYear())._id);
    if (String(row.academicYearId) !== yearId) throw missing();
    const dept = await department(String(row.departmentId));
    const link = assignment(dept, user.id);
    if (
      !link ||
      (resource === "queue-entry" &&
        row.status === "IN_PROGRESS" &&
        row.servedById &&
        String(row.servedById) !== user.id)
    )
      throw forbidden();
    if (resource === "enrollment" && row.status !== "COMPLETED")
      throw forbidden();
    const enrollment = await rawDb()
      .collection<PresenceDocument>(COLLECTIONS.studentEnrollment)
      .findOne({
        studentProfileId: row.studentProfileId,
        academicYearId: yearId,
      });
    if (
      !enrollment ||
      String(enrollment.departmentId) !== String(row.departmentId) ||
      !departmentAcceptsLevel(
        link.yearLevels ?? [],
        enrollment.yearLevel as YearLevel,
      )
    )
      throw forbidden();
    filter.academicYearId = yearId;
    filter.departmentId = row.departmentId;
    filter.status = row.status;
    if (resource === "queue-entry" && row.status === "IN_PROGRESS")
      filter.servedById = row.servedById ?? null;
  }
  return { collection, filter };
}

/**
 * `POST /api/v1/presence`
 * Access: session.
 * Concurrency: atomic first-arrival lease queue outside timestamp ordering; renewals retain priority and no record timestamps change.
 * Use: renew a role- and ownership-scoped 30-second tab lease — body `{ resource, id?, scope?, leaseId }`; poll every five seconds.
 * Returns: `{ data: [] }` for the owning tab, otherwise `{ data: [{ userId, name, expiresAt }] }` naming the owner, without `ts`.
 */
presenceRouter.post(
  "/presence",
  requireSession,
  catchAsync((req, res) =>
    outsideTransaction(async () => {
      const value = parseBody(input, req);
      const user = sessionUser(req);
      const target = await targetFor(value, user);
      res.set("Cache-Control", "no-store");
      okOne(res, await touchPresence(target, value.leaseId, user));
    }),
  ),
);

/**
 * `DELETE /api/v1/presence`
 * Access: session.
 * Concurrency: atomic lease removal outside timestamp ordering; the next live tab owns editing and no record timestamps change.
 * Use: leave only the authenticated user's matching tab lease — body `{ resource, id?, scope?, leaseId }`.
 * Returns: `{ data: [{ userId, name, expiresAt }] }` naming the remaining owner, or `{ data: [] }`, without `ts`.
 */
presenceRouter.delete(
  "/presence",
  requireSession,
  catchAsync((req, res) =>
    outsideTransaction(async () => {
      const value = parseBody(input, req);
      const user = sessionUser(req);
      const target = await targetFor(value, user);
      res.set("Cache-Control", "no-store");
      okOne(res, await leavePresence(target, value.leaseId, user));
    }),
  ),
);
