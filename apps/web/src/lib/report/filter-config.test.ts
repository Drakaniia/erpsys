import { describe, expect, it } from "vitest";

import { REPORT_FILTER_CONFIG } from "./filter-config";
import {
  ADMIN_REPORTS,
  INSTRUCTOR_REPORTS,
  OFFICER_REPORTS,
} from "$lib/report/types";

describe("the filter vocabulary covers every declared key", () => {
  it("has a control for every key any catalogue declares", () => {
    const declared = new Set(
      [...OFFICER_REPORTS, ...INSTRUCTOR_REPORTS, ...ADMIN_REPORTS].flatMap(
        (def) => def.filters,
      ),
    );
    expect(declared.size).toBeGreaterThan(0);
    for (const key of declared) {
      expect(REPORT_FILTER_CONFIG[key]).toBeDefined();
      expect(REPORT_FILTER_CONFIG[key].label).toBeTruthy();
    }
  });

  it("gives the two 'Course' controls the same visible name", () => {
    expect(REPORT_FILTER_CONFIG.departments.label).toBe("Course");
    expect(REPORT_FILTER_CONFIG.course.label).toBe("Course");
  });
});
