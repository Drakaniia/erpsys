export type ShareResolveResult = {
  status: "OK" | "STALE" | "INVALID";
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  inviterName: string | null;
  isOpen: boolean;
  openByName: string | null;
  waitingCount: number;
  academicYearId: string | null;
};

export type ShareResolveInput = {
  /** A `?s=` token is present in the URL. */
  hasToken: boolean;
  resolved: ShareResolveResult | null;
  /** A resolve request is in flight. */
  resolving: boolean;
  resolveFailed: boolean;
  hasActiveYear: boolean;
  /** Student already enrolled this year. */
  enrolled: boolean;
  readyForQueue: boolean;
  /** The student's live queue entry, or null. */
  queue: {
    departmentName: string;
    departmentId?: string | null;
    position: number | null;
  } | null;
  gateShowing: boolean;
};

export type ShareLanding =
  /** Show the landing modal. */
  | {
      kind: "show";
      variant: "default" | "closed" | "switch";
      data: ShareResolveResult & {
        departmentId: string;
        departmentName: string;
      };
      current: { departmentName: string; position: number | null } | null;
    }
  | {
      kind: "skip";
      reason:
        | "no-token"
        | "resolving"
        | "no-year"
        | "enrolled"
        | "already-in-queue"
        | "prereqs"
        | "gate";
    }
  | { kind: "error"; reason: "stale" | "invalid" | "resolve-failed" };

export const SHARE_ERROR_MESSAGES = {
  stale: "This queue link is from a previous enrollment period.",
  invalid: "This queue link is not valid.",
  "resolve-failed": "Couldn't check this queue link.",
} as const;

export function resolveShareLanding(input: ShareResolveInput): ShareLanding {
  if (!input.hasToken) return { kind: "skip", reason: "no-token" };
  if (input.resolving) return { kind: "skip", reason: "resolving" };

  if (input.resolveFailed) {
    return { kind: "error", reason: "resolve-failed" };
  }

  const resolved = input.resolved;
  if (!resolved) return { kind: "skip", reason: "resolving" };

  if (resolved.status === "STALE") {
    return { kind: "error", reason: "stale" };
  }
  if (resolved.status === "INVALID") {
    return { kind: "error", reason: "invalid" };
  }

  if (!resolved.departmentId || !resolved.departmentName) {
    return { kind: "error", reason: "invalid" };
  }

  const data = resolved as ShareResolveResult & {
    departmentId: string;
    departmentName: string;
  };

  if (!input.hasActiveYear) return { kind: "skip", reason: "no-year" };
  if (input.enrolled) return { kind: "skip", reason: "enrolled" };
  if (!input.readyForQueue) return { kind: "skip", reason: "prereqs" };

  if (input.gateShowing) return { kind: "skip", reason: "gate" };

  const queue = input.queue;
  if (queue) {
    const sameDepartment =
      queue.departmentId != null && queue.departmentId === data.departmentId;
    if (sameDepartment) {
      return { kind: "skip", reason: "already-in-queue" };
    }
    return {
      kind: "show",
      variant: "switch",
      data,
      current: {
        departmentName: queue.departmentName,
        position: queue.position,
      },
    };
  }

  return {
    kind: "show",
    variant: data.isOpen ? "default" : "closed",
    data,
    current: null,
  };
}

export function estimatedPosition(waitingCount: number): number {
  return Math.max(1, waitingCount + 1);
}

export function stripShareTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const at = raw.indexOf("?");
  if (at === -1) return null;
  const path = raw.slice(0, at) || "/";
  const params = new URLSearchParams(raw.slice(at + 1));
  if (!params.has("s")) return null;
  params.delete("s");
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}
