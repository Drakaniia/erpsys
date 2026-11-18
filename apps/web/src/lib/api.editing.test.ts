import { afterEach, describe, expect, it, vi } from "vitest";
import { api, timestampOf } from "./api";
vi.mock("./notifications", () => ({ notify: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

describe("editing timestamp transport", () => {
  it("keeps a form snapshot while newer reads arrive and sends it on POST edits", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "entry-test" }], ts: 10 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "entry-test" }], ts: 20 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true }, ts: 10 })));
    vi.stubGlobal("fetch", fetcher);
    const old = await api.admin.listUsers.call() as { data: object[] };
    const frozen = timestampOf(old.data[0]);
    await api.admin.listUsers.call();
    await api.officer.verifyStep.call({ verificationId: "entry-test", ts: frozen });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ ts: 10 });
    expect(timestampOf(JSON.parse(JSON.stringify(old.data[0])))).toBe(10);
  });
});
