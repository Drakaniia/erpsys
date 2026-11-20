import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../config/errors.js";
import {
  COLLECTIONS,
  getDbSync,
  idIn,
  type CollectionName,
} from "../lib/db/db.js";
import { outsideTransaction, unguardDb } from "../lib/db/timestamp-ordering.js";
import { presenceOwner, type PresenceDocument } from "../lib/presence.js";
import { requireSession, sessionUser } from "./auth.js";

type Target = { collection: CollectionName; filter: Record<string, unknown> };
const leases = z.array(z.uuid()).max(100);

async function targets(req: Request): Promise<Target[]> {
  const db = unguardDb(getDbSync());
  const user = sessionUser(req);
  const body = req.body ?? {};
  const parts = req.path.split("/").filter(Boolean).map(decodeURIComponent);
  const [rawArea, id, rawAction] = parts;
  const area = rawArea?.toLowerCase();
  const action = rawAction?.toLowerCase();
  const record = (collection: CollectionName, value: string): Target => ({
    collection,
    filter: idIn([value]),
  });
  const marker = (
    collection: CollectionName,
    resource: string,
    scope = "new",
  ): Target => ({
    collection,
    filter: {
      _id: `@edit-presence:${resource}:${scope}`,
      kind: "edit-presence",
    },
  });
  const year = async () =>
    String(
      (
        await db
          .collection(COLLECTIONS.academicYear)
          .findOne({ isActive: true, kind: { $ne: "edit-presence" } })
      )?._id ?? "",
    );
  const rows = (
    collection: CollectionName,
    filter: Record<string, unknown>,
  ): Target[] => [{ collection, filter }];
  const ids = (values: unknown): string[] =>
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string")
      : [];
  if (area === "departments")
    return [
      id
        ? record(COLLECTIONS.department, id)
        : marker(COLLECTIONS.department, "department"),
    ];
  if (area === "academic-years")
    return [
      id
        ? record(COLLECTIONS.academicYear, id)
        : marker(COLLECTIONS.academicYear, "academic-year"),
    ];
  if (area === "requirements" || area === "social-links") {
    const collection = COLLECTIONS.content;
    const resource = area === "requirements" ? "requirement" : "social-link";
    if (id?.toLowerCase() === "order")
      return rows(collection, {
        kind: resource === "requirement" ? "requirement" : "socialLink",
        ...(resource === "requirement" ? {} : idIn(ids(body.orderedIds))),
      });
    return [id ? record(collection, id) : marker(collection, resource)];
  }
  if (area === "users") {
    if (id?.toLowerCase() === "invite")
      return [marker(COLLECTIONS.user, "user")];
    return id
      ? [record(COLLECTIONS.user, id)]
      : rows(COLLECTIONS.user, idIn(ids(body.userIds ?? body.ids)));
  }
  if (area === "advisers" && id)
    return [marker(COLLECTIONS.department, "adviser", id)];
  if (
    area === "integrations" &&
    id?.toLowerCase() === "authenticators" &&
    rawAction
  )
    return [record(COLLECTIONS.user, rawAction)];
  if (area === "integrations" && id)
    return [
      marker(COLLECTIONS.integrationSetting, "integration", id),
      ...rows(COLLECTIONS.integrationSetting, {
        key: id,
        kind: { $ne: "edit-presence" },
      }),
    ];
  if (area === "chatbot-knowledge") {
    const [latest] = await db
      .collection(COLLECTIONS.chatbotKnowledge)
      .find({ kind: { $ne: "edit-presence" } })
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    return [
      marker(COLLECTIONS.chatbotKnowledge, "chatbot-knowledge"),
      ...(latest
        ? [record(COLLECTIONS.chatbotKnowledge, String(latest._id))]
        : []),
    ];
  }
  if (area === "profiling-form")
    return [record(COLLECTIONS.academicYear, await year())];
  if (area === "submissions" && id && action !== "active-editors")
    return [record(COLLECTIONS.stepVerification, id)];
  if (area === "queue-entries" && id)
    return [record(COLLECTIONS.enrollmentQueue, id)];
  if (
    area === "queues" &&
    id?.toLowerCase() === "serving" &&
    typeof body.entryId === "string"
  )
    return [record(COLLECTIONS.enrollmentQueue, body.entryId)];
  if (area === "students" && id && action === "mugshot")
    return [record(COLLECTIONS.stepVerification, id)];
  if (area === "enrollments") {
    const values =
      id?.toLowerCase() === "completions"
        ? [...ids(body.enrollmentIds), ...ids(body.ids)]
        : id
          ? [id]
          : [];
    return rows(COLLECTIONS.enrollmentQueue, idIn(values));
  }
  if (area === "transfers")
    return [
      id
        ? record(COLLECTIONS.departmentTransferRequest, id)
        : marker(
            COLLECTIONS.departmentTransferRequest,
            "transfer",
            `${await year()}:${body.departmentId}`,
          ),
    ];
  if (area === "queue-shares")
    return [
      marker(
        COLLECTIONS.department,
        "queue-share",
        `${await year()}:${body.departmentId}`,
      ),
    ];
  if (area === "me" && id?.toLowerCase() === "departments")
    return [marker(COLLECTIONS.department, "adviser", user.id)];
  if (area === "me" && id?.toLowerCase() === "stamp")
    return [record(COLLECTIONS.user, user.id)];
  if (area === "me" && id?.toLowerCase() === "schedule") {
    const academicYearId = await year();
    return [
      marker(
        COLLECTIONS.adviserSchedule,
        "schedule",
        `${academicYearId}:${user.id}:${body.departmentId}`,
      ),
      ...rows(COLLECTIONS.adviserSchedule, {
        academicYearId,
        adviserId: user.id,
        departmentId: body.departmentId,
        kind: { $ne: "edit-presence" },
      }),
    ];
  }
  return [];
}

export const editPresence: RequestHandler = (req, res, next) => {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
    /^\/presence\/?$/i.test(req.path) ||
    /\/active-editors\/?$/i.test(req.path) ||
    /^\/integrations\/[^/]+\/credentials\/validate\/?$/i.test(req.path)
  )
    return next();
  const area = req.path.split("/")[1]?.toLowerCase();
  if (
    ![
      "departments",
      "academic-years",
      "requirements",
      "social-links",
      "users",
      "advisers",
      "integrations",
      "chatbot-knowledge",
      "profiling-form",
      "submissions",
      "queue-entries",
      "enrollments",
      "transfers",
      "queue-shares",
      "queues",
      "students",
    ].includes(area) &&
    !/^\/me\/(departments|stamp|schedule)\/?$/i.test(req.path)
  )
    return next();
  void requireSession(req, res, (error?: unknown) => {
    if (error) return next(error);
    void outsideTransaction(async () => {
      const header = req.get("x-edit-leases");
      let provided: string[] = [];
      if (header !== undefined) {
        try {
          provided = leases.parse(JSON.parse(header));
        } catch {
          throw new ApiError("BAD_REQUEST", {
            message: "Invalid editing session.",
          });
        }
      }
      const db = unguardDb(getDbSync());
      for (const target of await targets(req)) {
        const rows = await db
          .collection<PresenceDocument>(target.collection)
          .find(target.filter)
          .toArray();
        for (const row of rows) {
          const owner = presenceOwner(row.activeEditors);
          if (
            owner &&
            (owner.userId !== sessionUser(req).id ||
              !provided.includes(owner.leaseId))
          ) {
            throw new ApiError("CONFLICT", {
              message:
                "This form is being edited in another session. Wait until editing is available.",
              data: { code: "EDIT_LOCKED" },
            });
          }
        }
      }
    }).then(() => next(), next);
  });
};
