import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./pages-worker.mjs";

test("serves SPA routes without calling the API", async () => {
  const response = await worker.fetch(new Request("https://erpsys.pages.dev/login"), { ASSETS: { fetch: async () => new Response("SPA") } });
  assert.equal(await response.text(), "SPA");
});
test("hides the internal scheduler endpoint", async () => {
  const response = await worker.fetch(new Request("https://erpsys.pages.dev/api/internal/maintenance"), {});
  assert.equal(response.status, 404);
});
test("preserves API queries, method, body, cookies, redirects and uncached responses", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url.toString(), "https://backend.vercel.app/api/v1/test?q=1");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.get("cookie"), "session=test");
    assert.equal(init.headers.get("x-erpsys-proxy-secret"), "test-secret");
    assert.equal(init.headers.get("x-erpsys-client-ip"), "192.0.2.1");
    assert.equal(init.headers.get("x-forwarded-for"), null);
    assert.equal(await new Response(init.body).text(), "body");
    return new Response("stream", { status: 302, headers: { location: "/login", "set-cookie": "session=new; Secure; HttpOnly" } });
  };
  try {
    const request = new Request("https://erpsys.pages.dev/api/v1/test?q=1", { method: "POST", body: "body", headers: { cookie: "session=test", "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "spoofed", "x-erpsys-proxy-secret": "spoofed" } });
    const response = await worker.fetch(request, { API_ORIGIN: "https://backend.vercel.app", API_PROXY_SECRET: "test-secret" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), "session=new; Secure; HttpOnly");
    assert.equal(await response.text(), "stream");
  } finally { globalThis.fetch = original; }
});
