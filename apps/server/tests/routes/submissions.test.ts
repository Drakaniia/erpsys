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
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});

const OFFICER = {
  user: {
    id: "off1",
    email: "sbo@buksu.edu.ph",
    role: "SBO_OFFICER",
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

    [COLLECTIONS.content]: [
      { _id: "req-1", kind: "requirement", label: "Form 5", isActive: true, order: 1 },
      { _id: "req-2", kind: "requirement", label: "Retired form", isActive: false, order: 2 },
    ],
    [COLLECTIONS.upload]: [
      {
        _id: "up-1",
        studentProfileId: "profile-1",
        kind: "MUGSHOT",
        fileKey: "r2:uploads/a.png",
        fileUrl: "https://cdn/a.png",
        mimeType: "image/png",
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "stud1",
        studentProfile: { _id: "profile-1", studentNumber: "12345", academicYearId: "ay-1" },
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        image: "  ",
      },
      {
        _id: "off1",
        name: "Officer",
        email: "sbo@buksu.edu.ph",
        stampName: "SBO Stamp",
      },
    ],

    [COLLECTIONS.stepVerification]: [
      {
        _id: "ver-1",
        studentProfileId: "profile-1",
        stepId: "MUGSHOT",
        academicYearId: "ay-1",
        status: "SUBMITTED",
        appliedAt: new Date("2025-07-01"),
      },
      {
        _id: "ver-2",
        studentProfileId: "profile-1",
        stepId: "MUGSHOT",
        academicYearId: "ay-1",
        status: "VERIFIED",
      },
      {
        _id: "ver-old",
        studentProfileId: "profile-1",
        stepId: "MUGSHOT",
        academicYearId: "ay-old",
        status: "SUBMITTED",
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
  holder.session = OFFICER;
  context = fakeDb(seed());
  holder.db = context.db;
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

const verification = (id = "ver-1") =>
  context.store[COLLECTIONS.stepVerification].find((row) => row._id === id)!;

describe("submission review", () => {
  it("verifies a submitted step and notifies the student", async () => {
    const response = await call("/submissions/ver-1/verification", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      verificationId: "ver-1",
      status: "VERIFIED",
    });
    expect(verification()).toMatchObject({
      status: "VERIFIED",
      verifiedById: "off1",
    });
    expect(
      context.store[COLLECTIONS.notification].some(
        (row) => row.type === "STEP_VERIFIED",
      ),
    ).toBe(true);
  });

  it("revokes a stamp and clears the application", async () => {
    const response = await call("/submissions/ver-2/verification", {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(verification("ver-2")).toMatchObject({
      status: "PENDING",
      revokedById: "off1",
    });
  });

  it("refuses to revoke a step that is not verified", async () => {
    const response = await call("/submissions/ver-1/verification", {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Only verified steps can be revoked.",
    );
  });

  it("returns a submission with chips and a note", async () => {
    const response = await call("/submissions/ver-1/replies", {
      method: "POST",
      body: JSON.stringify({ chips: ["Blurry photo"], note: "Retake it." }),
    });
    expect(response.status).toBe(200);
    expect(verification()).toMatchObject({
      status: "RETURNED",
      replyChips: ["Blurry photo"],
      replyNote: "Retake it.",
      respondedById: "off1",
    });
    expect(
      context.store[COLLECTIONS.notification].find(
        (row) => row.type === "STEP_RETURNED",
      ),
    ).toMatchObject({ body: "Retake it." });
  });

  it("refuses to return a verified step", async () => {
    const response = await call("/submissions/ver-2/replies", {
      method: "POST",
      body: JSON.stringify({ chips: [] }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Cannot return a verified step — revoke the stamp first.",
    );
  });

  it("lists the queue with step metadata and the archive left out", async () => {
    const response = await call("/submissions");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(
      body.data
        .map((row: { verificationId: string }) => row.verificationId)
        .sort(),
    ).toEqual(["ver-1"]);
    expect(body.data[0]).toMatchObject({
      stepCode: "MUGSHOT",
      stepName: "Mugshot",
      student: { name: "Ana", studentNumber: "12345" },
      evidenceCount: 0,
      hasReply: false,
    });
  });

  it("keeps returned and verified rows out even with a legacy status query", async () => {
    await call("/submissions/ver-1/replies", {
      method: "POST",
      body: JSON.stringify({ chips: ["Retake it"] }),
    });
    const queue = await (await call("/submissions?status=RETURNED")).json();
    expect(queue).toMatchObject({ total: 0, data: [] });
  });

  it("filters by student number", async () => {

    const noMatch = await (await call("/submissions?q=99999")).json();
    expect(noMatch.data).toEqual([]);
  });

  it("lists a revoked assessment again only after the student reapplies", async () => {

    const row = verification("ver-2");
    row.stepId = "ASSESSMENT";
    row.appliedAt = new Date("2025-07-01");
    expect((await call("/submissions/ver-2/verification", { method: "DELETE" })).status).toBe(200);
    const queue = () => call("/submissions?step=ASSESSMENT").then((response) => response.json());
    expect(await queue()).toMatchObject({ total: 0, data: [] });
    holder.session = { user: { id: "stud1", email: "12345@student.buksu.edu.ph", role: "STUDENT" } };
    const applied = await call("/me/assessment", { method: "POST", body: "{}" });
    expect(applied.status).toBe(200);
    holder.session = OFFICER;
    expect(await queue()).toMatchObject({
      total: 1, data: [{ verificationId: "ver-2", status: "PENDING", evidence: [] }],
    });
    expect(verification("ver-2").appliedAt).not.toEqual(new Date("2025-07-01"));
  });

  it("identifies an imported Google Forms response without exposing its answers in the list", async () => {

    const row = verification();
    row.stepId = "PROFILING";
    row.answers = [];
    const { data } = await (await call("/submissions?step=PROFILING")).json();
    expect(data[0]).toMatchObject({ hasGoogleFormsResponse: true, evidence: [] });
    expect(data[0]).not.toHaveProperty("answers");
  });

  it("re-sorts the page by student name", async () => {
    const body = await (
      await call("/submissions?sort=studentName&dir=asc")
    ).json();
    const names = body.data.map(
      (row: { student: { name: string } }) => row.student.name,
    );
    expect(names).toEqual(
      [...names].sort((a: string, b: string) => a.localeCompare(b)),
    );
  });

  it("returns the submission with evidence and requirements", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "ver-detail",
      studentProfileId: "profile-1",
      stepId: "ASSESSMENT",
      academicYearId: "ay-1",
      status: "SUBMITTED",
      appliedAt: new Date("2025-07-03T08:00:00Z"),
      evidence: { uploadIds: ["up-1"] },
    });
    const response = await call("/submissions/ver-detail");
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      verificationId: "ver-detail",
      status: "SUBMITTED",
      submittedAt: "2025-07-03T08:00:00.000Z",
      student: {
        name: "Ana",
        studentNumber: "12345",
        email: "12345@student.buksu.edu.ph",
        image: null,
      },
      evidence: [
        {
          id: "up-1",
          kind: "MUGSHOT",
          fileUrl: "https://cdn/a.png",
          mime: "image/png",
        },
      ],
      stamp: null,
      reply: null,
    });
  });

  it("drops the notice when the verification does not exist", async () => {
    const response = await call("/submissions/nope");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Verification not found.");
  });

  it("captures a mugshot and stamps the step in one call", async () => {
    const response = await call("/students/ver-1/mugshot", {
      method: "PUT",
      body: JSON.stringify({
        fileKey: "r2:uploads/mug.png",
        fileUrl: "https://cdn/mug.png",
      }),
    });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ verificationId: "ver-1", status: "VERIFIED" });
    expect(verification()).toMatchObject({
      status: "VERIFIED",
      verifiedById: "off1",
      evidenceCount: 1,
      evidence: { uploadIds: [data.uploadId] },
    });
    expect(
      context.store[COLLECTIONS.upload].find(
        (row) => row._id === data.uploadId,
      ),
    ).toMatchObject({ kind: "MUGSHOT", studentProfileId: "profile-1" });
  });

  it("refuses to recapture a verified mugshot", async () => {
    const response = await call("/students/ver-2/mugshot", {
      method: "PUT",
      body: JSON.stringify({
        fileKey: "r2:a.png",
        fileUrl: "https://cdn/a.png",
      }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("already verified");
  });

  it("only captures for the Mugshot step", async () => {

    context.store[COLLECTIONS.stepVerification].push({
      _id: "ver-assessment",
      studentProfileId: "profile-1",
      stepId: "ASSESSMENT",
      academicYearId: "ay-1",
      status: "SUBMITTED",
    });
    const response = await call("/students/ver-assessment/mugshot", {
      method: "PUT",
      body: JSON.stringify({
        fileKey: "r2:a.png",
        fileUrl: "https://cdn/a.png",
      }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Mugshot capture is only for the Mugshot step.",
    );
  });

  it("refuses a record from an archived year", async () => {
    const response = await call("/submissions/ver-old/verification", {
      method: "POST",
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This record belongs to an archived academic year.",
    );
  });
});
