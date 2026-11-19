export type ShortcutContext = {
  isTyping: boolean;
  guideOpen: boolean;
  hasDialog: boolean;
  activeView: "queue" | "enrolled";
  canServeFirst: boolean;
  hasSpotlight: boolean;
  departments: { id: string }[];
};

export type ShortcutAction =
  | { type: "toggleShortcuts" }
  | { type: "serveSpotlight" }
  | { type: "moveSelection"; delta: 1 | -1 }
  | { type: "openSelected" }
  | { type: "openStudentsTab" }
  | { type: "switchDepartment"; departmentId: string };

export function getInstructorShortcutAction(
  key: string,
  ctx: ShortcutContext,
): ShortcutAction | null {
  if (ctx.isTyping) return null;
  if (ctx.guideOpen) return null;
  if (ctx.hasDialog) return null;

  if (key === "?") return { type: "toggleShortcuts" };

  if (ctx.activeView === "queue") {
    if (key === "s" || key === "S") {
      if (ctx.hasSpotlight && ctx.canServeFirst)
        return { type: "serveSpotlight" };
      return null;
    }
    if (key === "j" || key === "ArrowDown")
      return { type: "moveSelection", delta: 1 };
    if (key === "k" || key === "ArrowUp")
      return { type: "moveSelection", delta: -1 };
    if (key === "Enter") return { type: "openSelected" };
  }

  const num = Number.parseInt(key, 10);
  if (Number.isInteger(num)) {
    if (num === 0 && !/^-/.test(key)) return { type: "openStudentsTab" };
    if (num >= 1 && num <= ctx.departments.length) {
      return {
        type: "switchDepartment",
        departmentId: ctx.departments[num - 1].id,
      };
    }
  }

  return null;
}
