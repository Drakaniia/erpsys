import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DriveThumb from "./DriveThumb";

afterEach(() => vi.unstubAllGlobals());

describe("DriveThumb", () => {
  it("renders a file-chip, never an img, for PDF rows", () => {
    render(
      <DriveThumb
        item={{
          id: "p1",
          fileKey: "r2:bkt:erpsys/p1-scan.pdf",
          fileUrl: null,
          name: "scan.pdf",
          mime: "application/pdf",
        }}
        alt="Upload 1"
      />,
    );
    expect(screen.getByText("scan.pdf")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("PDF")).toBeTruthy();
  });

  it("renders an img for legacy image rows", () => {
    render(
      <DriveThumb
        item={{ id: "i1", fileKey: "k1", fileUrl: "https://u/1.jpg" }}
        alt="Upload 1"
        className="thumb"
      />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://u/1.jpg");
  });

  it("loads r2 image bytes through the content proxy", async () => {
    const blob = new Blob(["bytes"], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        expect(String(url)).toContain("/api/v1/uploads/r9/content");
        return { status: 200, ok: true, blob: async () => blob };
      }),
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:mock-r9",
      revokeObjectURL: () => {},
    });
    render(
      <DriveThumb
        item={{
          id: "r9",
          fileKey: "r2:bkt:erpsys/r9.jpg",
          fileUrl: null,
          mime: "image/jpeg",
        }}
        alt="Upload 9"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:mock-r9"),
    );
  });
});
