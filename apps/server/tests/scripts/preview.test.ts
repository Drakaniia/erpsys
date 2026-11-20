import { describe, expect, it } from "vitest";
import { previewEnvironment } from "../../src/scripts/preview.js";

describe("previewEnvironment", () => {
  it("serves the built app and API at the existing default auth origin", () => {
    expect(previewEnvironment({})).toEqual({
      NODE_ENV: "development",
      SERVE_WEB: "true",
      PORT: "5173",
      BETTER_AUTH_URL: "http://localhost:5173",
      PUBLIC_SITE_URL: "http://localhost:5173",
    });
  });

  it("preserves integration credentials and uses the auth port instead of the dev API port", () => {
    const source = {
      NODE_ENV: "production",
      SERVE_WEB: "false",
      PORT: "3001",
      BETTER_AUTH_URL: "http://localhost:5173/",
      PUBLIC_SITE_URL: "http://localhost:5173",
      DATABASE_URL: "mongodb://localhost:27017/preview-test",
      BETTER_AUTH_SECRET: "unchanged-test-secret",
      GOOGLE_CLIENT_SECRET: "unchanged-test-google-secret",
      R2_UPLOADS_ENABLED: "false",
    };
    const result = previewEnvironment(source);
    expect(result).toMatchObject({
      ...source,
      NODE_ENV: "development",
      SERVE_WEB: "true",
      PORT: "5173",
      BETTER_AUTH_URL: "http://localhost:5173",
    });
    expect(source.NODE_ENV).toBe("production");
    expect(source.PORT).toBe("3001");
  });

  it.each(["http://127.0.0.1:4173", "http://[::1]:4173", "http://localhost"])(
    "supports a matching local origin: %s",
    (origin) => {
      const result = previewEnvironment({ BETTER_AUTH_URL: origin });
      expect(result.BETTER_AUTH_URL).toBe(origin);
      expect(result.PUBLIC_SITE_URL).toBe(origin);
      expect(result.PORT).toBe(new URL(origin).port || "80");
    },
  );

  it.each([
    "https://example.com",
    "http://localhost.example.com:5173",
    "https://localhost:5173",
    "http://localhost:5173/api/auth",
    "http://user:password@localhost:5173",
    "http://localhost:5173?test=1",
    "http://localhost:5173#test",
    "not-a-url",
  ])("rejects an unsupported auth origin: %s", (origin) => {
    expect(() => previewEnvironment({ BETTER_AUTH_URL: origin })).toThrow();
  });

  it("rejects a different public origin instead of breaking integration callbacks silently", () => {
    expect(() =>
      previewEnvironment({
        BETTER_AUTH_URL: "http://localhost:5173",
        PUBLIC_SITE_URL: "https://example.com",
      }),
    ).toThrow("PUBLIC_SITE_URL to match BETTER_AUTH_URL");
  });
});
