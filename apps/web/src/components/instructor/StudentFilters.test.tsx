import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_STUDENT_FILTERS } from "$lib/instructor/students";
import StudentFilters from "./StudentFilters";

describe("StudentFilters dropdowns", () => {
  it("patches academic year and requirement filters through accessible menus", async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    render(
      <StudentFilters
        filters={DEFAULT_STUDENT_FILTERS}
        scope="all"
        departments={[]}
        years={[
          {
            id: "year-1",
            label: "2026–2027",
            semesterLabel: "First",
            isActive: true,
          },
        ]}
        activeYearId="year-1"
        total={0}
        loading={false}
        onscope={vi.fn()}
        onpatch={patch}
        onclear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Academic year" }));
    await user.click(
      screen.getByRole("option", { name: "2026–2027 · Active" }),
    );
    expect(patch).toHaveBeenLastCalledWith({ academicYearId: "year-1" });
    await user.click(
      screen.getByRole("combobox", { name: "Requirement state" }),
    );
    await user.click(screen.getByRole("option", { name: "Verified" }));
    expect(patch).toHaveBeenLastCalledWith({ stepState: "VERIFIED" });
    await user.click(
      screen.getByRole("combobox", { name: "Requirement step" }),
    );
    const firstStep = screen.getAllByRole("option")[1];
    await user.click(firstStep);
    expect(patch.mock.lastCall?.[0].stepCode).toBeTruthy();
    expect(document.querySelector("select")).toBeNull();
  });
});
