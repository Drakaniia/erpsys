import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import EvidenceUploadPanel from "./EvidenceUploadPanel";

const flags = {
  turnstile: true,
  r2: true,
  googleAuth: true,
  cloudflareChat: true,
};

vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => ({ flags, pending: false }),
}));

beforeEach(() => {
  flags.r2 = true;
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
});

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, { target: { files: [file] } });
}

const existingItem = {
  id: "r9",
  fileKey: "k9",
  fileUrl: "https://u/9.jpg",
  mime: "image/jpeg",
  name: "9.jpg",
  kind: "UPLOAD",
  expired: false,
};

function renderPanel(
  items: unknown[],
  overrides: Partial<React.ComponentProps<typeof EvidenceUploadPanel>> = {},
) {
  return render(
    <EvidenceUploadPanel
      items={items as never}
      locked={false}
      label="Front ID photo"
      uploading={false}
      pending={[]}
      onpick={() => {}}
      onremovepending={() => {}}
      ondelete={() => {}}
      onpreview={() => {}}
      {...overrides}
    />,
  );
}

/**
 * R2 off means no new bytes, not no files: the dropzone disappears while the
 * already-attached evidence keeps rendering with its remove affordance, or a
 * disabled integration reads as data loss.
 */
describe("EvidenceUploadPanel with R2 off", () => {
  it("hides the dropzone but keeps the existing file row", () => {
    flags.r2 = false;
    renderPanel([existingItem]);

    expect(screen.queryByRole("button", { name: "Front ID photo" })).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://u/9.jpg");
    expect(screen.getByRole("button", { name: "Remove upload" })).toBeTruthy();
  });

  it("names the pause instead of rendering an empty panel", () => {
    flags.r2 = false;
    renderPanel([]);

    expect(screen.getByText("Uploads are paused")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Front ID photo" })).toBeNull();
  });

  it("still offers the dropzone when R2 is on", () => {
    flags.r2 = true;
    renderPanel([]);
    expect(screen.getByRole("button", { name: "Front ID photo" })).toBeTruthy();
    expect(screen.queryByText("Uploads are paused")).toBeNull();
  });
});

/**
 * The picked file waits in the sheet until submit, so the panel must hand the
 * File up and render whatever pending preview the parent hands back — it never
 * uploads on pick.
 */
describe("EvidenceUploadPanel deferred upload", () => {
  it("hands the picked file up instead of uploading it", () => {
    const onpick = vi.fn();
    const { container } = renderPanel([], { onpick });
    const file = new File([new Uint8Array(10)], "id.jpg", {
      type: "image/jpeg",
    });

    pick(container, file);

    expect(onpick).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Upload failed", { exact: false })).toBeNull();
  });

  it("rejects a file type it cannot upload", () => {
    const onpick = vi.fn();
    const { container } = renderPanel([], { onpick });

    pick(container, new File(["x"], "notes.txt", { type: "text/plain" }));

    expect(onpick).not.toHaveBeenCalled();
    expect(screen.getByText(/File type not supported/)).toBeTruthy();
  });

  it("renders the queued preview and lets the student drop it", () => {
    const onremovepending = vi.fn();
    renderPanel([], {
      pending: [{ id: "p1", name: "id.jpg", previewUrl: "blob:local" }],
      onremovepending,
    });

    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:local");
    fireEvent.click(screen.getByRole("button", { name: "Remove upload" }));
    expect(onremovepending).toHaveBeenCalledWith("p1");
  });

  it("removes the attachment on the click, without waiting on the delete", () => {
    const ondelete = vi.fn();
    renderPanel([existingItem], { ondelete });

    fireEvent.click(screen.getByRole("button", { name: "Remove upload" }));

    expect(ondelete).toHaveBeenCalledWith("r9");
    expect(screen.queryByText(/removing|deleting/i)).toBeNull();
  });
});
