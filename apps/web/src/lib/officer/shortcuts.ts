import type { OfficerTab } from "$lib/officer/tabs";

export type OfficerShortcutContext = {
  isTyping: boolean;
  guideOpen: boolean;
  hasDetailSheet: boolean;
};

export type OfficerShortcutAction =
  | { type: "toggleShortcuts" }
  | { type: "selectTab"; tab: OfficerTab }
  | { type: "moveSelection"; delta: 1 | -1 }
  | { type: "openSelected" };

const TAB_BY_NUMBER: Record<string, OfficerTab> = {
  "1": "assessment",
  "2": "social-media",
  "3": "profiling",
  "4": "mugshot",
  "5": "consent",
  "6": "social-media-links",
  "7": "profiling-form",
};

export function getOfficerShortcutAction(
  key: string,
  ctx: OfficerShortcutContext,
): OfficerShortcutAction | null {
  if (ctx.isTyping) return null;
  if (ctx.guideOpen) return null;
  if (ctx.hasDetailSheet) return null;

  if (key === "?") return { type: "toggleShortcuts" };

  if (key === "0" || key.toLowerCase() === "h") {
    return { type: "selectTab", tab: "overview" };
  }

  const tab = TAB_BY_NUMBER[key];
  if (tab) return { type: "selectTab", tab };

  if (key === "j" || key === "ArrowDown")
    return { type: "moveSelection", delta: 1 };
  if (key === "k" || key === "ArrowUp")
    return { type: "moveSelection", delta: -1 };

  if (key === "Enter") return { type: "openSelected" };

  return null;
}
