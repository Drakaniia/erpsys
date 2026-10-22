import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/config/errors.js";
import {
  STORAGE_MB,
  STORAGE_MIME_ALLOWLIST,
  STORAGE_ROUTE_CAPS,
  STORAGE_SESSION_TTL_MS,
  STORAGE_STAMP_KIND,
  buildStorageFinalizeUpdate,
  buildStorageKey,
  extForMime,
  resolveStorageKind,
  sessionFileName,
  storageRowStatus,
  validateSessionInput,
} from "../../../src/lib/storage/sessions.js";

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  throw new Error("expected an ApiError");
}

describe("validateSessionInput", () => {
  it("accepts a legal evidence upload", () => {
    expect(() =>
      validateSessionInput({
        route: "evidenceImage",
        mime: "image/jpeg",
        size: 1000,
      }),
    ).not.toThrow();
    expect(() =>
      validateSessionInput({
        route: "evidenceImage",
        mime: "application/pdf",
        size: 10 * STORAGE_MB,
      }),
    ).not.toThrow();
  });

  it("enforces the locked caps", () => {
    expect(STORAGE_ROUTE_CAPS.evidenceImage).toBe(10 * STORAGE_MB);
    expect(STORAGE_ROUTE_CAPS.mugshotCapture).toBe(10 * STORAGE_MB);
    expect(STORAGE_ROUTE_CAPS.stampImage).toBe(5 * STORAGE_MB);
    expect(STORAGE_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(STORAGE_MIME_ALLOWLIST).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    expect(
      codeOf(() =>
        validateSessionInput({
          route: "stampImage",
          mime: "image/jpeg",
          size: 5 * STORAGE_MB + 1,
        }),
      ),
    ).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects non-allowlisted mimes and bad sizes", () => {
    expect(
      codeOf(() =>
        validateSessionInput({
          route: "evidenceImage",
          mime: "image/gif",
          size: 10,
        }),
      ),
    ).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(
      codeOf(() =>
        validateSessionInput({
          route: "evidenceImage",
          mime: "image/jpeg",
          size: 0,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      codeOf(() =>
        validateSessionInput({
          route: "evidenceImage",
          mime: "image/jpeg",
          size: 1.5,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

describe("resolveStorageKind", () => {
  it("resolves evidence through the step map", () => {
    expect(
      resolveStorageKind({
        route: "evidenceImage",
        stepCode: "SOCIAL_MEDIA",
        kindForStep: { SOCIAL_MEDIA: "SOCIAL_SCREENSHOT" },
      }),
    ).toBe("SOCIAL_SCREENSHOT");
  });

  it("uses fixed kinds for mugshot and stamp", () => {
    expect(resolveStorageKind({ route: "mugshotCapture" })).toBe("MUGSHOT");
    expect(resolveStorageKind({ route: "stampImage" })).toBe(
      STORAGE_STAMP_KIND,
    );
  });

  it("requires a known stepCode for evidence", () => {
    expect(codeOf(() => resolveStorageKind({ route: "evidenceImage" }))).toBe(
      "BAD_REQUEST",
    );
  });
});

describe("buildStorageKey", () => {
  it("keeps the locked prefix layout with a step segment for evidence", () => {
    expect(
      buildStorageKey({
        academicYear: "2026-2027",
        category: "Evidence",
        stepCode: "SOCIAL_MEDIA",
        ownerPart: "11283712",
        uploadId: "u1",
        fileName: "evidenceImage-u1.jpg",
      }),
    ).toBe(
      "erpsys/2026-2027/Evidence/SOCIAL_MEDIA/11283712/u1-evidenceImage-u1.jpg",
    );
  });

  it("omits the step segment for mugshot and stamp", () => {
    expect(
      buildStorageKey({
        academicYear: "2026-2027",
        category: "Mugshot",
        ownerPart: "11283712",
        uploadId: "u2",
        fileName: "mugshotCapture-u2.png",
      }),
    ).toBe("erpsys/2026-2027/Mugshot/11283712/u2-mugshotCapture-u2.png");
  });

  it("sanitizes traversal out of every segment", () => {
    const key = buildStorageKey({
      academicYear: "../../etc",
      category: "Stamp",
      ownerPart: "../o",
      uploadId: "u3",
      fileName: "../../evil.png",
    });
    expect(key).not.toContain("..");
    expect(key.startsWith("erpsys/")).toBe(true);
  });
});

describe("finalize + status helpers", () => {
  it("builds one finalize shape with the r2 key and a 24h deadline", () => {
    const now = new Date("2026-10-14T00:00:00.000Z");
    const { fileKey, update } = buildStorageFinalizeUpdate({
      bucket: "erpsys-prod",
      key: "erpsys/2026/Evidence/u1/a.jpg",
      kind: "SOCIAL_SCREENSHOT",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      now,
    });
    expect(fileKey).toBe("r2:erpsys-prod:erpsys/2026/Evidence/u1/a.jpg");
    expect(update).toMatchObject({
      backend: "r2",
      r2Status: "complete",
      r2Bucket: "erpsys-prod",
      r2Key: "erpsys/2026/Evidence/u1/a.jpg",
      fileUrl: null,
    });
    expect((update.expiresAt as Date).toISOString()).toBe(
      "2026-10-15T00:00:00.000Z",
    );
  });

  it("reads status off the row", () => {
    expect(storageRowStatus({ r2Status: "complete" })).toBe("complete");
    expect(storageRowStatus({ r2Status: "abandoned" })).toBe("abandoned");
    expect(storageRowStatus({})).toBe("pending");
  });

  it("names session files with a mime-derived extension", () => {
    expect(extForMime("application/pdf")).toBe("pdf");
    expect(sessionFileName("evidenceImage", "upload-1", "image/png")).toBe(
      "evidenceImage-upload-1.png",
    );
  });
});
