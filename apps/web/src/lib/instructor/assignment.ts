import {
  YEAR_LEVELS,
  normalizeYearLevels,
  type YearLevel,
} from "$lib/domain/constants";

export type DepartmentOwner = {
  adviserId: string;
  name: string;
  yearLevels: YearLevel[];
};

export function resolveAssignScope(
  selected: readonly YearLevel[],
  departmentLevels: readonly YearLevel[],
): YearLevel[] {
  const chosen = normalizeYearLevels(selected);
  if (chosen.length > 0) return chosen;
  return normalizeYearLevels(departmentLevels).length > 0
    ? normalizeYearLevels(departmentLevels)
    : [...YEAR_LEVELS];
}

export function takenYearLevels(
  owners: readonly DepartmentOwner[],
  excludeAdviserId?: string | null,
): YearLevel[] {
  const others = owners.filter((o) => o.adviserId !== excludeAdviserId);
  if (others.length === 0) return [];
  if (others.some((o) => normalizeYearLevels(o.yearLevels).length === 0))
    return [...YEAR_LEVELS];
  return normalizeYearLevels(others.flatMap((o) => o.yearLevels));
}
