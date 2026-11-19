import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";

const state = vi.hoisted(() => ({
  data: {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
  } as Record<string, Record<string, unknown>[]>,
  mail: [] as { to: string; text: string }[],
  emailEnabled: true,
  placementFails: false,
}));

vi.mock("better-auth/adapters/mongodb", () => ({
  mongodbAdapter: () => memoryAdapter(state.data),
}));
vi.mock("../../src/lib/platform/env.js", () => ({
  env: {
    ADMIN_EMAILS: "admin@example.com",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    TURNSTILE_SECRET_KEY: "",
    NODE_ENV: "test",
  },
  webOrigins: () => [],
}));
vi.mock("../../src/lib/db/db.js", () => ({
  getDbSync: () => ({
    collection: () => ({
      updateOne: async (
        _filter: unknown,
        update: { $set: Record<string, unknown> },
      ) => {
        Object.assign(state.data.user[0], update.$set);
      },
    }),
  }),
  COLLECTIONS: { user: "user" },
  idIn: (ids: string[]) => ({ _id: { $in: ids } }),
}));
vi.mock("../../src/lib/platform/integration-settings.js", () => ({
  integrationEnabled: async () => state.emailEnabled,
  integrationConfigured: () => state.emailEnabled,
}));
vi.mock("../../src/lib/platform/mailer.js", () => ({
  sendMail: async (message: { to: string; text: string }) => {
    state.mail.push(message);
    return true;
  },
  escapeHtml: (text: string) => text,
}));
vi.mock("../../src/models/UserModel.js", () => ({
  UserModel: {
    findById: async (id: string) => {
      const user = state.data.user.find((row) => row.id === id);
      return user ? { ...user, _id: id } : null;
    },
  },
}));
vi.mock("../../src/models/AcademicYearModel.js", () => ({
  AcademicYearModel: { findById: async () => ({ _id: "year" }) },
}));
vi.mock("../../src/models/DepartmentModel.js", () => ({
  DepartmentModel: {
    findById: async () => ({
      _id: "department",
      isActive: true,
      yearLevels: ["FIRST"],
    }),
  },
}));
vi.mock("../../src/models/StudentProfileModel.js", () => ({
  StudentProfileModel: {
    findByStudentNumber: async () => null,
    insert: async () => {
      if (state.placementFails) throw new Error("placement failed");
    },
  },
}));
vi.mock("../../src/models/StudentEnrollmentModel.js", () => ({
  StudentEnrollmentModel: { insert: async () => {} },
}));
vi.mock("../../src/lib/db/user-purge.js", () => ({
  purgeUserById: async (_db: unknown, userId: string) => {
    for (const key of ["user", "account", "session"]) {
      state.data[key] = state.data[key].filter(
        (row) => row.id !== userId && row.userId !== userId,
      );
    }
  },
}));

const { auth } = await import("../../src/config/auth.js");
const origin = "http://localhost:3000";
const signup = {
  name: "Student",
  email: "student@example.com",
  password: "test-password-123",
  studentNumber: "1234567890",
  academicYearId: "year",
  departmentId: "department",
  yearLevel: "FIRST",
};
const call = (path: string, body?: unknown, cookie?: string) =>
  auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const latestCode = () => state.mail.at(-1)!.text.match(/\b\d{6}\b/)![0];
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

beforeEach(() => {
  for (const key of Object.keys(state.data)) state.data[key] = [];
  state.mail = [];
  state.emailEnabled = true;
  state.placementFails = false;
});

describe("Better Auth authentication contract", () => {
  it.each(["admin@example.com", "staff@buksu.edu.ph"])(
    "never grants privileges to unverified public signup: %s",
    async (email) => {
      const response = await call("/sign-up/student", {
        ...signup,
        email,
        role: "ADMIN",
        emailVerified: true,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("session_token");
      expect(state.data.user[0]).toMatchObject({
        role: "STUDENT",
        emailVerified: false,
      });
      expect(state.data.account[0].password).not.toBe(signup.password);
      const login = await call("/sign-in/email", {
        email,
        password: signup.password,
      });
      expect(login.status).toBe(200);
      expect(state.data.user[0].role).toBe("STUDENT");
    },
  );

  it("rolls back credentials and session when placement fails", async () => {
    state.placementFails = true;
    const response = await call("/sign-up/student", signup);
    expect(response.ok).toBe(false);
    expect(state.data.user).toHaveLength(0);
    expect(state.data.account).toHaveLength(0);
    expect(state.data.session).toHaveLength(0);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("blocks the bare signup endpoint", async () => {
    expect((await call("/sign-up/email", signup)).status).toBe(400);
  });

  it("uses hashed, one-time email codes without allowing OTP signup", async () => {
    await call("/sign-up/student", signup);
    expect(
      (
        await call("/email-otp/send-verification-otp", {
          email: signup.email,
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    const code = latestCode();
    expect(
      state.data.verification.some((row) => String(row.value).includes(code)),
    ).toBe(false);
    const login = await call("/sign-in/email-otp", {
      email: signup.email,
      otp: code,
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("session_token");
    expect(
      (await call("/sign-in/email-otp", { email: signup.email, otp: code })).ok,
    ).toBe(false);
    const before = state.mail.length;
    await call("/email-otp/send-verification-otp", {
      email: "unknown@example.com",
      type: "sign-in",
    });
    expect(state.mail).toHaveLength(before);
    expect(
      (
        await call("/sign-in/email-otp", {
          email: "unknown@example.com",
          otp: "123456",
        })
      ).ok,
    ).toBe(false);
    expect(state.data.user).toHaveLength(1);
  });

  it("allows optional verification after an unverified first login", async () => {
    const signupResponse = await call("/sign-up/student", signup);
    const cookie = cookieOf(signupResponse);
    expect((await call("/get-session", undefined, cookie)).status).toBe(200);
    await call(
      "/email-otp/send-verification-otp",
      { email: signup.email, type: "email-verification" },
      cookie,
    );
    expect(
      (
        await call(
          "/email-otp/verify-email",
          { email: signup.email, otp: latestCode() },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(state.data.user[0].emailVerified).toBe(true);
  });

  it("requires verified ownership before configured admin promotion", async () => {
    await call("/sign-up/student", { ...signup, email: "admin@example.com" });
    await call("/email-otp/send-verification-otp", {
      email: "admin@example.com",
      type: "sign-in",
    });
    expect(
      (
        await call("/sign-in/email-otp", {
          email: "admin@example.com",
          otp: latestCode(),
        })
      ).status,
    ).toBe(200);
    expect(state.data.user[0]).toMatchObject({
      role: "ADMIN",
      emailVerified: true,
    });
  });

  it("removes unproven credentials before optional privileged-email verification", async () => {
    const email = "admin@example.com";
    const response = await call("/sign-up/student", { ...signup, email });
    const cookie = cookieOf(response);
    await call(
      "/email-otp/send-verification-otp",
      { email, type: "email-verification" },
      cookie,
    );
    expect(
      (
        await call(
          "/email-otp/verify-email",
          { email, otp: latestCode() },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(state.data.account).toHaveLength(0);
    expect(state.data.session).toHaveLength(0);
    expect(
      (await call("/sign-in/email", { email, password: signup.password })).ok,
    ).toBe(false);
    expect(state.data.user[0].role).toBe("STUDENT");
  });

  it("limits incorrect guesses and rejects expired codes", async () => {
    await call("/sign-up/student", signup);
    await call("/email-otp/send-verification-otp", {
      email: signup.email,
      type: "sign-in",
    });
    const code = latestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i += 1)
      await call("/sign-in/email-otp", { email: signup.email, otp: wrong });
    expect(
      (await call("/sign-in/email-otp", { email: signup.email, otp: code })).ok,
    ).toBe(false);
    await call("/email-otp/send-verification-otp", {
      email: signup.email,
      type: "sign-in",
    });
    for (const row of state.data.verification) row.expiresAt = new Date(0);
    expect(
      (
        await call("/sign-in/email-otp", {
          email: signup.email,
          otp: latestCode(),
        })
      ).ok,
    ).toBe(false);
  });

  it("reports unavailable delivery without exposing a code", async () => {
    state.emailEnabled = false;
    expect(
      (
        await call("/email-otp/send-verification-otp", {
          email: signup.email,
          type: "sign-in",
        })
      ).status,
    ).toBe(503);
    expect(state.mail).toHaveLength(0);
  });

  it("revokes all sessions after password reset", async () => {
    await call("/sign-up/student", signup);
    await call("/request-password-reset", { email: signup.email });
    const token = new URL(
      state.mail.at(-1)!.text.match(/http[^\s]+/)![0],
    ).searchParams.get("token");
    expect(
      (
        await call("/reset-password", {
          token,
          newPassword: "replacement-password-123",
        })
      ).status,
    ).toBe(200);
    expect(state.data.session).toHaveLength(0);
  });
});
