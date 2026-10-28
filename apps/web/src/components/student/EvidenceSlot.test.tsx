import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EvidenceSlot from "./EvidenceSlot";

vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => ({
    flags: { turnstile: true, r2: true, googleAuth: true, cloudflareChat: true },
    pending: false,
  }),
}));

const storage = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("$lib/storage/use-storage-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/storage/use-storage-upload")>()),
  useStorageUpload: () => ({ upload: storage.upload }),
}));

beforeEach(() => {
  storage.upload.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
});

function pickFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, {
    target: {
      files: [new File([new Uint8Array(10)], "id.jpg", { type: "image/jpeg" })],
    },
  });
}

function renderSlot() {
  const onqueue = vi.fn();
  const onupload = vi.fn(async () => {});
  const view = render(
    <EvidenceSlot
      items={[]}
      locked={false}
      label="Upload photo"
      uploading={false}
      onupload={onupload}
      ondelete={() => {}}
      onpreview={() => {}}
      onqueue={onqueue}
      stepCode="MUGSHOT"
    />,
  );
  return { ...view, onqueue, onupload };
}

/** The picked file is held locally until the sheet runs the queued upload. */
describe("EvidenceSlot deferred upload", () => {
  it("uploads and attaches only when the queued run is invoked", async () => {
    storage.upload.mockResolvedValue({
      fileKey: "r2:b:k1",
      fileUrl: "",
      uploadId: "u1",
    });
    const { container, onqueue, onupload } = renderSlot();

    pickFile(container);

    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:local");
    expect(storage.upload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onqueue).toHaveBeenLastCalledWith(expect.any(Function)),
    );

    const run = onqueue.mock.calls.at(-1)![0] as () => Promise<void>;
    await act(async () => {
      await run();
    });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0]![1]).toEqual({ stepCode: "MUGSHOT" });
    expect(onupload).toHaveBeenCalledWith("r2:b:k1", "");
    expect(onqueue).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the file queued when the upload fails so submit can retry", async () => {
    storage.upload.mockRejectedValue(new Error("Upload failed (403)"));
    const { container, onqueue, onupload } = renderSlot();

    pickFile(container);
    await waitFor(() =>
      expect(onqueue).toHaveBeenLastCalledWith(expect.any(Function)),
    );

    const run = onqueue.mock.calls.at(-1)![0] as () => Promise<void>;
    await act(async () => {
      await expect(run()).rejects.toThrow("403");
    });

    expect(onupload).not.toHaveBeenCalled();
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:local");
  });

  it("clears the queue when the student drops the pending preview", async () => {
    const { container, onqueue } = renderSlot();

    pickFile(container);
    await waitFor(() =>
      expect(onqueue).toHaveBeenLastCalledWith(expect.any(Function)),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove upload" }));

    await waitFor(() => expect(onqueue).toHaveBeenLastCalledWith(null));
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
