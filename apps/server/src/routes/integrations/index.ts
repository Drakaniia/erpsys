import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { resetAuthenticator } from "../../config/auth/admin-gate.js";
import { ApiError } from "../../config/errors.js";
import { canEnterSurface } from "../../config/roles.js";
import { publicIntegrationPayload, setIntegrationEnabled, integrationLocked, lockedError } from "../../lib/platform/integration-settings.js";
import { slidingWindowRateLimit } from "../../lib/platform/rate-limit.js";
import {
  getSession,
  requireSession,
  requireStepUp,
  requireSurface,
  sessionUser,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { UserModel } from "../../models/UserModel.js";
import {
  adminAuthenticators,
  assertIntegrationKey,
  exportCredentialsEnv,
  integrationRows,
  resetCredentials,
  saveCredentials,
  validateCredentials,
} from "../../services/integrations.js";

/**
 * `/api/v1` — integration switches and their credentials; the GET is shaped by
 * who is asking.
 */
export const integrationsRouter = Router();

const admin = [requireSession, requireSurface("admin"), requireStepUp];

const credentialWriteLimit = slidingWindowRateLimit({
  windowMs: 60_000,
  max: 10,
  key: (req) => {
    const id = (req as AuthedRequest).session?.user?.id;
    return id ? `integration-credentials:${id}` : null;
  },
  message: "Too many credential attempts — wait a minute, then retry.",
});

const keyOf = (req: { params: Record<string, unknown> }) => assertIntegrationKey(String(req.params.key));

function refuseLocked(req: Request, _res: Response, next: NextFunction) {
  const key = keyOf(req);
  if (integrationLocked(key)) throw lockedError(key);
  next();
}

/**
 * `GET /api/v1/integrations/authenticators`
 * Access: session + admin surface.
 * Use: which admins have an authenticator app set up for the step-up.
 * Returns: `{ data: [{ userId, name, email, enrolled }] }`.
 */
integrationsRouter.get(
  "/integrations/authenticators",
  requireSession,
  requireSurface("admin"),
  catchAsync(async (_req, res) => {
    okOne(res, await adminAuthenticators());
  }),
);

/**
 * `DELETE /api/v1/integrations/authenticators/:userId`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: forget one admin's authenticator and end their unlock; they scan a new
 * QR code at their next step-up.
 * Returns: `{ data: { userId, enrolled: false } }`; `403` `STEP_UP_REQUIRED`
 * while locked, `404` when the user is not an admin.
 */
integrationsRouter.delete(
  "/integrations/authenticators/:userId",
  admin,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(z.object({ userId: z.string().min(1) }), req);
    const target = await UserModel.findById(userId);
    if (target?.role !== "ADMIN") {
      throw new ApiError("NOT_FOUND", { message: "Admin not found." });
    }
    await resetAuthenticator(userId);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Reset authenticator",
      `User:${userId}`,
      target.email ?? target.name ?? undefined,
    );
    okOne(res, { userId, enrolled: false });
  }),
);

/**
 * `GET /api/v1/integrations/credentials/export`
 * Access: session + admin surface + step-up unlock (PIN, password, emailed
 * code, authenticator; 5 minutes).
 * Use: the effective integration keys as an `.env` block — real values.
 * Returns: `{ data: { filename, content } }`, `Cache-Control: no-store`;
 * `403` with `{ data: { code: "STEP_UP_REQUIRED" } }` while locked.
 */
integrationsRouter.get(
  "/integrations/credentials/export",
  admin,
  catchAsync(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    okOne(res, await exportCredentialsEnv(sessionUser(req).id));
  }),
);

/**
 * `GET /api/v1/integrations`
 * Access: public (needs a session for the admin shape).
 * Use: flags and the Turnstile site key for the login page, the full row list
 * with credentials for an admin. The `betterAuth` row is `locked` (always on)
 * and carries `features`, the status of each sign-in and admin-unlock part.
 * Returns: `{ data: rows }` for an admin, `{ data: { flags, turnstileSiteKey,
 * overridesLoaded } }` otherwise.
 */
integrationsRouter.get(
  "/integrations",
  catchAsync(async (req, res) => {
    const session = await getSession(req);
    okOne(
      res,
      canEnterSurface(session?.user.role, "admin")
        ? await integrationRows()
        : await publicIntegrationPayload(),
    );
  }),
);

/**
 * `PATCH /api/v1/integrations/:key`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: turn one on or off — body `{ enabled }`.
 * Returns: `{ data: { key, enabled } }`; `403` `STEP_UP_REQUIRED` while locked,
 * `409` `INTEGRATION_LOCKED` for `betterAuth`, which is always on.
 */
integrationsRouter.patch(
  "/integrations/:key",
  admin,
  refuseLocked,
  catchAsync(async (req, res) => {
    const key = keyOf(req);
    const { enabled } = parseBody(z.object({ enabled: z.boolean() }), req);
    await setIntegrationEnabled({ key, enabled, actorId: sessionUser(req).id });
    okOne(res, { key, enabled });
  }),
);

/**
 * `POST /api/v1/integrations/:key/credentials/validate`
 * Access: session + admin surface.
 * Concurrency: read-only — no timestamp is issued and nothing is written.
 * Use: dry-run the group — body `{ version, values }`, the same body `PUT`
 * takes. Required, pair, format and provider checks run as they would on
 * save, against the drafts merged over stored values and `.env` fallbacks.
 * Returns: `{ data: { key, version, fields: [{ envKey, set, source }] } }`;
 * `409` on a stale version or
 * `INTEGRATION_LOCKED` for `betterAuth`, `422` with `{ failures }` when a
 * rule or the provider rejects the group, `429` when rate limited.
 */
integrationsRouter.post(
  "/integrations/:key/credentials/validate",
  requireSession,
  requireSurface("admin"),
  refuseLocked,
  credentialWriteLimit,
  catchAsync(async (req, res) => {
    const key = keyOf(req);
    const input = parseBody(
      z.object({
        version: z.number().int().min(0),
        values: z.record(z.string(), z.string().max(4096).nullable()),
      }),
      req,
    );
    okOne(res, await validateCredentials({ key, ...input }));
  }),
);

/**
 * `PUT /api/v1/integrations/:key/credentials`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace the credential group — body `{ version, values }`.
 * Returns: `{ data: row }`; `403` `STEP_UP_REQUIRED` while locked, `409` on a
 * stale version or `INTEGRATION_LOCKED` for `betterAuth`, `422` when
 * validation or the provider probe rejects the group, `429` when rate limited.
 */
integrationsRouter.put(
  "/integrations/:key/credentials",
  admin,
  refuseLocked,
  credentialWriteLimit,
  catchAsync(async (req, res) => {
    const key = keyOf(req);
    const input = parseBody(
      z.object({
        version: z.number().int().min(0),
        values: z.record(z.string(), z.string().max(4096).nullable()),
      }),
      req,
    );
    okOne(res, await saveCredentials({ actorId: sessionUser(req).id, key, ...input }));
  }),
);

/**
 * `DELETE /api/v1/integrations/:key/credentials`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reset the group to the `.env` values.
 * Returns: `{ data: row }`; `403` `STEP_UP_REQUIRED` while locked, `409`
 * `INTEGRATION_LOCKED` for `betterAuth`.
 */
integrationsRouter.delete(
  "/integrations/:key/credentials",
  admin,
  refuseLocked,
  credentialWriteLimit,
  catchAsync(async (req, res) => {
    okOne(res, await resetCredentials(sessionUser(req).id, keyOf(req)));
  }),
);
