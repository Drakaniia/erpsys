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
  r2Client: null as unknown,
  responses: [] as unknown[],
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../src/lib/storage/configured-client.js", () => ({
  configuredR2Client: () => holder.r2Client,
}));
vi.mock("../../src/lib/storage/client.js", () => ({
  deleteR2Object: () => new Promise<void>(() => {}),
}));
vi.mock("../../src/lib/google/forms.js", () => ({
  readForm: async () => ({
    items: [
      { title: "Name", questionItem: { question: { questionId: "q1" } } },
      { title: "Hobbies", questionItem: { question: { questionId: "q2" } } },
      { title: "Section header" },
    ],
  }),
  listResponses: async () => holder.responses,
}));

const STUDENT = {
  user: {
    id: "stud1",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
    isOutsideOrg: false,
  },
};

const STEP_CODES = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
  "ENROLLMENT",
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
    [COLLECTIONS.step]: STEP_CODES.map((code, index) => ({
      _id: `step-${index + 1}`,
      code,
      name: code,
      order: index + 1,
    })),
    [COLLECTIONS.studentProfile]: [
      {
        _id: "profile-1",
        userId: "stud1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.notification]: [],
    [COLLECTIONS.studentEnrollment]: [],
    [COLLECTIONS.profilingForm]: [],
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
  holder.session = STUDENT;
  holder.r2Client = null;
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

const upload = (stepCode: string, fileUrl = "https://cdn.test/mug.jpg") =>
  call("/evidence", {
    method: "POST",
    body: JSON.stringify({
      stepCode,
      fileKey: `r2:bucket:${stepCode}.jpg`,
      fileUrl,
    }),
  });

describe("evidence uploads", () => {
  it("stores a draft with the step's kind and a 24h expiry", async () => {
    const response = await upload("MUGSHOT");
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.evidence).toHaveLength(1);
    expect(body.data.evidence[0].kind).toBe("MUGSHOT");
    expect(body.data.evidence[0].expired).toBe(false);
    expect(body.data.evidence[0].expiresAt).toEqual(expect.any(String));

    const row = context.store[COLLECTIONS.upload][0];
    expect(row.kind).toBe("MUGSHOT");
    expect(row.studentProfileId).toBe("profile-1");
    expect(row.expiresAt).toBeInstanceOf(Date);
  });

  it("deletes an upload the student owns", async () => {
    const created = await (await upload("MUGSHOT")).json();
    const id = created.data.evidence[0].id;

    const response = await call(`/evidence/${id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ deleted: true });
    expect(context.store[COLLECTIONS.upload]).toHaveLength(0);
  });

  it("answers without waiting on the R2 object delete", async () => {
    const created = await (await upload("MUGSHOT")).json();
    const id = created.data.evidence[0].id;
    holder.r2Client = {};

    let timer: NodeJS.Timeout;
    const response = await Promise.race([
      call(`/evidence/${id}`, { method: "DELETE" }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("DELETE waited for the R2 delete")),
          250,
        );
      }),
    ]);
    clearTimeout(timer!);

    expect(response.status).toBe(200);
    expect(context.store[COLLECTIONS.upload]).toHaveLength(0);
  });

  it("answers 404 for someone else's upload", async () => {
    const response = await call("/evidence/upload-nope", { method: "DELETE" });
    expect(response.status).toBe(404);
  });

  it("refuses new evidence on a verified step", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "step-4",
      academicYearId: "ay-1",
      status: "VERIFIED",
    });
    const response = await upload("MUGSHOT");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This step is already verified.",
    );
  });
});

describe("external evidence links", () => {
  it("saves and removes the link for a step", async () => {
    const saved = await call("/me/evidence-link", {
      method: "PUT",
      body: JSON.stringify({
        stepCode: "SOCIAL_MEDIA",
        url: "https://social.test/post/1",
      }),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.evidence).toEqual([
      expect.objectContaining({
        kind: "EXTERNAL_LINK",
        fileUrl: "https://social.test/post/1",
      }),
    ]);

    const removed = await call("/me/evidence-link", {
      method: "DELETE",
      body: JSON.stringify({ stepCode: "SOCIAL_MEDIA" }),
    });
    expect(removed.status).toBe(200);
    expect((await removed.json()).data.evidence).toEqual([]);
    expect(context.store[COLLECTIONS.upload]).toHaveLength(0);
  });

  it("keeps verified links locked", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-2",
      studentProfileId: "profile-1",
      stepId: "step-2",
      academicYearId: "ay-1",
      status: "VERIFIED",
    });
    const response = await call("/me/evidence-link", {
      method: "DELETE",
      body: JSON.stringify({ stepCode: "SOCIAL_MEDIA" }),
    });
    expect(response.status).toBe(409);
  });
});

describe("step submission", () => {
  it("refuses to submit with nothing uploaded", async () => {
    const response = await call("/me/steps/MUGSHOT/submission", {
      method: "POST",
    });
    expect(response.status).toBe(412);
    expect((await response.json()).error).toBe("Upload evidence first.");
  });

  it("says so when the upload expired instead", async () => {
    context.store[COLLECTIONS.upload].push({
      _id: "upload-old",
      studentProfileId: "profile-1",
      kind: "MUGSHOT",
      fileKey: "r2:bucket/old.jpg",
      fileUrl: "https://cdn.test/old.jpg",
      createdAt: new Date("2025-06-01"),
      expiredAt: new Date("2025-06-02"),
    });
    const response = await call("/me/steps/MUGSHOT/submission", {
      method: "POST",
    });
    expect(response.status).toBe(412);
    expect((await response.json()).error).toContain("expired 24 hours");
  });

  it("submits the step's uploads and cancels back to pending", async () => {
    await upload("MUGSHOT");
    await upload("MUGSHOT", "https://cdn.test/mug-2.jpg");

    const submitted = await call("/me/steps/MUGSHOT/submission", {
      method: "POST",
    });
    expect(submitted.status).toBe(201);
    const submittedBody = await submitted.json();
    expect(submittedBody.data.status).toBe("SUBMITTED");
    expect(submittedBody.data.evidence).toHaveLength(2);

    const verification = context.store[COLLECTIONS.stepVerification][0];
    expect(verification.status).toBe("SUBMITTED");
    expect(verification.evidenceCount).toBe(2);

    const cancelled = await call("/me/steps/MUGSHOT/submission", {
      method: "DELETE",
    });
    expect((await cancelled.json()).data).toEqual({ status: "PENDING" });
    expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(0);
    expect(context.store[COLLECTIONS.upload]).toHaveLength(2);
  });

  describe("profiling Google Form", () => {
    const post = () =>
      call("/me/steps/PROFILING/submission", { method: "POST" });
    const text = (...values: string[]) => ({
      textAnswers: { answers: values.map((value) => ({ value })) },
    });

    beforeEach(() => {
      holder.responses = [];
      context.store[COLLECTIONS.profilingForm].push({
        _id: "form-1",
        academicYearId: "ay-1",
        formId: "gf-1",
        responderUri: "https://docs.google.com/forms/d/e/gf-1/viewform",
      });
    });

    it("stores the student's latest response as labelled answers", async () => {
      holder.responses = [
        {
          respondentEmail: "12345@STUDENT.buksu.edu.ph",
          lastSubmittedTime: "2025-07-01T00:00:00Z",
          answers: { q1: text("Old") },
        },
        {
          respondentEmail: "12345@student.buksu.edu.ph",
          lastSubmittedTime: "2025-07-02T00:00:00Z",
          answers: { q1: text(" Ana "), q2: text("Art", "Sports") },
        },
        // Someone else's newer response must never be attached to this student.
        {
          respondentEmail: "999@student.buksu.edu.ph",
          lastSubmittedTime: "2025-07-03T00:00:00Z",
          answers: { q1: text("Other") },
        },
      ];
      const response = await post();
      expect(response.status).toBe(201);
      const row = context.store[COLLECTIONS.stepVerification][0];
      expect(row.status).toBe("SUBMITTED");
      expect(row.answers).toEqual([
        { label: "Name", value: "Ana" },
        { label: "Hobbies", value: "Art, Sports" },
      ]);
    });

    it("refuses when the student has not answered the Google Form", async () => {
      const response = await post();
      expect(response.status).toBe(412);
      expect((await response.json()).error).toContain("No Google Form response");
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(0);
    });

    it("needs a form to be set up", async () => {
      context.store[COLLECTIONS.profilingForm].length = 0;
      expect((await post()).status).toBe(412);
    });
  });

  it("will not cancel a verified step", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "step-4",
      academicYearId: "ay-1",
      status: "VERIFIED",
    });
    const response = await call("/me/steps/MUGSHOT/submission", {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
  });
});
