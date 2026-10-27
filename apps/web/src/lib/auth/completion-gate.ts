export const COMPLETION_PATH = "/complete-profile" as const;

export const COMPLETION_ALLOWED_PATHS: ReadonlySet<string> = new Set([
  COMPLETION_PATH,
  "/",
  "/docs",
  "/loading",
  "/auth/error",
  "/settings/accounts",
]);

export const COMPLETION_DEST_KEY = "erpsys:completion-dest";

export type GateResult = "allow" | "redirect-to-completion";

export function completionGate(input: {
  path: string;
  role: string | undefined;
  hasProfile: boolean | undefined;
}): GateResult {
  if (input.role !== "STUDENT") return "allow";
  if (input.hasProfile !== false) return "allow";
  if (COMPLETION_ALLOWED_PATHS.has(input.path)) return "allow";
  return "redirect-to-completion";
}

export function isInternalPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.startsWith("/\\")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(path.slice(1));
}
