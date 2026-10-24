import { describe, expect, it, vi } from "vitest";
import { compressImageFile, type CompressDeps } from "./compress";

function fileOf(size: number, name = "photo.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function depsFor(
  out: Blob | null,
  image: { width: number; height: number } = { width: 4000, height: 3000 },
) {
  const release = vi.fn();
  const encode = vi.fn(async () => out);
  const decode = vi.fn(async () => ({
    ...image,
    source: {} as CanvasImageSource,
    release,
  }));
  return { deps: { decode, encode } as CompressDeps, decode, encode, release };
}

describe("compressImageFile", () => {
  it("downscales a large photo to the longest-edge cap before re-encoding", async () => {
    const { deps, encode } = depsFor(
      new Blob([new Uint8Array(1024 * 1024)], { type: "image/jpeg" }),
    );

    const out = await compressImageFile(fileOf(4 * 1024 * 1024), deps);

    expect(encode).toHaveBeenCalledWith(
      expect.anything(),
      2560,
      1920,
      "image/jpeg",
      0.9,
    );
    expect(out.size).toBe(1024 * 1024);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo.jpg");
  });

  it("keeps the original bytes when the re-encode saves almost nothing", async () => {
    // 3.8 MB of 4 MB is under the 10% threshold — re-encoding would only
    // trade quality for noise, so the untouched file must win.
    const { deps } = depsFor(
      new Blob([new Uint8Array(3.8 * 1024 * 1024)], { type: "image/jpeg" }),
    );
    const original = fileOf(4 * 1024 * 1024);

    const out = await compressImageFile(original, deps);

    expect(out).toBe(original);
  });

  it("converts PNG to WebP, renames the extension, and keeps transparency", async () => {
    const { deps, encode } = depsFor(
      new Blob([new Uint8Array(400 * 1024)], { type: "image/webp" }),
      { width: 3000, height: 2000 },
    );

    const out = await compressImageFile(
      fileOf(3 * 1024 * 1024, "screenshot.png", "image/png"),
      deps,
    );

    expect(encode).toHaveBeenCalledWith(
      expect.anything(),
      2560,
      1707,
      "image/webp",
      0.9,
    );
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("screenshot.webp");
    expect(out.size).toBe(400 * 1024);
  });

  it("leaves PDFs untouched and never decodes them", async () => {
    const { deps, decode, encode } = depsFor(null);
    const original = fileOf(
      6 * 1024 * 1024,
      "clearance.pdf",
      "application/pdf",
    );

    const out = await compressImageFile(original, deps);

    expect(out).toBe(original);
    expect(decode).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });

  it("skips images under the byte floor instead of re-encoding them", async () => {
    const { deps, decode } = depsFor(new Blob([new Uint8Array(1024)]));
    const original = fileOf(200 * 1024, "small.jpg");

    const out = await compressImageFile(original, deps);

    expect(out).toBe(original);
    expect(decode).not.toHaveBeenCalled();
  });

  it("falls back to the original when the bytes cannot be decoded", async () => {
    const encode = vi.fn(async () => new Blob([new Uint8Array(10)]));
    const deps: CompressDeps = {
      decode: async () => {
        throw new Error("unsupported image");
      },
      encode,
    };
    const original = fileOf(4 * 1024 * 1024);

    const out = await compressImageFile(original, deps);

    expect(out).toBe(original);
    expect(encode).not.toHaveBeenCalled();
  });

  it("returns the original when the browser cannot decode at all", async () => {
    // jsdom has no createImageBitmap, which is exactly the older-browser case:
    // the upload must still go through with the untouched file.
    const original = fileOf(4 * 1024 * 1024);

    const out = await compressImageFile(original);

    expect(out).toBe(original);
  });

  it("releases the decoded bitmap even when encoding fails", async () => {
    const { deps, release } = depsFor(null);

    const out = await compressImageFile(fileOf(4 * 1024 * 1024), deps);

    expect(out.size).toBe(4 * 1024 * 1024);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
