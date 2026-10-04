export const STUDENT_NUMBER_PATTERN = /^\d+$/;

const INSTITUTIONAL_STUDENT_DOMAIN = "@student.buksu.edu.ph";

export function deriveStudentNumberFromEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(INSTITUTIONAL_STUDENT_DOMAIN)) return null;
  const local = normalized.slice(0, -INSTITUTIONAL_STUDENT_DOMAIN.length);
  return STUDENT_NUMBER_PATTERN.test(local) ? local : null;
}

export const STEP_CODES = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
  "ENROLLMENT",
] as const;
export type StepCode = (typeof STEP_CODES)[number];

export const PRE_ENROLLMENT_STEP_CODES = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
] as const;
export type PreEnrollmentStepCode = (typeof PRE_ENROLLMENT_STEP_CODES)[number];

export const UPLOAD_STEP_CODES = [
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
] as const;

export const STEP_NAMES: Record<StepCode, string> = {
  ASSESSMENT: "Assessment",
  SOCIAL_MEDIA: "Social Media",
  PROFILING: "Profiling",
  MUGSHOT: "Mugshot",
  CONSENT: "Consent / Medical",
  ENROLLMENT: "Enrollment",
};

export function stepLabel(code: string): string {
  return (STEP_NAMES as Record<string, string>)[code] ?? code;
}

export const NOTIFICATION_STEPS_REMINDER = "STEPS_REMINDER";

export const NOTIFICATION_PAGE_SIZE = 50;

export const YEAR_LEVELS = [
  "FIRST",
  "SECOND",
  "THIRD",
  "FOURTH",
  "FIFTH",
] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const YEAR_LEVEL_LABELS: Record<YearLevel, string> = {
  FIRST: "1st Year",
  SECOND: "2nd Year",
  THIRD: "3rd Year",
  FOURTH: "4th Year",
  FIFTH: "5th Year",
};

export function normalizeYearLevels(levels: readonly YearLevel[]): YearLevel[] {
  const seen = new Set(levels);
  return YEAR_LEVELS.filter((level) => seen.has(level));
}

const CONNECTORS = new Set(["of", "and", "in", "the", "for", "&", "-"]);

const LEVEL_NUMBER: Record<YearLevel, number> = {
  FIRST: 1,
  SECOND: 2,
  THIRD: 3,
  FOURTH: 4,
  FIFTH: 5,
};

const LEVEL_SHORT: Record<YearLevel, string> = {
  FIRST: "1st",
  SECOND: "2nd",
  THIRD: "3rd",
  FOURTH: "4th",
  FIFTH: "5th",
};

export function yearLevelsOverlap(
  a: readonly YearLevel[],
  b: readonly YearLevel[],
): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((level) => (b as readonly string[]).includes(level));
}

export function subtractYearLevels(
  base: readonly YearLevel[],
  remove: readonly YearLevel[],
): YearLevel[] {
  const drop = new Set(remove);
  return normalizeYearLevels(base.filter((level) => !drop.has(level)));
}

export function departmentLevelRangeLabel(
  levels: readonly YearLevel[],
): string {
  const set = normalizeYearLevels(levels);
  if (set.length === 0) return "All year levels";
  const first = set[0]!;
  if (set.length === 1) return YEAR_LEVEL_LABELS[first];
  const numbers = set.map((level) => LEVEL_NUMBER[level]);
  const contiguous = numbers.every(
    (number, index) => index === 0 || number === numbers[index - 1]! + 1,
  );
  if (contiguous) {
    const last = set[set.length - 1]!;
    return `${LEVEL_SHORT[first]}–${LEVEL_SHORT[last]} Year`;
  }
  return set.map((level) => YEAR_LEVEL_LABELS[level]).join(", ");
}

export function deriveDepartmentCode(name: string): string {
  let code = "";
  for (const token of name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)) {
    if (CONNECTORS.has(token.toLowerCase())) continue;
    const cleaned = token.replace(/[^A-Za-z0-9]/g, "");
    if (!cleaned) continue;
    if (cleaned.length >= 2 && /^[A-Z0-9]+$/.test(cleaned)) {
      code += cleaned;
      continue;
    }
    const initial = cleaned.match(/[A-Za-z0-9]/);
    if (initial) code += initial[0];
  }
  code = code.toUpperCase();
  if (code) return code;
  return (
    name
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || "DEPT"
  );
}

export function departmentAcceptsLevel(
  levels: readonly YearLevel[],
  level: YearLevel,
): boolean {
  return levels.length === 0 || levels.includes(level);
}
