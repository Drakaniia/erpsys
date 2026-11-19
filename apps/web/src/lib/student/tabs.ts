export type StudentTab = "progress" | "chat" | "profile";

export const STUDENT_TABS: ReadonlyArray<{ id: StudentTab; label: string }> = [
  { id: "progress", label: "Progress" },
  { id: "chat", label: "Chat" },
  { id: "profile", label: "Profile" },
] as const;

const STUDENT_DEFAULT_TAB: StudentTab = "progress";

const TAB_IDS = new Set<StudentTab>(STUDENT_TABS.map((t) => t.id));

function isStudentTab(value: string | null | undefined): value is StudentTab {
  return (
    value !== null && value !== undefined && TAB_IDS.has(value as StudentTab)
  );
}

/** The chat tab is the whole Cloudflare Workers AI surface, so it hides with it. */
export function visibleStudentTabs(
  chatEnabled: boolean,
): ReadonlyArray<{ id: StudentTab; label: string }> {
  return chatEnabled
    ? STUDENT_TABS
    : STUDENT_TABS.filter((tab) => tab.id !== "chat");
}

export function parseStudentTab(
  value: string | null | undefined,
  chatEnabled = true,
): StudentTab {
  if (value === "chat" && !chatEnabled) return STUDENT_DEFAULT_TAB;
  return isStudentTab(value) ? value : STUDENT_DEFAULT_TAB;
}
