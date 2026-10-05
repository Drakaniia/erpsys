import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envHolder = vi.hoisted(() => ({
  overrides: {
    BREVO_API_KEY: "",
    MAIL_FROM: "",
  } as Record<string, string>,
}));

const toggleHolder = vi.hoisted(() => ({ enabled: true }));

vi.mock("./env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env.js")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, key) =>
        typeof key === "string" && key in envHolder.overrides
          ? envHolder.overrides[key]
          : Reflect.get(target, key),
    }),
  };
});

vi.mock("./integration-settings.js", () => ({
  integrationEnabled: async () => toggleHolder.enabled,
  integrationConfigured: () =>
    envHolder.overrides.BREVO_API_KEY.trim().length > 0 &&
    envHolder.overrides.MAIL_FROM.trim().length > 0,
}));

import { sendMail } from "./mailer.js";

const fetchMock = vi.fn();

beforeEach(() => {
  envHolder.overrides.BREVO_API_KEY = "";
  envHolder.overrides.MAIL_FROM = "";
  toggleHolder.enabled = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configure() {
  envHolder.overrides.BREVO_API_KEY = "xkeysib-test";
  envHolder.overrides.MAIL_FROM = "ERPSYS <no-reply@buksu.edu.ph>";
}

describe("sendMail", () => {
  it("does nothing and never calls Brevo when unconfigured", async () => {
    // A deployment without credentials must not fail the caller — password
    // reset, queue serving and enrollment completion all keep working.
    expect(
      await sendMail({ to: "student@buksu.edu.ph", subject: "Hi", text: "Body" }),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when the admin switched email off", async () => {
    configure();
    toggleHolder.enabled = false;
    expect(
      await sendMail({ to: "student@buksu.edu.ph", subject: "Hi", text: "Body" }),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message to Brevo with the sender split into name and address", async () => {
    configure();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "{}",
    });

    expect(
      await sendMail({
        to: " student@buksu.edu.ph ",
        subject: "It's your turn",
        text: "The adviser is serving you now.\nPlease go to the office.",
      }),
    ).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe("xkeysib-test");
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: "no-reply@buksu.edu.ph", name: "ERPSYS" },
      to: [{ email: "student@buksu.edu.ph" }],
      subject: "It's your turn",
      textContent: "The adviser is serving you now.\nPlease go to the office.",
      htmlContent:
        "<p>The adviser is serving you now.<br>Please go to the office.</p>",
    });
  });

  it("accepts a bare sender address without a display name", async () => {
    envHolder.overrides.BREVO_API_KEY = "xkeysib-test";
    envHolder.overrides.MAIL_FROM = "no-reply@buksu.edu.ph";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "{}",
    });

    await sendMail({ to: "student@buksu.edu.ph", subject: "Hi", text: "Body" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sender).toEqual({
      email: "no-reply@buksu.edu.ph",
    });
  });

  it("escapes HTML so a queue/notification body cannot inject markup", async () => {
    configure();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "{}",
    });

    await sendMail({
      to: "student@buksu.edu.ph",
      subject: "Hi",
      text: 'Queue <b>moved</b> & "reset"',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).htmlContent).toBe(
      "<p>Queue &lt;b&gt;moved&lt;/b&gt; &amp; &quot;reset&quot;</p>",
    );
  });

  it("reports failure instead of throwing when Brevo rejects the message", async () => {
    configure();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"code":"invalid_parameter"}',
    });

    expect(
      await sendMail({ to: "student@buksu.edu.ph", subject: "Hi", text: "Body" }),
    ).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("reports failure instead of throwing when the network fails", async () => {
    configure();
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(
      await sendMail({ to: "student@buksu.edu.ph", subject: "Hi", text: "Body" }),
    ).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("skips an empty recipient", async () => {
    configure();
    expect(await sendMail({ to: "  ", subject: "Hi", text: "Body" })).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
