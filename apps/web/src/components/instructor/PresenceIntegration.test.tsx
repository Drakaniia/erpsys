import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, queryClient } from "$lib/api";
import ConfirmEnrollmentDialog from "./ConfirmEnrollmentDialog";
import RevertConfirmDialog from "./RevertConfirmDialog";
import TransferRequestDialog from "./TransferRequestDialog";
import ShareQueueModal from "./ShareQueueModal";
import DepartmentManager from "./DepartmentManager";
import YearLevelModal from "../YearLevelModal";
import type { DepartmentQueue, QueueEntry } from "$lib/instructor/types";

vi.mock("$lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "me", role: "ENROLLMENT_ADVISER" } },
    }),
  },
}));
vi.mock("$lib/clipboard", () => ({ copyText: vi.fn(async () => true) }));
vi.mock("$lib/notifications", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));
type Lease = { resource: string; id?: string; scope?: string; leaseId: string };
let touches: Lease[];
let responses: Map<string, (owners: unknown[]) => void>;
let writes: string[];
const key = (lease: Lease) =>
  `${lease.resource}:${lease.id ?? lease.scope ?? "create"}`;
const owner = [
  {
    userId: "me",
    name: "Same account in another tab",
    expiresAt: Date.now() + 30_000,
  },
];

beforeEach(() => {
  touches = [];
  responses = new Map();
  writes = [];
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/presence") && init?.method === "POST") {
        const lease = JSON.parse(String(init.body)) as Lease;
        touches.push(lease);
        const owners = await new Promise<unknown[]>((resolve) =>
          responses.set(key(lease), resolve),
        );
        return new Response(JSON.stringify({ data: owners }));
      }
      if (url.endsWith("/presence"))
        return new Response(JSON.stringify({ data: {} }));
      if (init?.method !== "GET") writes.push(url);
      if (url.endsWith("/transfers"))
        return new Response(
          JSON.stringify({ data: { incoming: [], outgoing: [] } }),
        );
      if (url.includes("/queue-shares"))
        return new Response(
          JSON.stringify({ data: { url: "https://example.test/queue" } }),
        );
      if (url.includes("/departments"))
        return new Response(JSON.stringify({ data: [] }));
      return new Response(JSON.stringify({ data: {} }));
    }),
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function resolveLease(target: string, owners: unknown[] = []) {
  await waitFor(() => expect(responses.has(target)).toBe(true));
  await act(async () => {
    responses.get(target)!(owners);
  });
}
function withClient(element: React.ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

it("blocks enrollment and move-to-end pending and behind even the same account, but permits cancel", async () => {
  const props = {
    entry: {
      entryId: "queue-1",
      name: "Student",
      verifiedSteps: 5,
    } as QueueEntry,
    departmentName: "Department",
    semesterLabel: "First",
    yearLabel: "2026",
    onconfirm: vi.fn(),
    onreturntoqueue: vi.fn(),
    onmovetoend: vi.fn(),
  };
  const view = render(<ConfirmEnrollmentDialog open {...props} />);
  const confirm = screen.getByRole("button", { name: "Confirm Enrollment" });
  const move = screen.getByRole("button", {
    name: "Not present — move to end",
  });
  expect(confirm).toBeDisabled();
  expect(move).toBeDisabled();
  await resolveLease("queue-entry:queue-1", owner);
  expect(confirm).toBeDisabled();
  expect(move).toBeDisabled();
  fireEvent.click(confirm);
  fireEvent.click(move);
  expect(props.onconfirm).not.toHaveBeenCalled();
  expect(props.onmovetoend).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onreturntoqueue).toHaveBeenCalledOnce();
  view.rerender(
    <ConfirmEnrollmentDialog
      open
      {...props}
      entry={{ ...props.entry, entryId: "queue-2" }}
    />,
  );
  expect(confirm).toBeDisabled();
  await resolveLease("queue-entry:queue-2");
  expect(confirm).not.toBeDisabled();
  expect(move).not.toBeDisabled();
  fireEvent.click(confirm);
  expect(props.onconfirm).toHaveBeenCalledOnce();
  view.rerender(<ConfirmEnrollmentDialog open={false} {...props} />);
});

it("requires every distinct enrollment lease before bulk reason fields or revert are usable", async () => {
  const onconfirm = vi.fn();
  const props = {
    open: true,
    count: 2,
    departmentName: "Department",
    onconfirm,
    onclose: vi.fn(),
  };
  const view = render(
    <RevertConfirmDialog
      {...props}
      enrollmentIds={["enrollment-1", "enrollment-2", "enrollment-1"]}
    />,
  );
  expect(touches.map(({ resource, id }) => [resource, id])).toEqual([
    ["enrollment", "enrollment-1"],
    ["enrollment", "enrollment-2"],
  ]);
  const reason = screen.getByRole("textbox", {
    name: "Reason for bulk revert",
  });
  const preset = screen.getByRole("button", { name: "Wrong student" });
  expect(reason).toBeDisabled();
  expect(preset).toBeDisabled();
  await resolveLease("enrollment:enrollment-1");
  expect(reason).toBeDisabled();
  await resolveLease("enrollment:enrollment-2", owner);
  expect(reason).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).not.toBeDisabled();
  view.rerender(
    <RevertConfirmDialog
      {...props}
      enrollmentIds={["enrollment-1", "enrollment-3"]}
    />,
  );
  expect(reason).toBeDisabled();
  await resolveLease("enrollment:enrollment-3");
  expect(
    screen.getByRole("textbox", { name: "Reason for bulk revert" }),
  ).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Wrong student" }));
  fireEvent.click(screen.getByRole("button", { name: "Revert 2" }));
  expect(onconfirm).toHaveBeenCalledWith("Wrong student");
  view.rerender(<RevertConfirmDialog {...props} enrollmentIds={[]} />);
  expect(
    screen.getByRole("textbox", { name: "Reason for bulk revert" }),
  ).toBeDisabled();
});

it("targets an existing transfer request and never starts a lease without its ID", async () => {
  const props = {
    requesterName: "Instructor",
    departmentCode: "D",
    departmentName: "Department",
    expiresAt: "",
    onaccept: vi.fn(),
    ondecline: vi.fn(),
  };
  const view = render(
    <TransferRequestDialog open requestId="request-1" {...props} />,
  );
  await resolveLease("transfer:request-1");
  view.rerender(<TransferRequestDialog open {...props} />);
  expect(touches).toHaveLength(1);
});

it("targets department year levels only while the shared modal is open", async () => {
  const props = {
    department: { id: "department-1", name: "Department", yearLevels: [] },
    onsaved: vi.fn(),
    onclose: vi.fn(),
  };
  const view = render(<YearLevelModal open {...props} />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await resolveLease("department:department-1");
  expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  view.rerender(<YearLevelModal open={false} {...props} />);
});

it("waits for share-link ownership before auto-mint, mints once, and reacquires on reopen or target change", async () => {
  const props = {
    department: { id: "d1", name: "One", code: "ONE" } as DepartmentQueue,
    onclose: vi.fn(),
  };
  const view = withClient(<ShareQueueModal open {...props} />);
  expect(writes).toEqual([]);
  expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await resolveLease("queue-share:d1", owner);
  expect(writes).toEqual([]);
  expect(screen.getByRole("button", { name: "Close" })).not.toBeDisabled();
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ShareQueueModal open={false} {...props} />
    </QueryClientProvider>,
  );
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ShareQueueModal open {...props} />
    </QueryClientProvider>,
  );
  await resolveLease("queue-share:d1");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(
    await screen.findByRole("textbox", { name: "Queue link" }),
  ).toHaveValue("https://example.test/queue");
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ShareQueueModal open {...props} />
    </QueryClientProvider>,
  );
  expect(writes).toHaveLength(1);
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ShareQueueModal
        open
        {...props}
        department={{ ...props.department, id: "d2" }}
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("textbox", { name: "Queue link" })).toBeNull();
  expect(writes).toHaveLength(1);
  await resolveLease("queue-share:d2");
  await waitFor(() => expect(writes).toHaveLength(2));
});

it("guards department creation, inline edits, and delete confirmation without blocking cancellation", async () => {
  queryClient.setQueryData(api.instructor.listDepartments.queryKey(), {
    data: [
      {
        id: "d1",
        name: "Department One",
        code: "ONE",
        assigned: true,
        isActive: true,
        yearLevels: [],
        myYearLevels: [],
        owners: [],
      },
    ],
  });
  withClient(<DepartmentManager ontoast={vi.fn()} />);
  expect(
    screen.getByRole("textbox", { name: "Department name" }),
  ).toBeDisabled();
  await resolveLease("department:create", owner);
  expect(
    screen.getByRole("textbox", { name: "Department name" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const name = screen.getByRole("textbox", { name: "Name" });
  expect(name).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await resolveLease("department:d1", owner);
  expect(name).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  const dialog = screen.getByRole("dialog", { name: "Delete department" });
  expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();
  expect(
    within(dialog).getByRole("button", { name: "Cancel" }),
  ).not.toBeDisabled();
  await resolveLease("department:d1");
  expect(
    within(dialog).getByRole("button", { name: "Delete" }),
  ).not.toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes).toEqual([]);
});
