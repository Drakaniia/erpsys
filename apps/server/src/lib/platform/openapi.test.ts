import { describe, expect, it } from "vitest";
import { openapiDocument } from "./openapi.js";

describe("openapiDocument", () => {
  it("is a valid OpenAPI 3.1 root with info and paths", () => {
    expect(openapiDocument.openapi).toBe("3.1.0");
    expect(openapiDocument.info.title).toBe("ERPSYS API");
    expect(typeof openapiDocument.paths["/api/health"].get).toBe("object");
  });
});
