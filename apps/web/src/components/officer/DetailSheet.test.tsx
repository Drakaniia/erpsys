import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DetailSheet from "./DetailSheet";

const mocks = vi.hoisted(() => ({
  touch: vi.fn(), leave: vi.fn(), readers: vi.fn(),
  state: {
    resetLocal: vi.fn(), data: { student: { name: "Student" }, step: { code: "SOCIAL_MEDIA", name: "Social" }, evidence: [{ id: "e", kind: "EXTERNAL_LINK", fileUrl: "https://example.com" }], answers: [] }, student: null, step: null,
    status: "PENDING", effectiveReply: null, effectiveStamp: null, effectiveRevocation: null,
    stampOpen: false, replyOpen: false, revokeOpen: false, cameraOpen: false, busyAny: false,
    lightboxIndex: -1, canStamp: true, detailQuery: { isPending: false, isError: false },
    replyMutation: { isPending: false }, captureMutation: { isPending: false },
    revokeMutation: { isPending: false }, verifyMutation: { isPending: false }, stampQuery: { data: null },
    handleReply: vi.fn(), handleVerify: vi.fn(), handleRevoke: vi.fn(), handleCaptureSave: vi.fn(),
    setStampOpen: vi.fn(), setReplyOpen: vi.fn(), setRevokeOpen: vi.fn(), setCameraOpen: vi.fn(),
  },
}));
vi.mock("$lib/api", () => ({ api: { presence: { touch: { call: mocks.touch }, leave: { call: mocks.leave } }, officer: { getActiveEditors: { call: mocks.readers } } } }));
vi.mock("$lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "officer-1", name: "Officer" } } }) } }));
vi.mock("$lib/officer/detail-sheet", () => ({ useDetailSheetState: () => mocks.state }));
async function flush() { await act(async () => {}); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mocks.touch.mockReset().mockResolvedValue([]);
  mocks.leave.mockReset().mockResolvedValue(null);
  mocks.readers.mockReset().mockResolvedValue([]);
});
afterEach(async () => {
  cleanup(); await flush(); vi.useRealTimers(); vi.restoreAllMocks();
  Object.assign(mocks.state, { stampOpen: false, replyOpen: false, revokeOpen: false, cameraOpen: false, busyAny: false });
  vi.clearAllMocks();
});
const props = () => ({ verificationId: "submission-1", onclose: vi.fn(), onmarkread: vi.fn() });

it("retains a view-only editor list without claiming a writer lease", async () => {
  render(<DetailSheet {...props()} />);
  await flush();
  expect(mocks.readers).toHaveBeenCalledWith({ id: "submission-1" });
  expect(mocks.touch).not.toHaveBeenCalled();
});

it.each(["stampOpen", "replyOpen", "revokeOpen", "cameraOpen", "busyAny"] as const)("uses a shared submission lease while %s and restores the reader on exit", async (field) => {
  mocks.state[field] = true;
  const p = props();
  const view = render(<DetailSheet {...p} />);
  expect(mocks.touch).toHaveBeenCalledWith(expect.objectContaining({ resource: "submission", id: "submission-1" }));
  await flush();
  mocks.state[field] = false;
  view.rerender(<DetailSheet {...p} />);
  await flush();
  expect(mocks.readers).toHaveBeenCalledWith({ id: "submission-1" });
});

it("blocks pending/waiting descendants and shortcuts, preserves reply drafts, and permits evidence/close", async () => {
  mocks.state.replyOpen = true;
  const p = props();
  const view = render(<DetailSheet {...p} />);
  expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
  await flush();
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Dirty reply" } });
  mocks.touch.mockResolvedValue([{ userId: "officer-1", name: "Officer" }]);
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Stamp as verified" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://example.com");
  expect(screen.getByRole("button", { name: "Close" })).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(p.onclose).toHaveBeenCalledOnce();
  mocks.state.replyOpen = false;
  mocks.state.cameraOpen = true;
  view.rerender(<DetailSheet {...p} />);
  fireEvent.keyDown(window, { key: "s" });
  expect(mocks.state.setStampOpen).not.toHaveBeenCalled();
  mocks.state.replyOpen = true;
  mocks.state.cameraOpen = false;
  view.rerender(<DetailSheet {...p} />);
  mocks.touch.mockResolvedValue([]);
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(screen.getByLabelText("Note (optional)")).not.toBeDisabled();
});

it.each([["stampOpen", "Stamp"], ["revokeOpen", "Revoke"]] as const)("blocks the %s confirmation while pending", (field, label) => {
  mocks.state[field] = true;
  render(<DetailSheet {...props()} />);
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(mocks.state.handleVerify).not.toHaveBeenCalled();
  expect(mocks.state.handleRevoke).not.toHaveBeenCalled();
});
