import { describe, expect, it } from "vitest";
import {
  estimatedPosition,
  resolveShareLanding,
  SHARE_ERROR_MESSAGES,
  stripShareTokenFromHash,
  type ShareResolveInput,
  type ShareResolveResult,
} from "./queue-share";

const ok: ShareResolveResult = {
  status: "OK",
  departmentId: "dept-bsit",
  departmentName: "BS Information Technology",
  departmentCode: "BSIT",
  inviterName: "Juan Dela Cruz",
  isOpen: true,
  openByName: "Juan Dela Cruz",
  waitingCount: 3,
  academicYearId: "ay-2026",
};

const eligible = (over: Partial<ShareResolveInput> = {}) => ({
  resolved: ok,
  resolving: false,
  resolveFailed: false,
  hasActiveYear: true,
  enrolled: false,
  readyForQueue: true,
  queue: null,
  gateShowing: false,
  hasToken: true,
  ...over,
});

describe("resolveShareLanding", () => {
  describe("no token / loading", () => {
    it("skips when there is no token at all", () => {
      expect(resolveShareLanding(eligible({ hasToken: false }))).toEqual({
        kind: "skip",
        reason: "no-token",
      });
    });

    it("skips while the resolve request is in flight", () => {
      expect(
        resolveShareLanding(eligible({ resolving: true, resolved: null })),
      ).toEqual({ kind: "skip", reason: "resolving" });
    });

    it("skips when resolved is still null and not marked in flight", () => {
      expect(resolveShareLanding(eligible({ resolved: null }))).toEqual({
        kind: "skip",
        reason: "resolving",
      });
    });

    it("prefers `resolving` over a stale previous result", () => {
      expect(resolveShareLanding(eligible({ resolving: true }))).toEqual({
        kind: "skip",
        reason: "resolving",
      });
    });
  });

  describe("bad tokens", () => {
    it("reports a stale (previous academic year) token", () => {
      const landing = resolveShareLanding(
        eligible({ resolved: { ...ok, status: "STALE" } }),
      );
      expect(landing).toEqual({ kind: "error", reason: "stale" });
    });

    it("reports an invalid (bad signature / deleted department) token", () => {
      const landing = resolveShareLanding(
        eligible({ resolved: { ...ok, status: "INVALID" } }),
      );
      expect(landing).toEqual({ kind: "error", reason: "invalid" });
    });

    it("reports a failed resolve without blocking the page", () => {
      const landing = resolveShareLanding(
        eligible({ resolveFailed: true, resolved: null }),
      );
      expect(landing).toEqual({ kind: "error", reason: "resolve-failed" });
    });

    it("reports invalid when OK carries no department id (contract drift)", () => {
      const landing = resolveShareLanding(
        eligible({ resolved: { ...ok, departmentId: null } }),
      );
      expect(landing).toEqual({ kind: "error", reason: "invalid" });
    });

    it("has user-facing copy for every error reason", () => {
      for (const reason of ["stale", "invalid", "resolve-failed"] as const) {
        expect(SHARE_ERROR_MESSAGES[reason]).toBeTruthy();
      }
      expect(SHARE_ERROR_MESSAGES.stale).not.toBe(SHARE_ERROR_MESSAGES.invalid);
    });
  });

  describe("page state that suppresses the modal", () => {
    it("skips when there is no active academic year", () => {
      expect(resolveShareLanding(eligible({ hasActiveYear: false }))).toEqual({
        kind: "skip",
        reason: "no-year",
      });
    });

    it("skips when the student is already enrolled", () => {
      expect(resolveShareLanding(eligible({ enrolled: true }))).toEqual({
        kind: "skip",
        reason: "enrolled",
      });
    });

    it("skips when prerequisites are unmet", () => {
      expect(resolveShareLanding(eligible({ readyForQueue: false }))).toEqual({
        kind: "skip",
        reason: "prereqs",
      });
    });

    it("defers while the onboarding gate is covering the page", () => {
      expect(resolveShareLanding(eligible({ gateShowing: true }))).toEqual({
        kind: "skip",
        reason: "gate",
      });
    });

    it("shows the modal once the gate clears", () => {
      // The deferral must not latch.
      expect(
        resolveShareLanding(eligible({ gateShowing: false })),
      ).toMatchObject({ kind: "show", variant: "default" });
    });

    it("does not let the gate shadow a hard state like enrolled", () => {
      expect(
        resolveShareLanding(eligible({ gateShowing: true, enrolled: true })),
      ).toEqual({ kind: "skip", reason: "enrolled" });
    });

    it("prefers enrolled over prerequisites-unmet", () => {
      expect(
        resolveShareLanding(eligible({ enrolled: true, readyForQueue: false })),
      ).toEqual({ kind: "skip", reason: "enrolled" });
    });
  });

  describe("already holding a place", () => {
    it("skips when already waiting in the LINKED department", () => {
      expect(
        resolveShareLanding(
          eligible({
            queue: {
              departmentId: "dept-bsit",
              departmentName: "BS Information Technology",
              position: 4,
            },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "already-in-queue" });
    });

    it("offers a switch when waiting in a DIFFERENT department", () => {
      const landing = resolveShareLanding(
        eligible({
          queue: {
            departmentId: "dept-bscs",
            departmentName: "BS Computer Science",
            position: 2,
          },
        }),
      );
      expect(landing).toMatchObject({
        kind: "show",
        variant: "switch",
        current: { departmentName: "BS Computer Science", position: 2 },
      });
    });

    it("treats a queue entry with an unknown department id as a switch", () => {
      const landing = resolveShareLanding(
        eligible({
          queue: {
            departmentId: null,
            departmentName: "BS Computer Science",
            position: 1,
          },
        }),
      );
      expect(landing).toMatchObject({ kind: "show", variant: "switch" });
    });

    it("handles a queue entry with no position", () => {
      const landing = resolveShareLanding(
        eligible({
          queue: {
            departmentId: "dept-bscs",
            departmentName: "BS Computer Science",
            position: null,
          },
        }),
      );
      expect(landing).toMatchObject({
        kind: "show",
        variant: "switch",
        current: { position: null },
      });
    });
  });

  describe("showing the modal", () => {
    it("shows the default variant when the department is open", () => {
      const landing = resolveShareLanding(eligible());
      expect(landing).toMatchObject({ kind: "show", variant: "default" });
      if (landing.kind !== "show") return;
      expect(landing.data.departmentName).toBe("BS Information Technology");
      expect(landing.data.inviterName).toBe("Juan Dela Cruz");
      expect(landing.data.waitingCount).toBe(3);
      expect(landing.current).toBeNull();
    });

    it("shows the closed variant when the department is not accepting", () => {
      const landing = resolveShareLanding(
        eligible({
          resolved: { ...ok, isOpen: false, openByName: null },
        }),
      );
      expect(landing).toMatchObject({ kind: "show", variant: "closed" });
    });

    it("still offers the switch variant when the target is closed", () => {
      const landing = resolveShareLanding(
        eligible({
          resolved: { ...ok, isOpen: false, openByName: null },
          queue: {
            departmentId: "dept-bscs",
            departmentName: "BS Computer Science",
            position: 2,
          },
        }),
      );
      expect(landing).toMatchObject({ kind: "show", variant: "switch" });
    });
  });
});

describe("estimatedPosition", () => {
  it("is one past the waiting count", () => {
    expect(estimatedPosition(3)).toBe(4);
  });

  it("is at least 1 for an empty queue", () => {
    expect(estimatedPosition(0)).toBe(1);
  });

  it("never returns 0 or negative", () => {
    expect(estimatedPosition(-5)).toBe(1);
  });
});

describe("stripShareTokenFromHash", () => {
  it("strips ?s= from a hash route and returns the clean hash", () => {
    expect(stripShareTokenFromHash("#/queue?s=abc.def")).toBe("#/queue");
  });

  it("accepts a hash without the leading #", () => {
    expect(stripShareTokenFromHash("/queue?s=abc.def")).toBe("#/queue");
  });

  it("is a no-op when there is no token", () => {
    expect(stripShareTokenFromHash("#/queue")).toBeNull();
    expect(stripShareTokenFromHash("#/queue?dept=dept-1")).toBeNull();
  });

  it("is a no-op for an empty hash", () => {
    expect(stripShareTokenFromHash("")).toBeNull();
    expect(stripShareTokenFromHash("#")).toBeNull();
  });

  it("preserves unrelated query params", () => {
    expect(stripShareTokenFromHash("#/queue?dept=dept-1&s=abc")).toBe(
      "#/queue?dept=dept-1",
    );
    expect(stripShareTokenFromHash("#/queue?s=abc&dept=dept-1")).toBe(
      "#/queue?dept=dept-1",
    );
  });

  it("preserves the route path", () => {
    expect(stripShareTokenFromHash("#/app/queue?s=abc")).toBe("#/app/queue");
  });

  it("keeps a bare ? out of the result", () => {
    expect(stripShareTokenFromHash("#/queue?dept=&s=abc")).toBe(
      "#/queue?dept=",
    );
    expect(stripShareTokenFromHash("#/queue?s=abc")).not.toContain("?");
  });

  it("handles an empty token value", () => {
    expect(stripShareTokenFromHash("#/queue?s=")).toBe("#/queue");
  });
});
