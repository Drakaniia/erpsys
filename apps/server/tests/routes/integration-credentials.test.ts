import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { encryptField } from "../../src/lib/platform/credential-cipher.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  probe: { ok: true } as unknown,
  probeCalls: 0,
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../src/lib/platform/credential-probes.js", () => ({
  probeCredentials: async () => {
    holder.probeCalls += 1;
    return holder.probe;
  },
}));

const ADMIN = {
  user: { id: "admin1", email: "admin@buksu.edu.ph", role: "ADMIN" },
};

const R2_ENDPOINT = `https://${"a".repeat(32)}.r2.cloudflarestorage.com`;
const R2_VALUES = {
  R2_BUCKET: "erpsys-prod",
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID: "access-id-123",
  R2_SECRET_ACCESS_KEY: "secret-access-key",
};

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.integrationSetting]: [],
    [COLLECTIONS.integrationCredential]: [],
    [COLLECTIONS.adminActionLog]: [],
    [COLLECTIONS.adminStepUp]: [
      {
        _id: "admin1",
        unlockedUntil: new Date(Date.now() + 60 * 60_000),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "admin1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
      },
    ],
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
  holder.session = ADMIN;
  holder.probe = { ok: true };
  holder.probeCalls = 0;
  context = fakeDb(seed());
  holder.db = context.db;
  vi.spyOn(console, "error").mockImplementation(() => {});
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const call = (path: string, init?: RequestInit) =>
  fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

const credentialDocs = () => context.store[COLLECTIONS.integrationCredential];
const audits = () => context.store[COLLECTIONS.adminActionLog];

describe("PUT /integrations/:key/credentials", () => {
  it("stores one encrypted document, bumps the version and audits the key names", async () => {
    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({ version: 0, values: R2_VALUES }),
    });

    expect(response.status).toBe(200);
    const row = (await response.json()).data;

    expect(credentialDocs()).toHaveLength(1);
    const doc = credentialDocs()[0];
    expect(doc.key).toBe("r2");
    expect(doc.version).toBe(1);
    expect(String(doc.values)).not.toContain("secret-access-key");

    expect(row.version).toBe(1);
    expect(row.pendingRestart).toBe(true);
    const secret = row.credentials.find(
      (field: Row) => field.envKey === "R2_SECRET_ACCESS_KEY",
    );
    expect(secret.source).toBe("stored");
    expect(secret.value).toBeNull();
    expect(secret.masked).toBe("secre••••••••••••");

    expect(audits()).toHaveLength(1);
    expect(audits()[0].action).toBe("Updated File uploads credentials");
    expect(audits()[0].targetRef).toBe("r2");
    expect(String(audits()[0].detail)).toContain("R2_ACCESS_KEY_ID");
    expect(String(audits()[0].detail)).not.toContain("secret-access-key");
  });

  it("blocks the save when the probe rejects, leaving no trace", async () => {
    holder.probe = {
      ok: false,
      failures: [{ key: "R2_BUCKET", reason: "bucket not found" }],
    };

    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({ version: 0, values: R2_VALUES }),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.data.failures).toEqual([
      { key: "R2_BUCKET", reason: "bucket not found" },
    ]);
    expect(credentialDocs()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("rejects a half-filled pair before any probe", async () => {
    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({
        version: 0,
        values: { R2_ACCESS_KEY_ID: "only-the-id" },
      }),
    });

    expect(response.status).toBe(422);
    expect(holder.probeCalls).toBe(0);
    expect(credentialDocs()).toHaveLength(0);
  });

  it("rejects an unknown env key", async () => {
    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({
        version: 0,
        values: { DATABASE_URL: "mongodb://evil" },
      }),
    });
    expect(response.status).toBe(400);
    expect(credentialDocs()).toHaveLength(0);
  });

  it("rejects a stale version without overwriting", async () => {
    credentialDocs().push({
      _id: "ic-1",
      key: "r2",
      values: {
        R2_ACCESS_KEY_ID: encryptField("r2", "R2_ACCESS_KEY_ID", "old-id"),
      },
      version: 3,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({ version: 2, values: R2_VALUES }),
    });

    expect(response.status).toBe(409);
    expect(credentialDocs()[0].version).toBe(3);
    expect(String(credentialDocs()[0].values)).not.toContain("access-id-123");
    expect(audits()).toHaveLength(0);
  });

  it("clears a key back to .env without probing", async () => {
    credentialDocs().push({
      _id: "ic-1",
      key: "r2",
      values: {
        R2_ACCESS_KEY_ID: encryptField("r2", "R2_ACCESS_KEY_ID", "stored-id"),
        R2_SECRET_ACCESS_KEY: encryptField(
          "r2",
          "R2_SECRET_ACCESS_KEY",
          "stored-secret",
        ),
      },
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    holder.probe = {
      ok: false,
      failures: [{ key: "R2_BUCKET", reason: "bucket not found" }],
    };

    const response = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({
        version: 1,
        values: { R2_ACCESS_KEY_ID: null, R2_SECRET_ACCESS_KEY: null },
      }),
    });

    expect(response.status).toBe(200);
    expect(holder.probeCalls).toBe(0);
    expect(credentialDocs()[0].values).toEqual({});
    expect(credentialDocs()[0].version).toBe(2);
  });

  it("does not write or audit when the same bytes are saved twice", async () => {
    await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({ version: 0, values: R2_VALUES }),
    });
    const second = await call("/integrations/r2/credentials", {
      method: "PUT",
      body: JSON.stringify({ version: 1, values: R2_VALUES }),
    });

    expect(second.status).toBe(200);
    expect(credentialDocs()[0].version).toBe(1);
    expect(audits()).toHaveLength(1);
  });
});

describe("public site key", () => {
  it("serves a newly saved site key on the next read, before any restart", async () => {
    holder.session = null;
    const before = await (await call("/integrations")).json();
    expect(before.data.overridesLoaded).toBe(true);

    holder.session = ADMIN;
    const saved = await call("/integrations/turnstile/credentials", {
      method: "PUT",
      body: JSON.stringify({
        version: 0,
        values: {
          TURNSTILE_SECRET_KEY: "turnstile-secret",
          VITE_TURNSTILE_SITE_KEY: "site-key-just-saved",
        },
      }),
    });
    expect(saved.status).toBe(200);

    holder.session = null;
    const after = await (await call("/integrations")).json();
    expect(after.data.turnstileSiteKey).toBe("site-key-just-saved");
    expect(after.data.flags.turnstile).toBe(true);
  });
});

describe("DELETE /integrations/:key/credentials", () => {
  it("drops the stored values, bumps the version and leaves the toggle alone", async () => {
    credentialDocs().push({
      _id: "ic-1",
      key: "googleAuth",
      values: {
        GOOGLE_CLIENT_ID: encryptField(
          "googleAuth",
          "GOOGLE_CLIENT_ID",
          "stored-id",
        ),
      },
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const response = await call("/integrations/googleAuth/credentials", {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    const row = (await response.json()).data;

    expect(row.version).toBe(2);
    expect(row.credentials[0].source).not.toBe("stored");
    expect(credentialDocs()[0].values).toEqual({});
    expect(audits()[0].action).toBe("Reset Google sign-in credentials");
    expect(context.store[COLLECTIONS.integrationSetting]).toHaveLength(0);
  });
});

describe("GET /integrations/credentials/export", () => {
  it("returns the effective env block, sets no-store and audits the export", async () => {
    credentialDocs().push({
      _id: "ic-1",
      key: "email",
      values: {
        BREVO_API_KEY: encryptField("email", "BREVO_API_KEY", "xkeysib-stored"),
      },
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const response = await call("/integrations/credentials/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const { content } = (await response.json()).data as { content: string };
    expect(content).toContain("BREVO_API_KEY=xkeysib-stored");
    expect(content).toContain("GOOGLE_CLIENT_ID=");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("BETTER_AUTH_SECRET");
    expect(content).toContain("/etc/erpsys.env");

    expect(audits()[0].action).toBe("Exported integration credentials");
  });
});
