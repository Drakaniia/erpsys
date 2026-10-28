import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StepCard from "./StepCard";
import type { StepRow } from "$lib/student/types";

afterEach(() => vi.unstubAllGlobals());

function stepWithEvidence(evidence: unknown[]) {
  return {
    code: "PROFILING",
    status: "PENDING",
    order: 3,
    name: "Profiling",
    hint: "Complete the form",
    chip: { label: "Pending", tone: "muted" },
    evidence,
    reply: null,
    stamp: null,
  } as unknown as StepRow;
}

describe("StepCard thumbs", () => {
  it("loads r2 evidence through the content proxy instead of a blank tile", async () => {
    const blob = new Blob(["bytes"], { type: "image/jpeg" });
    const fetchMock = vi.fn(async (_url: unknown) => ({
      status: 200,
      ok: true,
      blob: async () => blob,
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:mock-r9",
      revokeObjectURL: () => {},
    });
    render(
      <StepCard
        step={stepWithEvidence([
          {
            id: "r9",
            fileKey: "r2:bkt:erpsys/r9.jpg",
            fileUrl: null,
            mime: "image/jpeg",
            name: "r9.jpg",
            kind: "UPLOAD",
            expired: false,
          },
        ])}
        hint="Complete the form"
        readyForQueue={false}
        queue={null}
        onclick={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:mock-r9"),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/v1/uploads/r9/content",
    );
  });

  it("keeps rendering legacy https rows directly", () => {
    render(
      <StepCard
        step={stepWithEvidence([
          {
            id: "i1",
            fileKey: "k1",
            fileUrl: "https://u/1.jpg",
            kind: "UPLOAD",
            expired: false,
          },
        ])}
        hint="Complete the form"
        readyForQueue={false}
        queue={null}
        onclick={() => {}}
      />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://u/1.jpg");
  });

  it("never renders paste-links as thumbnails", () => {
    render(
      <StepCard
        step={stepWithEvidence([
          {
            id: "l1",
            fileUrl: "https://storage.to/abc",
            kind: "EXTERNAL_LINK",
            expired: false,
          },
        ])}
        hint="Complete the form"
        readyForQueue={false}
        queue={null}
        onclick={() => {}}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });
});
