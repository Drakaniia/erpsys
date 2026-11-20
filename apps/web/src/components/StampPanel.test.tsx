import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import StampPanel from "./StampPanel";
const { touch, leave, save, upload } = vi.hoisted(() => ({ touch: vi.fn(), leave: vi.fn(), save: vi.fn(), upload: vi.fn() }));
vi.mock("$lib/api", () => ({ api: {
  presence: { touch: { call: touch }, leave: { call: leave } },
  officer: { getStamp: { queryOptions: () => ({ queryKey: ["stamp"], queryFn: async () => ({ name: "Officer", signatureUrl: null }) }) }, updateStamp: { mutationOptions: () => ({ mutationFn: save }) } },
}, timestampOf: () => undefined, recordTimestamp: () => undefined }));
vi.mock("$lib/storage/use-storage-upload", () => ({ STORAGE_ACCEPT: "image/*", validateStorageFile: () => null, useStorageUpload: () => ({ upload }) }));
vi.mock("$lib/integrations/use-integrations", () => ({ useIntegrations: () => ({ flags: { r2: true } }) }));
vi.mock("$lib/notifications", () => ({ notify: { success: vi.fn() } }));
afterEach(async () => { cleanup(); await act(async () => {}); vi.useRealTimers(); vi.restoreAllMocks(); });
it("blocks stamp name, upload and save pending/waiting, preserves dirty changes and permits closing", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  touch.mockResolvedValue([]); leave.mockResolvedValue(null);
  const close = vi.fn();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={query}><StampPanel open isOfficerSurface onclose={close} /></QueryClientProvider>);
  expect(screen.getByLabelText("Name on stamp")).toBeDisabled();
  expect(view.container.querySelector('input[type="file"]')).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Name on stamp"), { target: { value: "Dirty stamp" } });
  touch.mockResolvedValue([{ userId: "officer-1", name: "Officer" }]);
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(screen.getByLabelText("Name on stamp")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
  touch.mockResolvedValue([]);
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(screen.getByLabelText("Name on stamp")).toHaveValue("Dirty stamp");
  expect(screen.getByLabelText("Name on stamp")).not.toBeDisabled();
});
