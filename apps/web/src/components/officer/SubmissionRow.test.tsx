import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SubmissionRow from "./SubmissionRow";
import type { ListItem } from "$lib/officer/types";

afterEach(() => vi.unstubAllGlobals());

function itemWithEvidence(evidence: unknown[]) {
  return {
    verificationId: "v1",
    student: { id: "p1", name: "Ana", studentNumber: "S1", image: null },
    status: "SUBMITTED",
    submittedAt: new Date("2026-09-26T12:00:00.000Z").toISOString(),
    verifiedAt: null,
    evidence,
    evidenceCount: evidence.length,
    hasReply: false,
  } as unknown as ListItem;
}

describe("SubmissionRow thumbs", () => {
  it("loads r2 evidence through the content proxy", async () => {
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
      <SubmissionRow
        item={itemWithEvidence([
          {
            id: "r9",
            fileUrl: "",
            fileKey: "r2:bkt:erpsys/r9.jpg",
            mime: "image/jpeg",
            name: null,
            kind: "PROFILING_SCREENSHOT",
          },
        ])}
        view="cards"
        unread={false}
        onopen={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:mock-r9"),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/uploads/r9/content",
    );
  });

  it("renders nothing when there is no evidence", () => {
    render(
      <SubmissionRow
        item={itemWithEvidence([])}
        view="cards"
        unread={false}
        onopen={() => {}}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  // Profiling is a Google Form step: its table drops the Evidence column, so
  // the row must not render a cell that would shift Status under the wrong header.
  it("drops the evidence cell when the column is hidden", () => {
    const { container } = render(
      <table>
        <tbody>
          <SubmissionRow
            item={itemWithEvidence([])}
            view="table"
            unread={false}
            showEvidence={false}
            onopen={() => {}}
          />
        </tbody>
      </table>,
    );
    expect(container.querySelectorAll("td")).toHaveLength(4);
  });
});
