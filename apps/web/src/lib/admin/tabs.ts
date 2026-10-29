export type AdminTab =
  | "overview"
  | "users"
  | "students"
  | "passwords"
  | "departments"
  | "adviser-mapping"
  | "academic-years"
  | "requirements"
  | "profiling-form"
  | "chatbot"
  | "integrations"
  | "reports"
  | "audit-log";

export const ADMIN_TABS: ReadonlyArray<{
  id: AdminTab;
  label: string;
  key: string;
  requiresYear: boolean;
}> = [
  { id: "overview", label: "Overview", key: "0", requiresYear: false },
  { id: "users", label: "Users", key: "1", requiresYear: false },
  // Thirteen tabs, ten digits: Students, Passwords and Audit Log take no number
  // (they are absent from the shortcut legend for that reason) so no other tab
  // gets shadowed.
  { id: "students", label: "Students", key: "", requiresYear: false },
  { id: "passwords", label: "Passwords", key: "", requiresYear: false },
  { id: "departments", label: "Departments", key: "2", requiresYear: false },
  {
    id: "adviser-mapping",
    label: "Adviser Mapping",
    key: "3",
    requiresYear: false,
  },
  {
    id: "academic-years",
    label: "Academic Years",
    key: "4",
    requiresYear: false,
  },
  { id: "requirements", label: "Requirements", key: "5", requiresYear: false },
  {
    id: "profiling-form",
    label: "Profiling Form",
    key: "6",
    requiresYear: true,
  },
  { id: "chatbot", label: "Chatbot Knowledge", key: "7", requiresYear: false },
  {
    id: "integrations",
    label: "Integrations",
    key: "8",
    requiresYear: false,
  },
  { id: "reports", label: "Reports", key: "9", requiresYear: true },
  { id: "audit-log", label: "Audit Log", key: "", requiresYear: false },
] as const;

export const TAB_BY_ID = new Map(ADMIN_TABS.map((t) => [t.id, t]));

/** Digit → tab, from the one numbering source. Tabs with no digit are absent. */
export const TAB_BY_KEY = new Map(
  ADMIN_TABS.filter((t) => t.key).map((t) => [t.key, t.id]),
);

export function isAdminTab(
  value: string | null | undefined,
): value is AdminTab {
  return (
    value !== null && value !== undefined && TAB_BY_ID.has(value as AdminTab)
  );
}
