import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AssignDepartmentModal from "./AssignDepartmentModal";
const activeEditors = vi.hoisted(() =>
  vi.fn(
    ({ children }: { children?: import("react").ReactNode }) =>
      children ?? null,
  ),
);
vi.mock("../ActiveEditors", () => ({
  default: activeEditors,
  useEditingLock: () => ({ blocked: false, onBlockedChange: () => {} }),
}));
const department = {
  id: "d1",
  name: "Department",
  code: "D",
  yearLevels: ["FIRST", "SECOND"] as ("FIRST" | "SECOND")[],
  myYearLevels: ["FIRST"] as "FIRST"[],
  owners: [
    { adviserId: "me", name: "Me", yearLevels: ["FIRST"] as "FIRST"[] },
    { adviserId: "other", name: "Other", yearLevels: ["SECOND"] as "SECOND"[] },
  ],
};
afterEach(cleanup);
it("disables unchanged level edits and blocks held levels", async () => {
  render(
    <AssignDepartmentModal
      open
      mode="edit"
      department={department}
      myAdviserId="me"
      onclose={vi.fn()}
      onsubmit={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("checkbox", { name: "1st Year" })
        .getAttribute("aria-checked"),
    ).toBe("true"),
  );
  expect(activeEditors.mock.lastCall?.[0]).toMatchObject({
    resource: "adviser",
    id: "me",
    scope: undefined,
    enabled: true,
  });
  expect(
    (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: "2nd Year" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("requests only another instructor's levels without changing my own assignment", async () => {
  const submit = vi.fn();
  render(
    <AssignDepartmentModal
      open
      mode="transfer"
      department={department}
      myAdviserId="me"
      onclose={vi.fn()}
      onsubmit={submit}
    />,
  );
  expect(
    (screen.getByRole("checkbox", { name: "1st Year" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "2nd Year" }));
  fireEvent.click(screen.getByRole("button", { name: "Request transfer" }));
  expect(submit).toHaveBeenCalledWith(["SECOND"]);
  expect(activeEditors.mock.lastCall?.[0]).toMatchObject({
    resource: "transfer",
    scope: "d1",
    id: undefined,
    enabled: true,
  });
});
