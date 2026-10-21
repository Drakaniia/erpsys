import { Readable } from "node:stream";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { notFoundHandler } from "../../src/middleware/notFound.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  head: null as unknown,
  deleted: 0,
  download: null as unknown,
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../src/lib/storage/client.js", () => ({
  getR2Client: () => ({}),
  presignedPutUrl: async () => "https://put.test/upload",
  headObjectExists: async () => holder.head,
  deleteR2Object: async () => {
    holder.deleted += 1;
  },
  getObjectStream: async () => holder.download,
}));

const STUDENT = {
  user: {
    id: "stud1",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
    isOutsideOrg: false,
  },
};

const STEPS = [
  { _id: "step-1", code: "ASSESSMENT", name: "Assessment", order: 1 },
  { _id: "step-4", code: "MUGSHOT", name: "Mugshot", order: 4 },
];

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      {
        _id: "ay-1",
        label: "2025-2026",
        semesterLabel: "First",
        isActive: true,
        createdAt: new Date("2025-06-01"),
      },
    ],
    [COLLECTIONS.studentProfile]: [
      {
        _id: "profile-1",
        userId: "stud1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.step]: STEPS,
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.storageUsage]: [],
    [COLLECTIONS.integrationSetting]: [],
    [COLLECTIONS.user]: [
      {
        _id: "stud1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
      },
    ],
  };
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
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
  holder.session = STUDENT;
  holder.head = { sizeBytes: 1000, contentType: "image/jpeg", etag: null };
  holder.deleted = 0;
  holder.download = null;
  context = fakeDb(seed());
  holder.db = context.db;
  vi.spyOn(console, "log").mockImplementation(() => {});
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

const mint = (body: Record<string, unknown>) =>
  call("/storage/session", { method: "POST", body: JSON.stringify(body) });

describe("storage session", () => {
  it("mints a pending row with a presigned PUT", async () => {
    const response = await mint({
      route: "evidenceImage",
      stepCode: "MUGSHOT",
      mime: "image/jpeg",
      size: 1000,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.uploadUrl).toBe("https://put.test/upload");
    expect(body.data.sessionExpiresAt).toEqual(expect.any(String));

    const row = context.store[COLLECTIONS.upload][0];
    expect(row).toMatchObject({
      backend: "r2",
      r2Status: "pending",
      kind: "MUGSHOT",
      studentProfileId: "profile-1",
      uploadedById: "stud1",
      mimeType: "image/jpeg",
    });
    expect(String(row.r2Key)).toContain("/Evidence/MUGSHOT/");
  });

  it("rejects an unknown step for evidence", async () => {
    const response = await mint({
      route: "evidenceImage",
      stepCode: "NOPE",
      mime: "image/jpeg",
      size: 1000,
    });
    expect(response.status).toBe(400);
  });

  it("rejects a step the student already had verified", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "step-4",
      academicYearId: "ay-1",
      status: "VERIFIED",
    });
    const response = await mint({
      route: "evidenceImage",
      stepCode: "MUGSHOT",
      mime: "image/jpeg",
      size: 1000,
    });
    expect(response.status).toBe(409);
  });

  it("requires the officer surface for a stamp upload", async () => {
    const response = await mint({
      route: "stampImage",
      mime: "image/png",
      size: 1000,
    });
    expect(response.status).toBe(403);
  });
});

describe("storage complete", () => {
  function pendingRow(overrides: Row = {}): Row {
    return {
      _id: "upload-1",
      backend: "r2",
      r2Status: "pending",
      r2Bucket: "bucket",
      r2Key: "erpsys/2025/Mugshot/stud1/a.jpg",
      r2Route: "mugshotCapture",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      kind: "MUGSHOT",
      studentProfileId: "profile-1",
      uploadedById: "stud1",
      createdAt: new Date("2025-07-01"),
      expiresAt: new Date("2025-07-02"),
      ...overrides,
    };
  }

  it("finalizes the row once the bytes match", async () => {
    context.store[COLLECTIONS.upload].push(pendingRow());

    const response = await call("/storage/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId: "upload-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.fileKey).toBe("r2:bucket:erpsys/2025/Mugshot/stud1/a.jpg");

    const row = context.store[COLLECTIONS.upload][0];
    expect(row.r2Status).toBe("complete");
    expect(context.store[COLLECTIONS.storageUsage][0].bytesStored).toBe(1000);
  });

  it("deletes the object when the stored bytes disagree", async () => {
    holder.head = { sizeBytes: 999, contentType: "image/jpeg", etag: null };
    context.store[COLLECTIONS.upload].push(pendingRow());

    const response = await call("/storage/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId: "upload-1" }),
    });
    expect(response.status).toBe(422);
    expect(holder.deleted).toBe(1);
    expect(context.store[COLLECTIONS.upload][0].r2Status).toBe("pending");
  });

  it("answers 404 when the bytes are not there yet", async () => {
    holder.head = null;
    context.store[COLLECTIONS.upload].push(pendingRow());
    const response = await call("/storage/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId: "upload-1" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("storage status and content", () => {
  function completeRow(): Row {
    return {
      _id: "upload-2",
      backend: "r2",
      r2Status: "complete",
      r2Bucket: "bucket",
      r2Key: "erpsys/2025/Mugshot/stud1/b.jpg",
      fileKey: "r2:bucket:erpsys/2025/Mugshot/stud1/b.jpg",
      kind: "MUGSHOT",
      studentProfileId: "profile-1",
      uploadedById: "stud1",
    };
  }

  it("reports pending bytes from the object head", async () => {
    context.store[COLLECTIONS.upload].push({
      ...completeRow(),
      r2Status: "pending",
    });
    const body = await (
      await call("/storage/session-status?uploadId=upload-2")
    ).json();
    expect(body.data).toEqual({ status: "pending", bytesReceived: 1000 });
  });

  it("serves r2 bytes with the streaming headers", async () => {
    holder.download = {
      status: 200,
      contentType: "image/jpeg",
      contentLength: "3",
      contentRange: undefined,
      stream: Readable.from([Buffer.from("abc")]),
    };
    context.store[COLLECTIONS.upload].push(completeRow());

    const response = await call("/uploads/upload-2/content");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(await response.text()).toBe("abc");
  });

  it("falls through to the JSON 404 for a legacy key", async () => {
    context.store[COLLECTIONS.upload].push({
      _id: "upload-3",
      fileKey: "drive:legacy",
      fileUrl: "https://drive.test/x",
      uploadedById: "stud1",
    });
    const response = await call("/uploads/upload-3/content");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Not found.");
  });

  it("keeps another student's upload forbidden", async () => {
    context.store[COLLECTIONS.upload].push({
      ...completeRow(),
      uploadedById: "someone-else",
      studentProfileId: "profile-other",
    });
    const response = await call("/uploads/upload-2/content");
    expect(response.status).toBe(403);
  });
});
