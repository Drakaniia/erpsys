import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SocialMediaLinksPanel from "./SocialMediaLinksPanel";
import ProfilingFormPanel from "./ProfilingFormPanel";
import SubmissionActiveEditors from "./SubmissionActiveEditors";
import type { SocialMediaLinkData } from "$lib/officer/types";

const { touch, leave, readers } = vi.hoisted(() => ({
  touch: vi.fn(),
  leave: vi.fn(),
  readers: vi.fn(),
}));
vi.mock("$lib/api", () => ({
  api: {
    presence: { touch: { call: touch }, leave: { call: leave } },
    officer: { getActiveEditors: { call: readers } },
  },
  timestampOf: () => undefined,
  recordTimestamp: () => undefined,
}));
vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => ({ flags: { googleForms: true } }),
}));
const owner = [{ userId: "officer-1", name: "Officer" }];
const links = [
  { id: "link-1", name: "Page", url: "https://example.com" },
] as SocialMediaLinkData[];
async function flush() {
  await act(async () => {});
}
async function heartbeat() {
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  touch.mockReset().mockResolvedValue([]);
  leave.mockReset().mockResolvedValue(null);
  readers.mockReset().mockResolvedValue(owner);
});
afterEach(async () => {
  cleanup();
  await flush();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("blocks social drafts while pending or waiting and preserves dirty input through lock loss", async () => {
  const save = vi.fn();
  render(
    <SocialMediaLinksPanel
      data={links}
      busy={false}
      onsave={save}
      onremove={vi.fn()}
      onreorder={vi.fn()}
    />,
  );
  expect(touch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(touch).toHaveBeenCalledWith(
    expect.objectContaining({ resource: "social-link", id: "link-1" }),
  );
  expect(screen.getByLabelText("Page name")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await flush();
  fireEvent.change(screen.getByLabelText("Page name"), {
    target: { value: "Dirty draft" },
  });
  touch.mockResolvedValue(owner);
  await heartbeat();
  expect(screen.getByLabelText("Page name")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  touch.mockResolvedValue([]);
  await heartbeat();
  expect(screen.getByLabelText("Page name")).toHaveValue("Dirty draft");
  expect(screen.getByLabelText("Page name")).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Add page" }));
  expect(touch.mock.lastCall?.[0]).not.toHaveProperty("id");
  expect(screen.getByLabelText("Page name")).toBeDisabled();
});

it("requires a record lease before removing a social link", async () => {
  touch.mockResolvedValue(owner);
  const remove = vi.fn();
  render(
    <SocialMediaLinksPanel
      data={links}
      busy={false}
      onsave={vi.fn()}
      onremove={remove}
      onreorder={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await flush();
  const confirm = screen
    .getAllByRole("button", { name: "Remove" })
    .find((button) => button.closest('[role="dialog"]'))!;
  expect(confirm).toBeDisabled();
  fireEvent.click(confirm);
  expect(remove).not.toHaveBeenCalled();
  touch.mockResolvedValue([]);
  await heartbeat();
  fireEvent.click(confirm);
  expect(remove).toHaveBeenCalledWith("link-1");
});

it("blocks profiling creation including direct form submission until access is ready", async () => {
  touch.mockResolvedValue(owner);
  const save = vi.fn();
  render(
    <ProfilingFormPanel
      data={null}
      hasActiveYear
      busy={false}
      onsave={save}
      onremove={vi.fn()}
    />,
  );
  expect(touch.mock.lastCall?.[0]).toMatchObject({
    resource: "profiling-form",
  });
  expect(touch.mock.lastCall?.[0]).not.toHaveProperty("id");
  expect(screen.getByLabelText("Form title")).toBeDisabled();
  await flush();
  fireEvent.submit(screen.getByLabelText("Form title").closest("form")!);
  expect(save).not.toHaveBeenCalled();
  touch.mockResolvedValue([]);
  await heartbeat();
  fireEvent.click(screen.getByRole("button", { name: "Create Google Form" }));
  expect(save).toHaveBeenCalledWith("Student Profiling Form");
});

it("acquires access before opening the external editor, including from fullscreen", async () => {
  touch.mockResolvedValue(owner);
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(
    <ProfilingFormPanel
      data={{
        title: "Form",
        editUrl: "https://example.com/edit",
        responderUri: "https://example.com/form",
      }}
      hasActiveYear
      busy={false}
      onsave={vi.fn()}
      onremove={vi.fn()}
    />,
  );
  expect(touch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Edit questions" })[1]);
  expect(open).not.toHaveBeenCalled();
  await flush();
  expect(
    screen
      .getAllByRole("button", { name: /Open editor|Edit questions/ })
      .every((button) => button.hasAttribute("disabled")),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Exit full screen" }),
  ).not.toBeDisabled();
  touch.mockResolvedValue([]);
  await heartbeat();
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
  expect(open).toHaveBeenCalledOnce();
});

it("blocks profiling unlink while waiting but keeps cancellation available", async () => {
  touch.mockResolvedValue(owner);
  const remove = vi.fn();
  render(
    <ProfilingFormPanel
      data={{ title: "Form", editUrl: "https://example.com/edit" }}
      hasActiveYear
      busy={false}
      onsave={vi.fn()}
      onremove={remove}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Unlink form" }));
  await flush();
  expect(screen.getByRole("button", { name: "Unlink" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  touch.mockResolvedValue([]);
  await heartbeat();
  fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
  expect(remove).toHaveBeenCalledOnce();
});

it("read-only submission status includes an owner using the same account and never claims a lease", async () => {
  render(<SubmissionActiveEditors id="submission-1" />);
  await flush();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Officer is editing. You can edit when they finish.",
  );
  expect(screen.getByRole("status")).not.toHaveTextContent("Also editing");
  expect(touch).not.toHaveBeenCalled();
});
