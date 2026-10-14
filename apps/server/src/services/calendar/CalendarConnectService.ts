import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../config/errors.js";
import {
  CALENDAR_SCOPE,
  consentUrl,
  exchangeCode,
} from "../../lib/google/calendar.js";
import { env } from "../../lib/platform/env.js";
import { sealToken } from "../../lib/platform/token-crypto.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { CalendarConnectionModel } from "../../models/CalendarConnectionModel.js";
import { CalendarSyncService, type SyncState } from "./CalendarSyncService.js";

const STATE_TTL_MS = 10 * 60_000;

export type CalendarStatusView = {
  available: boolean;
  status: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_RECONNECT";
  sync: SyncState;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

function redirectUri(): string {
  const base = (env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL).replace(/\/+$/, "");
  return `${base}/api/v1/calendar/callback`;
}

function sign(payload: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(payload)
    .digest("base64url");
}

function readState(state: string): { u: string; n: string; e: number } | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

async function requireAvailable(): Promise<void> {
  if (!(await CalendarSyncService.available())) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Google Calendar isn't available right now.",
    });
  }
}

export class CalendarConnectService {
  static async status(userId: string): Promise<CalendarStatusView> {
    const [available, conn] = await Promise.all([
      CalendarSyncService.available(),
      CalendarConnectionModel.findByUser(userId),
    ]);
    const connected = conn && conn.status !== "PENDING";
    return {
      available,
      status: !connected
        ? "NOT_CONNECTED"
        : conn.status === "NEEDS_RECONNECT"
          ? "NEEDS_RECONNECT"
          : "CONNECTED",
      sync: CalendarSyncService.stateOf(conn),
      googleEmail: connected ? (conn.googleEmail ?? null) : null,
      lastSyncAt: conn?.lastSyncAt ? new Date(conn.lastSyncAt).toISOString() : null,
      lastError: connected ? (conn.lastError ?? null) : null,
    };
  }

  static async begin(userId: string): Promise<{ url: string }> {
    await requireAvailable();
    const nonce = randomBytes(16).toString("hex");
    await CalendarConnectionModel.beginConnect(userId, nonce);
    const payload = Buffer.from(
      JSON.stringify({ u: userId, n: nonce, e: Date.now() + STATE_TTL_MS }),
    ).toString("base64url");
    return {
      url: consentUrl(`${payload}.${sign(payload)}`, redirectUri()),
    };
  }

  static async finish(
    userId: string,
    input: { code: string; state: string },
  ): Promise<void> {
    await requireAvailable();
    const state = readState(input.state);
    if (!state || state.u !== userId || state.e < Date.now()) {
      throw new ApiError("BAD_REQUEST", { message: "Connection expired." });
    }
    const granted = await exchangeCode(input.code, redirectUri());
    if (!granted.refreshToken || !granted.scope.includes(CALENDAR_SCOPE)) {
      throw new ApiError("BAD_REQUEST", {
        message: "Calendar permission was not granted.",
      });
    }
    const saved = await CalendarConnectionModel.complete(userId, state.n, {
      refreshTokenEnc: sealToken(granted.refreshToken),
      scope: granted.scope,
      googleEmail: granted.email,
      now: new Date(),
    });
    if (!saved) {
      throw new ApiError("BAD_REQUEST", { message: "Connection expired." });
    }
    await AdminActionLogModel.log(
      userId,
      "Connected Google Calendar",
      `User:${userId}`,
    );
    await CalendarSyncService.run(userId);
  }

  static async resync(userId: string): Promise<CalendarStatusView> {
    await requireAvailable();
    await AdminActionLogModel.log(
      userId,
      "Resynced Google Calendar",
      `User:${userId}`,
    );
    await CalendarSyncService.afterScheduleChange(userId);
    return CalendarConnectService.status(userId);
  }
}
