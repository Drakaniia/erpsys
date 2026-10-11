import type { RosterFilter } from "./RosterService.js";
import { optBool, strArray } from "./StudentListService.js";

export type RosterFilterInput = {
  academicYearId?: string;
  scope: "mine" | "all";
  q?: string;
  stepState?: string;
  enrolled?: string;
  unassigned?: string;
};

export function rosterFilter(
  input: RosterFilterInput,
  query: Record<string, unknown>,
): RosterFilter {
  return {
    academicYearId: input.academicYearId,
    departmentIds: strArray(query.departmentIds),
    yearLevels: strArray(query.yearLevels) as RosterFilter["yearLevels"],
    buckets: strArray(query.buckets) as RosterFilter["buckets"],
    steps: strArray(query.steps),
    stepState: (input.stepState || undefined) as RosterFilter["stepState"],
    enrolled: optBool(input.enrolled),
    unassigned: input.unassigned === "true" ? true : undefined,
    q: input.q,
    scope: input.scope,
  } as RosterFilter;
}
