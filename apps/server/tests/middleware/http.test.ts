import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseQuery } from "../../src/middleware/http.js";

describe("parseQuery", () => {
  // `DELETE /users/A?userId=B` must act on A — the path is what the audit
  // trail records, so a query string may never override a path param.
  it("lets path params win over same-named query keys", () => {
    const req = {
      params: { userId: "A" },
      query: { userId: "B", page: "2" },
    } as unknown as Request;
    expect(
      parseQuery(z.object({ userId: z.string(), page: z.string() }), req),
    ).toEqual({ userId: "A", page: "2" });
  });
});
