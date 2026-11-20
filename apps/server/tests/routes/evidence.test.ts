import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { timestampOrdering } from "../../src/middleware/timestamp.js";
import { guardDb } from "../../src/lib/db/timestamp-ordering.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  r2Client: null as unknown,
  r2Deletes: [] as unknown[],
  responses: [] as unknown[],
  formUnavailable: false,
  beforeRead: undefined as (() => void) | undefined,
  items: [] as unknown[],
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
  deleteR2Object: (_client: unknown, target: unknown) => {
    holder.r2Deletes.push(target);
    return new Promise<void>(() => {});
  },
}));

vi.mock("../../src/lib/google/forms.js", () => ({
  readForm: async () => {
    holder.beforeRead?.();
    if (holder.formUnavailable) throw new Error("Google Forms offline");
    return { items: holder.items };
  },
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

    [COLLECTIONS.user]: [
      {
        _id: "stud1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
        studentProfile: {
          _id: "profile-1",
          studentNumber: "12345",
          academicYearId: "ay-1",
        },
      },
    ],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.notification]: [],
    [COLLECTIONS.studentEnrollment]: [],
  };
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", timestampOrdering, v1Router);
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
  holder.r2Deletes = [];
  context = fakeDb(seed());
  holder.db = guardDb(context.db as never);
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
    context.store[COLLECTIONS.upload][0]!.backend = "r2";
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

  // A client-supplied fileKey can name any object in the bucket; only rows the
  // storage flow finalized (backend r2) may reach the R2 delete.
  it("never deletes an R2 object for a client-registered key", async () => {
    const created = await (await upload("MUGSHOT")).json();
    holder.r2Client = {};
    const response = await call(`/evidence/${created.data.evidence[0].id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(holder.r2Deletes).toHaveLength(0);
  });

  it("refuses to delete an upload that backs a verified step", async () => {
    const created = await (await upload("MUGSHOT")).json();
    const id = created.data.evidence[0].id;
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "MUGSHOT",
      academicYearId: "ay-1",
      status: "VERIFIED",
      evidence: { uploadIds: [id] },
    });
    const response = await call(`/evidence/${id}`, { method: "DELETE" });
    expect(response.status).toBe(409);
    expect(context.store[COLLECTIONS.upload]).toHaveLength(1);
  });

  it("answers 404 for someone else's upload", async () => {
    const response = await call("/evidence/upload-nope", { method: "DELETE" });
    expect(response.status).toBe(404);
  });

  it("refuses new evidence on a verified step", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "MUGSHOT",
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
      stepId: "SOCIAL_MEDIA",
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
      holder.formUnavailable = false;
      holder.beforeRead = undefined;
      holder.items = [
        {
          title: "Name",
          questionItem: { question: { questionId: "q1", required: true } },
        },
        { title: "Hobbies", questionItem: { question: { questionId: "q2" } } },
        { title: "Section header" },
      ];
      context.store[COLLECTIONS.academicYear][0].profilingForm = {
        formId: "gf-1",
        responderUri: "https://docs.google.com/forms/d/e/gf-1/viewform",
      };
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
      expect((await response.json()).error).toContain(
        "No Google Form response",
      );
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(0);
    });

    const read = async () => {
      const response = await call("/me/student");
      expect(response.status).toBe(200);
      const body = await response.json();
      return {
        body: body.data,
        step: body.data.steps.find(
          (s: { code: string }) => s.code === "PROFILING",
        ),
      };
    };

    it("automatically imports the latest response and previews optional blanks", async () => {
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email.toUpperCase(),
          lastSubmittedTime: "2025-07-02T00:00:00Z",
          answers: { q1: text(" Ana ") },
        },
        {
          respondentEmail: "other@student.buksu.edu.ph",
          lastSubmittedTime: "2025-07-03T00:00:00Z",
          answers: { q1: text("Other") },
        },
      ];
      const { step } = await read();
      expect(step.status).toBe("SUBMITTED");
      expect(step.profilingResponse).toEqual({
        status: "COMPLETE",
        submittedAt: "2025-07-02T00:00:00Z",
        missingRequired: [],
        answers: [
          { label: "Name", value: "Ana" },
          { label: "Hobbies", value: "" },
        ],
      });
      const saved = structuredClone(
        context.store[COLLECTIONS.stepVerification][0],
      );
      await read();
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(1);
      expect(context.store[COLLECTIONS.stepVerification][0]).toEqual(saved);
    });

    it("shows not submitted without creating a review submission", async () => {
      const { step } = await read();
      expect(step.status).toBe("PENDING");
      expect(step.profilingResponse.status).toBe("NOT_SUBMITTED");
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(0);
    });

    it("rejects blank required answers on the legacy submission endpoint too", async () => {
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          answers: { q1: text("  "), q2: text("Art") },
        },
      ];
      expect((await post()).status).toBe(412);
      const { step } = await read();
      expect(step.profilingResponse.status).toBe("INCOMPLETE");
      expect(step.profilingResponse.missingRequired).toEqual(["Name"]);
      expect(step.profilingResponse.answers).toContainEqual({
        label: "Hobbies",
        value: "Art",
      });
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(0);
    });

    it("makes an incomplete verified response pending and removes queue readiness", async () => {
      for (const code of [
        "ASSESSMENT",
        "SOCIAL_MEDIA",
        "PROFILING",
        "MUGSHOT",
        "CONSENT",
      ]) {
        context.store[COLLECTIONS.stepVerification].push({
          _id: `v-${code}`,
          studentProfileId: "profile-1",
          stepId: code,
          academicYearId: "ay-1",
          status: "VERIFIED",
          verifiedAt: new Date(),
          verifiedById: "officer",
          appliedAt: new Date(),
        });
      }
      holder.responses = [
        { respondentEmail: STUDENT.user.email, answers: { q2: text("Art") } },
      ];
      const { body, step } = await read();
      expect(step.status).toBe("PENDING");
      expect(step.stamp).toBeNull();
      expect(step.appliedAt).toBeNull();
      expect(body.readyForQueue).toBe(false);
      const row = context.store[COLLECTIONS.stepVerification].find(
        (v) => v.stepId === "PROFILING",
      )!;
      expect(row.status).toBe("PENDING");
      expect(row.verifiedAt).toBeNull();
    });

    it("does not erase a submission when Google is unavailable", async () => {
      context.store[COLLECTIONS.stepVerification].push({
        _id: "v-profile",
        studentProfileId: "profile-1",
        stepId: "PROFILING",
        academicYearId: "ay-1",
        status: "SUBMITTED",
        answers: [{ label: "Name", value: "Ana" }],
      });
      holder.formUnavailable = true;
      const { step } = await read();
      expect(step.status).toBe("SUBMITTED");
      expect(step.profilingResponse.status).toBe("UNAVAILABLE");
      expect(step.profilingResponse.answers).toEqual([
        { label: "Name", value: "Ana" },
      ]);
      expect(context.store[COLLECTIONS.stepVerification][0].status).toBe(
        "SUBMITTED",
      );
    });

    it("keeps an unchanged returned response returned until it is resubmitted", async () => {
      const submittedAt = "2025-07-02T00:00:00Z";
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          lastSubmittedTime: submittedAt,
          answers: { q1: text("Ana") },
        },
      ];
      await read();
      context.store[COLLECTIONS.stepVerification][0].status = "RETURNED";
      expect((await read()).step.status).toBe("RETURNED");
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          lastSubmittedTime: "2025-07-03T00:00:00Z",
          answers: { q1: text("Ana") },
        },
      ];
      expect((await read()).step.status).toBe("SUBMITTED");
    });

    it("does not overwrite an officer decision made while Google is loading", async () => {
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          lastSubmittedTime: "2025-07-02T00:00:00Z",
          answers: { q1: text("Ana") },
        },
      ];
      await read();
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          lastSubmittedTime: "2025-07-03T00:00:00Z",
          answers: { q1: text("Ana Updated") },
        },
      ];
      holder.beforeRead = () => {
        Object.assign(context.store[COLLECTIONS.stepVerification][0], {
          status: "VERIFIED",
          verifiedAt: new Date(),
          verifiedById: "officer",
        });
      };
      const { step } = await read();
      expect(step.status).toBe("VERIFIED");
      expect(context.store[COLLECTIONS.stepVerification][0].status).toBe(
        "VERIFIED",
      );
    });

    it("imports only one row for simultaneous first reads", async () => {
      holder.responses = [
        { respondentEmail: STUDENT.user.email, answers: { q1: text("Ana") } },
      ];
      const results = await Promise.all([read(), read()]);
      expect(results.map(({ step }) => step.status)).toEqual([
        "SUBMITTED",
        "SUBMITTED",
      ]);
      expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(1);
    });

    it("does not require questions in skipped Google Form sections", async () => {
      holder.items = [
        {
          title: "Path",
          questionItem: {
            question: {
              questionId: "q1",
              required: true,
              choiceQuestion: {
                options: [{ value: "Continue", goToSectionId: "selected" }],
              },
            },
          },
        },
        { itemId: "skipped", pageBreakItem: {} },
        {
          title: "Skipped required",
          questionItem: { question: { questionId: "skip", required: true } },
        },
        { itemId: "selected", pageBreakItem: {} },
        {
          title: "Name",
          questionItem: { question: { questionId: "q2", required: true } },
        },
      ];
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          answers: { q1: text("Continue"), q2: text("Ana") },
        },
      ];
      const { step } = await read();
      expect(step.profilingResponse.status).toBe("COMPLETE");
      expect(step.profilingResponse.missingRequired).toEqual([]);
      expect(
        step.profilingResponse.answers.map((a: { label: string }) => a.label),
      ).toEqual(["Path", "Name"]);
    });

    it("checks every required grid row and accepts uploaded file answers", async () => {
      holder.items = [
        {
          title: "Skills",
          questionGroupItem: {
            questions: [
              {
                questionId: "q1",
                required: true,
                rowQuestion: { title: "Writing" },
              },
              {
                questionId: "q2",
                required: true,
                rowQuestion: { title: "Reading" },
              },
            ],
          },
        },
        {
          title: "Document",
          questionItem: { question: { questionId: "q3", required: true } },
        },
      ];
      holder.responses = [
        {
          respondentEmail: STUDENT.user.email,
          answers: {
            q1: text("Good"),
            q3: {
              fileUploadAnswers: {
                answers: [{ fileId: "file-1", fileName: "document.pdf" }],
              },
            },
          },
        },
      ];
      const { step } = await read();
      expect(step.profilingResponse.missingRequired).toEqual([
        "Skills — Reading",
      ]);
      expect(step.profilingResponse.answers).toContainEqual({
        label: "Document",
        value: "document.pdf",
      });
    });

    it("needs a form to be set up", async () => {
      context.store[COLLECTIONS.academicYear][0].profilingForm = null;
      expect((await post()).status).toBe(412);
    });
  });

  it("will not cancel a verified step", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-4",
      studentProfileId: "profile-1",
      stepId: "MUGSHOT",
      academicYearId: "ay-1",
      status: "VERIFIED",
    });
    const response = await call("/me/steps/MUGSHOT/submission", {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
  });
});
