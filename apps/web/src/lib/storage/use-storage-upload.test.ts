import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ROUTES } from "$lib/api-routes";
import {
  MAX_BYTES_BY_ROUTE,
  STORAGE_ACCEPT,
  STORAGE_MAINTENANCE_MESSAGE,
  useStorageUpload,
  validateStorageFile,
} from "./use-storage-upload";

function fileOf(size: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], "evidence.jpg", { type });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UPLOAD_URL = "https://r2.test/presigned-put";

// Compression is a separate module with its own tests; here we only prove the
// hook uploads whatever it returns (same bytes the server signs for).
const compress = vi.hoisted(() => ({
  run: (file: File): Promise<File> => Promise.resolve(file),
}));
vi.mock(import("./compress"), async (importOriginal) => ({
  ...(await importOriginal()),
  compressImageFile: (file: File) => compress.run(file),
}));

beforeEach(() => {
  compress.run = async (file: File) => file;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({})),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage routes", () => {
  it("exposes the /storage/* contract paths", () => {
    expect(ROUTES.storage.mintSession).toMatchObject({
      method: "POST",
      path: "/api/v1/storage/session",
    });
    expect(ROUTES.storage.completeUpload).toMatchObject({
      method: "POST",
      path: "/api/v1/storage/complete",
    });
    expect(ROUTES.storage.sessionStatus).toMatchObject({
      method: "GET",
      path: "/api/v1/storage/session-status",
    });
    expect(ROUTES.storage.getContent).toMatchObject({
      method: "GET",
      path: "/api/v1/uploads/:id/content",
    });
  });
});

describe("accept-filter + caps", () => {
  it("accepts jpeg/png/webp/pdf", () => {
    for (const type of STORAGE_ACCEPT.split(","))
      expect(validateStorageFile(fileOf(10, type), "evidenceImage")).toBeNull();
  });
  it("rejects unsupported types and oversized PDFs per route", () => {
    expect(
      validateStorageFile(fileOf(10, "image/gif"), "evidenceImage"),
    ).toMatch(/not supported/);
    // A PDF cannot be compressed client-side, so the cap is final.
    expect(
      validateStorageFile(
        fileOf(10 * 1024 * 1024 + 1, "application/pdf"),
        "evidenceImage",
      ),
    ).toMatch(/max 10 MB/);
    expect(
      validateStorageFile(
        fileOf(5 * 1024 * 1024 + 1, "application/pdf"),
        "stampImage",
      ),
    ).toMatch(/max 5 MB/);
    expect(MAX_BYTES_BY_ROUTE.evidenceImage).toBe(10 * 1024 * 1024);
    expect(MAX_BYTES_BY_ROUTE.mugshotCapture).toBe(10 * 1024 * 1024);
    expect(MAX_BYTES_BY_ROUTE.stampImage).toBe(5 * 1024 * 1024);
  });

  it("admits an oversized image so compression runs before the cap", () => {
    // A 14 MB phone photo fits once it is downscaled — rejecting it up front
    // would make the compression pointless.
    expect(
      validateStorageFile(
        fileOf(14 * 1024 * 1024, "image/jpeg"),
        "evidenceImage",
      ),
    ).toBeNull();
    expect(
      validateStorageFile(fileOf(8 * 1024 * 1024, "image/webp"), "stampImage"),
    ).toBeNull();
  });

  it("rejects an image past the input ceiling that compression may decode", () => {
    expect(
      validateStorageFile(
        fileOf(40 * 1024 * 1024 + 1, "image/jpeg"),
        "evidenceImage",
      ),
    ).toMatch(/up to 40 MB/);
    expect(
      validateStorageFile(
        fileOf(20 * 1024 * 1024 + 1, "image/png"),
        "stampImage",
      ),
    ).toMatch(/up to 20 MB/);
  });
});

describe("useStorageUpload", () => {
  it("happy path mints → PUTs bytes with Content-Type/Length → completes", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const puts: { contentType: string; contentLength: string }[] = [];
    const completeBodies: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/storage/session")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          route: "evidenceImage",
          mime: "image/jpeg",
        });
        return json({
          data: {
            uploadId: "u1",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      }
      if (url === UPLOAD_URL) {
        const headers = init?.headers as Record<string, string>;
        puts.push({
          contentType: headers["Content-Type"],
          contentLength: headers["Content-Length"],
        });
        return new Response(null, { status: 200 });
      }
      if (String(url).endsWith("/api/v1/storage/complete")) {
        completeBodies.push(JSON.parse(String(init?.body)));
        return json({
          data: { id: "u1", fileKey: "r2:b:k1", fileUrl: null, kind: "X" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    let out!: Awaited<ReturnType<typeof result.current.upload>>;
    await act(async () => {
      out = await result.current.upload(fileOf(100));
    });
    expect(out).toMatchObject({ fileKey: "r2:b:k1", uploadId: "u1" });
    expect(puts).toEqual([{ contentType: "image/jpeg", contentLength: "100" }]);
    expect(completeBodies).toEqual([{ uploadId: "u1" }]);
  });

  it("503 on mint surfaces the maintenance copy", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/v1/storage/session"))
        return new Response(null, { status: 503 });
      throw new Error(`must not call ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        STORAGE_MAINTENANCE_MESSAGE,
      );
    });
  });

  it("503 on PUT surfaces the maintenance copy without reconcile", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const calls: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/v1/storage/session"))
        return json({
          data: {
            uploadId: "u2",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      if (url === UPLOAD_URL) return new Response(null, { status: 503 });
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        STORAGE_MAINTENANCE_MESSAGE,
      );
    });
    expect(calls.some((c) => c.includes("session-status"))).toBe(false);
  });

  it("mint failure surfaces the server message instead of a bare status", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/v1/storage/session"))
        return json(
          { error: "A known stepCode is required for evidence uploads." },
          400,
        );
      throw new Error(`must not call ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        "A known stepCode is required for evidence uploads.",
      );
    });
  });

  it("PUT 403 surfaces the status so CORS/signature mismatches are diagnosable", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/v1/storage/session"))
        return json({
          data: {
            uploadId: "u6",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      if (url === UPLOAD_URL) return new Response(null, { status: 403 });
      if (String(url).includes("session-status"))
        return json({ data: { status: "abandoned", bytesReceived: 0 } });
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        "Upload failed (403)",
      );
    });
  });

  it("offline mint surfaces the network copy", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        "Network error",
      );
    });
  });

  it("killed PUT retries once then converges via idempotent complete", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let puts = 0;
    let completes = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/storage/session"))
        return json({
          data: {
            uploadId: "u3",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      if (url === UPLOAD_URL) {
        puts += 1;
        if (puts === 1) throw new Error("killed mid-upload");
        return new Response(null, { status: 200 });
      }
      if (String(url).includes("session-status"))
        return json({ data: { status: "pending", bytesReceived: 0 } });
      if (String(url).endsWith("/api/v1/storage/complete")) {
        completes += 1;
        return json({
          data: { id: "u3", fileKey: "r2:b:k3", fileUrl: null, kind: "X" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const progress: number[] = [];
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    let out!: Awaited<ReturnType<typeof result.current.upload>>;
    await act(async () => {
      out = await result.current.upload(fileOf(100), {
        onProgress: (p) => progress.push(p),
      });
    });
    expect(out.fileKey).toBe("r2:b:k3");
    expect(puts).toBe(2);
    expect(completes).toBe(1);
    expect(progress.at(-1)).toBe(100);
  });

  it("failed complete converges when the server already finalized", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let completes = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/v1/storage/session"))
        return json({
          data: {
            uploadId: "u4",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      if (url === UPLOAD_URL) return new Response(null, { status: 200 });
      if (String(url).includes("session-status"))
        return json({ data: { status: "complete", bytesReceived: 100 } });
      if (String(url).endsWith("/api/v1/storage/complete")) {
        completes += 1;
        if (completes === 1) return json({ error: "boom" }, 500);
        return json({
          data: { id: "u4", fileKey: "r2:b:k4", fileUrl: null, kind: "X" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    let out!: Awaited<ReturnType<typeof result.current.upload>>;
    await act(async () => {
      out = await result.current.upload(fileOf(100));
    });
    expect(out.fileKey).toBe("r2:b:k4");
    expect(completes).toBe(2);
  });

  it("uploads the compressed bytes and mints the session for their size", async () => {
    compress.run = async () =>
      new File([new Uint8Array(50)], "photo.webp", { type: "image/webp" });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const mintBodies: { mime: string; size: number }[] = [];
    const puts: { contentType: string; contentLength: string }[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/storage/session")) {
        mintBodies.push(JSON.parse(String(init?.body)));
        return json({
          data: {
            uploadId: "u7",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      }
      if (url === UPLOAD_URL) {
        const headers = init?.headers as Record<string, string>;
        puts.push({
          contentType: headers["Content-Type"],
          contentLength: headers["Content-Length"],
        });
        return new Response(null, { status: 200 });
      }
      if (String(url).endsWith("/api/v1/storage/complete"))
        return json({
          data: { id: "u7", fileKey: "r2:b:k7", fileUrl: null, kind: "X" },
        });
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await result.current.upload(fileOf(4 * 1024 * 1024));
    });
    expect(mintBodies).toEqual([
      expect.objectContaining({ mime: "image/webp", size: 50 }),
    ]);
    expect(puts).toEqual([{ contentType: "image/webp", contentLength: "50" }]);
  });

  it("refuses a file still over the cap after compression, without minting", async () => {
    compress.run = async (file: File) => file;
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      throw new Error(`must not call ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      await expect(
        result.current.upload(fileOf(14 * 1024 * 1024)),
      ).rejects.toThrow("max 10 MB after compression");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abandoned session throws instead of finalizing", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const calls: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/v1/storage/session"))
        return json({
          data: {
            uploadId: "u5",
            uploadUrl: UPLOAD_URL,
            sessionExpiresAt: "x",
          },
        });
      if (url === UPLOAD_URL) throw new Error("killed mid-upload");
      if (String(url).includes("session-status"))
        return json({ data: { status: "abandoned", bytesReceived: 0 } });
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useStorageUpload("evidenceImage"));
    await act(async () => {
      // A killed PUT is a network failure now — the copy says so, and the
      // abandoned row still blocks finalize (asserted below).
      await expect(result.current.upload(fileOf(100))).rejects.toThrow(
        "Network error",
      );
    });
    expect(calls.some((c) => c.endsWith("/api/v1/storage/complete"))).toBe(
      false,
    );
  });
});
