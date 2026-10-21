import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  available: true,
  scope: "",
}));
const google = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  accessToken: vi.fn(),
  createCalendar: vi.fn(),
  listEvents: vi.fn(),
  putEvent: vi.fn(),
  deleteEvent: vi.fn(),
  deleteCalendar: vi.fn(),
  revokeToken: vi.fn(),
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../src/lib/google/calendar.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/google/calendar.js")>()),
  ...google,
}));
vi.mock("../../src/lib/platform/rate-limit.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/platform/rate-limit.js")
  >()),
  slidingWindowRateLimit: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));
vi.mock("../../src/lib/platform/token-crypto.js", () => ({
  sealToken: (plain: string) => `enc:${plain}`,
  openToken: (sealed: string) => sealed.replace(/^enc:/, ""),
}));
vi.mock("../../src/lib/platform/integration-settings.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/platform/integration-settings.js")
  >()),
  integrationEnabled: async () => holder.available,
  integrationConfigured: () => true,
}));

import { CALENDAR_SCOPE } from "../../src/lib/google/calendar.js";

const ADVISER = {
  user: {
    id: "adv1",
    name: "Ada",
    email: "ada@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};
const OTHER = {
  user: {
    id: "adv2",
    name: "Bo",
    email: "bo@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};
const STUDENT = {
  user: {
    id: "u-p1",
    name: "Ana",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
  },
};

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      { _id: "ay-1", label: "2026", semesterLabel: "First", isActive: true },
    ],
    [COLLECTIONS.calendarConnection]: [],
    [COLLECTIONS.availabilityWindow]: [],
    [COLLECTIONS.adminActionLog]: [],
  };
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let context: ReturnType<typeof fakeDb>;
let server: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  holder.session = ADVISER;
  holder.available = true;
  context = fakeDb(seed());
  holder.db = context.db;
  google.exchangeCode.mockResolvedValue({
    refreshToken: "refresh",
    scope: `${CALENDAR_SCOPE} openid email`,
    email: "ada@gmail.com",
  });
  google.accessToken.mockResolvedValue("access");
  google.createCalendar.mockResolvedValue("gcal-1");
  google.listEvents.mockResolvedValue([]);
  google.putEvent.mockResolvedValue(undefined);
  google.deleteCalendar.mockResolvedValue(undefined);
  google.revokeToken.mockResolvedValue(undefined);
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.clearAllMocks();
});

const call = async (path: string, method = "GET") => {
  const response = await fetch(`${server.url}/api/v1${path}`, {
    method,
    redirect: "manual",
  });
  const text = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: text.startsWith("{") ? JSON.parse(text) : null,
  };
};

async function beginConnect(): Promise<string> {
  const { body } = await call("/me/calendar/connect");
  return new URL(body.data.url).searchParams.get("state")!;
}

const connection = () => context.store[COLLECTIONS.calendarConnection][0];

describe("calendar status", () => {
  it("reports an unconnected instructor", async () => {
    const { body } = await call("/me/calendar");
    expect(body.data).toEqual({
      available: true,
      status: "NOT_CONNECTED",
      sync: "NOT_CONNECTED",
      googleEmail: null,
      lastSyncAt: null,
      lastError: null,
    });
  });

  it("reports unavailable while the integration is off", async () => {
    holder.available = false;
    const { body } = await call("/me/calendar");
    expect(body.data.available).toBe(false);
  });

  it("is instructor-only", async () => {
    holder.session = STUDENT;
    expect((await call("/me/calendar")).status).toBe(403);
  });
});

describe("connecting", () => {
  it("hands out a consent URL for the narrow calendar scope", async () => {
    const { body } = await call("/me/calendar/connect");
    const url = new URL(body.data.url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("scope")).toContain(CALENDAR_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toMatch(
      /\/api\/v1\/calendar\/callback$/,
    );
    expect(connection()).toMatchObject({ userId: "adv1", status: "PENDING" });
  });

  it("refuses to start while the integration is off", async () => {
    holder.available = false;
    expect((await call("/me/calendar/connect")).status).toBe(412);
  });

  it("stores the token encrypted and never returns it", async () => {
    const state = await beginConnect();
    const done = await call(`/calendar/callback?code=abc&state=${state}`);
    expect(done.status).toBe(302);
    expect(done.location).toBe("/instructor?calendar=connected");
    expect(connection()).toMatchObject({
      status: "CONNECTED",
      refreshTokenEnc: "enc:refresh",
      googleEmail: "ada@gmail.com",
      pendingNonce: null,
    });
    const status = await call("/me/calendar");
    expect(status.body.data.status).toBe("CONNECTED");
    expect(JSON.stringify(status.body)).not.toContain("refresh");
    expect(google.createCalendar).toHaveBeenCalled();
  });

  it("refuses to reuse a consent link", async () => {
    const state = await beginConnect();
    await call(`/calendar/callback?code=abc&state=${state}`);
    google.exchangeCode.mockClear();
    const replay = await call(`/calendar/callback?code=abc&state=${state}`);
    expect(replay.location).toBe("/instructor?calendar=error");
  });

  it("refuses a state that was issued to someone else", async () => {
    const state = await beginConnect();
    holder.session = OTHER;
    const stolen = await call(`/calendar/callback?code=abc&state=${state}`);
    expect(stolen.location).toBe("/instructor?calendar=error");
    expect(google.exchangeCode).not.toHaveBeenCalled();
  });

  it("refuses a forged state", async () => {
    await beginConnect();
    const forged = await call("/calendar/callback?code=abc&state=e30.AAAA");
    expect(forged.location).toBe("/instructor?calendar=error");
  });

  it("flags an incomplete permission grant", async () => {
    google.exchangeCode.mockResolvedValue({
      refreshToken: "refresh",
      scope: "openid email",
      email: null,
    });
    const state = await beginConnect();
    const done = await call(`/calendar/callback?code=abc&state=${state}`);
    expect(done.location).toBe("/instructor?calendar=error");
    expect(connection().status).toBe("PENDING");
  });

  it("reports a Google error redirect as a failed connect", async () => {
    await beginConnect();
    const denied = await call("/calendar/callback?error=access_denied");
    expect(denied.location).toBe("/instructor?calendar=error");
  });
});

describe("disconnecting", () => {
  it("removes the stored token and the mirrored calendar, keeping the schedule", async () => {
    const state = await beginConnect();
    await call(`/calendar/callback?code=abc&state=${state}`);
    context.store[COLLECTIONS.availabilityWindow].push({
      _id: "w1",
      adviserId: "adv1",
      departmentId: "dept-1",
      academicYearId: "ay-1",
      kind: "WEEKLY",
      weekday: 1,
      startMinute: 540,
      endMinute: 720,
    });
    const { body } = await call("/me/calendar", "DELETE");
    expect(body.data.status).toBe("NOT_CONNECTED");
    expect(context.store[COLLECTIONS.calendarConnection]).toHaveLength(0);
    expect(google.deleteCalendar).toHaveBeenCalledWith(
      "adv1",
      "access",
      "gcal-1",
    );
    expect(google.revokeToken).toHaveBeenCalledWith("refresh");
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(1);
  });

  it("still drops our copy when Google cannot be reached", async () => {
    const state = await beginConnect();
    await call(`/calendar/callback?code=abc&state=${state}`);
    google.accessToken.mockRejectedValue(new Error("down"));
    await call("/me/calendar", "DELETE");
    expect(context.store[COLLECTIONS.calendarConnection]).toHaveLength(0);
  });
});
