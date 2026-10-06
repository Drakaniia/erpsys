import { afterEach, describe, expect, it, vi } from "vitest";
import { probeCredentials } from "./credential-probes.js";

const R2_ENDPOINT = `https://${"a".repeat(32)}.r2.cloudflarestorage.com`;

const R2_VALUES = {
  R2_BUCKET: "erpsys-prod",
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret-key",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(answer: Response | (() => Promise<Response>)) {
  const mock = vi.fn(async () =>
    typeof answer === "function" ? answer() : answer,
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe("googleAuth", () => {
  const values = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  };

  it("accepts a recognised pair that rejects the dummy code", async () => {
    stubFetch(json(400, { error: "invalid_grant" }));
    await expect(probeCredentials("googleAuth", values)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a client Google does not know", async () => {
    stubFetch(json(401, { error: "invalid_client" }));
    const result = await probeCredentials("googleAuth", values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0].key).toBe("GOOGLE_CLIENT_ID");
      expect(result.failures[0].reason).toContain("rejected");
    }
  });

  it("blocks on a provider outage", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    const result = await probeCredentials("googleAuth", values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0].reason).toContain("reach");
  });
});

describe("turnstile", () => {
  const values = { TURNSTILE_SECRET_KEY: "secret" };

  it("accepts a good secret with a bad token", async () => {
    stubFetch(
      json(200, { success: false, "error-codes": ["invalid-input-response"] }),
    );
    await expect(probeCredentials("turnstile", values)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a bad secret", async () => {
    stubFetch(
      json(200, { success: false, "error-codes": ["invalid-input-secret"] }),
    );
    const result = await probeCredentials("turnstile", values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0].key).toBe("TURNSTILE_SECRET_KEY");
  });

  it("treats an HTML error page as an unexpected response, not a crash", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 200 }));
    const result = await probeCredentials("turnstile", values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures[0].reason).toContain("unexpected");
  });
});

describe("r2", () => {
  it("rejects an endpoint that is not an R2 host before any request", async () => {
    const mock = stubFetch(json(200, {}));
    for (const endpoint of [
      "https://internal.example.com",
      `https://${"a".repeat(32)}.r2.cloudflarestorage.com/path`,
      `http://${"a".repeat(32)}.r2.cloudflarestorage.com`,
      `https://${"a".repeat(32)}.r2.cloudflarestorage.com:8443`,
    ]) {
      const result = await probeCredentials("r2", {
        ...R2_VALUES,
        R2_ENDPOINT: endpoint,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failures[0].key).toBe("R2_ENDPOINT");
    }
    expect(mock).not.toHaveBeenCalled();
  });

  it("signs a HEAD bucket request and accepts 200", async () => {
    const mock = stubFetch(new Response(null, { status: 200 }));
    await expect(probeCredentials("r2", R2_VALUES)).resolves.toEqual({
      ok: true,
    });

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${R2_ENDPOINT}/erpsys-prod`);
    expect(init.method).toBe("HEAD");
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toContain("AWS4-HMAC-SHA256");
  });

  it("maps 403 to the key and 404 to the bucket", async () => {
    stubFetch(new Response(null, { status: 403 }));
    const rejected = await probeCredentials("r2", R2_VALUES);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.failures[0].key).toBe("R2_ACCESS_KEY_ID");
      expect(rejected.failures[0].reason).toBe("key rejected");
    }

    stubFetch(new Response(null, { status: 404 }));
    const missing = await probeCredentials("r2", R2_VALUES);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.failures[0].key).toBe("R2_BUCKET");
      expect(missing.failures[0].reason).toBe("bucket not found");
    }
  });
});

describe("cloudflareChat", () => {
  const values = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "tok" };

  it("accepts success:true", async () => {
    stubFetch(json(200, { success: true }));
    await expect(probeCredentials("cloudflareChat", values)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a token and a missing account separately", async () => {
    stubFetch(json(401, {}));
    const token = await probeCredentials("cloudflareChat", values);
    expect(token.ok).toBe(false);
    if (!token.ok) expect(token.failures[0].key).toBe("CLOUDFLARE_API_TOKEN");

    stubFetch(json(404, {}));
    const account = await probeCredentials("cloudflareChat", values);
    expect(account.ok).toBe(false);
    if (!account.ok) expect(account.failures[0].key).toBe("CLOUDFLARE_ACCOUNT_ID");
  });
});

describe("email", () => {
  it("accepts 200 and rejects 401", async () => {
    stubFetch(json(200, {}));
    await expect(
      probeCredentials("email", { BREVO_API_KEY: "key" }),
    ).resolves.toEqual({ ok: true });

    stubFetch(json(401, {}));
    const result = await probeCredentials("email", { BREVO_API_KEY: "key" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0].key).toBe("BREVO_API_KEY");
      expect(result.failures[0].reason).toBe("API key rejected");
    }
  });
});
