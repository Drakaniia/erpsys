import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { chatRouter } from "../../src/routes/chat/index.js";

const holder = vi.hoisted(() => ({ session: null as unknown }));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));

const STUDENT = {
  user: {
    id: "u-p1",
    name: "Ana",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
  },
};
const ADVISER = {
  user: {
    id: "adv1",
    name: "Ada",
    email: "ada@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use("/api", chatRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let server: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  holder.session = STUDENT;
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const send = (body: unknown) =>
  fetch(`${server.url}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("chat stream guards", () => {
  it("refuses an anonymous caller", async () => {
    holder.session = null;
    const response = await send({ messages: [{ role: "user", text: "hi" }] });
    expect(response.status).toBe(401);
  });

  it("refuses a role without the student surface", async () => {
    holder.session = ADVISER;
    const response = await send({ messages: [{ role: "user", text: "hi" }] });
    expect(response.status).toBe(403);
  });

  it("explains an empty conversation", async () => {
    const response = await send({ messages: [] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "messages must have at least 1 message.",
    );
  });

  it("explains an over-long message", async () => {
    const response = await send({
      messages: [{ role: "user", text: "x".repeat(2001) }],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "messages[0].text is over 2000 characters — shorten it and try again.",
    );
  });
});
