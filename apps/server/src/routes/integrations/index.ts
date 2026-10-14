import { Router } from "express";
import { integrationsController } from "../../controllers/integrations/IntegrationsController.js";
import {
  requireSession,
  requireStepUp,
  requireSurface,
} from "../../middleware/auth.js";
import { slidingWindowRateLimit } from "../../lib/platform/rate-limit.js";
import type { AuthedRequest } from "../../services/auth/AuthService.js";

/**
 * `/api/v1` — integration switches and their credentials; the GET is shaped by
 * who is asking.
 */
export const integrationsRouter = Router();

const credentialWriteLimit = slidingWindowRateLimit({
  windowMs: 60_000,
  max: 10,
  key: (req) => {
    const session = (req as AuthedRequest).session;
    return session?.user?.id
      ? `integration-credentials:${session.user.id}`
      : null;
  },
  message: "Too many credential attempts — wait a minute, then retry.",
});

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
  requireSession,
  requireSurface("admin"),
  requireStepUp,
  integrationsController.exportCredentials,
);

/**
 * `GET /api/v1/integrations`
 * Access: public (needs a session for the admin shape).
 * Use: flags and the Turnstile site key for the login page, the full row list
 * with credentials for an admin.
 * Returns: `{ data: rows }` for an admin, `{ data: { flags, turnstileSiteKey,
 * overridesLoaded } }` otherwise.
 */
integrationsRouter.get("/integrations", integrationsController.list);

/**
 * `PATCH /api/v1/integrations/:key`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: turn one on or off — body `{ enabled }`.
 * Returns: `{ data: row }`; `403` `STEP_UP_REQUIRED` while locked.
 */
integrationsRouter.patch(
  "/integrations/:key",
  requireSession,
  requireSurface("admin"),
  requireStepUp,
  integrationsController.setEnabled,
);

/**
 * `PUT /api/v1/integrations/:key/credentials`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace the credential group — body `{ version, values }`.
 * Returns: `{ data: row }`; `403` `STEP_UP_REQUIRED` while locked, `409` on a
 * stale version, `422` when validation or the provider probe rejects the
 * group, `429` when rate limited.
 */
integrationsRouter.put(
  "/integrations/:key/credentials",
  requireSession,
  requireSurface("admin"),
  requireStepUp,
  credentialWriteLimit,
  integrationsController.saveCredentials,
);

/**
 * `DELETE /api/v1/integrations/:key/credentials`
 * Access: session + admin surface + step-up unlock.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reset the group to the `.env` values.
 * Returns: `{ data: row }`; `403` `STEP_UP_REQUIRED` while locked.
 */
integrationsRouter.delete(
  "/integrations/:key/credentials",
  requireSession,
  requireSurface("admin"),
  requireStepUp,
  credentialWriteLimit,
  integrationsController.resetCredentials,
);
