import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EvidenceSheet from "./EvidenceSheet";

const apiState = vi.hoisted(() => ({
  submit: vi.fn(async (input: { stepCode: string }) => input),
  invalidate: vi.fn(),
}));

const slotState = vi.hoisted(() => ({
  onqueue: null as null | ((run: (() => Promise<void>) | null) => void),
}));

vi.mock("$lib/api", () => ({
  queryClient: { invalidateQueries: apiState.invalidate },
  api: {
    student: {
      uploadEvidence: {
        mutationOptions: () => ({ mutationFn: async () => ({}) }),
      },
      deleteEvidence: {
        mutationOptions: () => ({ mutationFn: async () => ({}) }),
      },
      submitEvidence: {
        mutationOptions: () => ({ mutationFn: apiState.submit }),
      },
      upsertExternalLink: {
        mutationOptions: () => ({ mutationFn: async () => ({}) }),
      },
      removeExternalLink: {
        mutationOptions: () => ({ mutationFn: async () => ({}) }),
      },
    },
  },
}));

// Seam: the sheet only learns of a picked file through `onqueue`.
vi.mock("./EvidenceSlot", () => ({
  default: (props: {
    onqueue?: (run: (() => Promise<void>) | null) => void;
  }) => {
    slotState.onqueue = props.onqueue ?? null;
    return <div data-testid="evidence-slot" />;
  },
}));

const step = {
  code: "MUGSHOT",
  status: "PENDING",
  evidence: [],
  reply: null,
  stamp: null,
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSheet(notify = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EvidenceSheet
        step={step as never}
        slotLabel="Upload photo"
        notify={notify}
      />
    </QueryClientProvider>,
  );
  return notify;
}

beforeEach(() => {
  apiState.submit.mockClear();
  slotState.onqueue = null;
});

describe("EvidenceSheet submit-time uploads", () => {
  it("offers submit as soon as a file is queued, then uploads before submitting", async () => {
    renderSheet();
    const upload = deferred();
    const run = vi.fn(() => upload.promise);

    // Nothing on the step yet, so the button only appears once a file is queued.
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    act(() => slotState.onqueue!(run));

    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(apiState.submit).not.toHaveBeenCalled();

    await act(async () => upload.resolve());
    await waitFor(() => expect(apiState.submit).toHaveBeenCalled());
    expect(apiState.submit.mock.calls[0]![0]).toEqual({ stepCode: "MUGSHOT" });
  });

  it("refuses to submit when the queued upload failed", async () => {
    const notify = renderSheet();
    const upload = deferred();
    const run = vi.fn(() => upload.promise);

    act(() => slotState.onqueue!(run));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await act(async () => upload.reject(new Error("Upload failed (403)")));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Upload failed (403)", "error"),
    );
    expect(apiState.submit).not.toHaveBeenCalled();
  });
});
