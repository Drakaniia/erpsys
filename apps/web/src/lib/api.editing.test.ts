import { afterEach, describe, expect, it, vi } from "vitest";
import { api, recordTimestamp, timestampOf } from "./api";
import { registerStepUpHost } from "./auth/step-up";
import { registerEditLease } from "./edit-leases";
vi.mock("./notifications", () => ({ notify: { error: vi.fn() } }));
afterEach(() => {
  vi.unstubAllGlobals();
  registerStepUpHost(null);
});

describe("editing timestamp transport", () => {
  it("sends all mounted leases only on mutation requests, including empty scope sets", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ data: {} }))),
      );
    vi.stubGlobal("fetch", fetcher);
    const removeOuter = registerEditLease("outer");
    const removeInner = registerEditLease("inner");
    try {
      await api.admin.listUsers.call();
      await api.admin.createDepartment.call({ name: "Test" });
      await api.presence.touch.call({
        resource: "department",
        leaseId: "outer",
      });
      await api.presence.leave.call({
        resource: "department",
        leaseId: "outer",
      });
      expect(
        new Headers(fetcher.mock.calls[0][1].headers).has("x-edit-leases"),
      ).toBe(false);
      expect(
        new Headers(fetcher.mock.calls[1][1].headers).get("x-edit-leases"),
      ).toBe('["outer","inner"]');
      expect(
        new Headers(fetcher.mock.calls[2][1].headers).has("x-edit-leases"),
      ).toBe(false);
      expect(
        new Headers(fetcher.mock.calls[3][1].headers).has("x-edit-leases"),
      ).toBe(false);
      removeInner();
      await api.admin.createDepartment.call({ name: "Test" });
      expect(
        new Headers(fetcher.mock.calls[4][1].headers).get("x-edit-leases"),
      ).toBe('["outer"]');
      removeOuter();
      await api.admin.createDepartment.call({ name: "Test" });
      expect(
        new Headers(fetcher.mock.calls[5][1].headers).get("x-edit-leases"),
      ).toBe("[]");
    } finally {
      removeOuter();
      removeInner();
    }
  });
  it("does not attach or advance a draft timestamp for presence heartbeats", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: "presence-user" }], ts: 10 }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ userId: "other", name: "Other" }] }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null })));
    vi.stubGlobal("fetch", fetcher);
    const snapshot = await api.admin.listUsers.call();
    const input = { resource: "user", id: "presence-user", leaseId: "lease-1" };
    await api.presence.touch.call(input);
    await api.presence.leave.call(input);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(input);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(input);
    expect(recordTimestamp("presence-user")).toBe(10);
    expect(timestampOf(snapshot.data[0])).toBe(10);
  });
  it("does not reuse a user-directory timestamp for authenticator recovery", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: "recovery-admin" }], ts: 10 }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Recover first",
            data: { code: "STEP_UP_REQUIRED", authenticatorReset: true },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { enrolled: false } })),
      );
    vi.stubGlobal("fetch", fetcher);
    const recoveryModes: boolean[] = [];
    registerStepUpHost((waiter) => {
      recoveryModes.push(waiter.authenticatorReset);
      queueMicrotask(waiter.ok);
    });
    await api.admin.listUsers.call();
    await api.admin.resetAuthenticator.call({ userId: "recovery-admin" });
    expect(recoveryModes).toEqual([true]);
    expect(fetcher.mock.calls[1][1].body).toBeUndefined();
    expect(fetcher.mock.calls[2][1].body).toBeUndefined();
  });
  it("does not anchor transfer commands to an older polling snapshot", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { incoming: [{ id: "transfer-polled" }], outgoing: [] },
            ts: 10,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: "DECLINED" } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { cancelled: true } })),
      );
    vi.stubGlobal("fetch", fetcher);
    await api.instructor.listMyTransferRequests.call();
    await api.instructor.respondDepartmentTransfer.call({
      requestId: "transfer-polled",
      accept: false,
    });
    await api.instructor.cancelDepartmentTransfer.call({
      requestId: "transfer-polled",
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      accept: false,
    });
    expect(fetcher.mock.calls[2][1].body).toBeUndefined();
  });
  it("keeps a form snapshot while newer reads arrive and sends it on POST edits", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "entry-test" }], ts: 10 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "entry-test" }], ts: 20 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true }, ts: 10 })),
      );
    vi.stubGlobal("fetch", fetcher);
    const old = (await api.admin.listUsers.call()) as { data: object[] };
    const frozen = timestampOf(old.data[0]);
    await api.admin.listUsers.call();
    await api.officer.verifyStep.call({
      verificationId: "entry-test",
      ts: frozen,
    });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ ts: 10 });
    expect(timestampOf(JSON.parse(JSON.stringify(old.data[0])))).toBe(10);
  });
});
