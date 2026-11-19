import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { ContentModel } from "../../src/models/ContentModel.js";
import { fakeDb } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/lib/db/db.js", async (original) => ({
  ...(await original<typeof import("../../src/lib/db/db.js")>()),
  getDbSync: () => holder.db,
}));

let context: ReturnType<typeof fakeDb>;
beforeEach(() => {
  context = fakeDb({
    [COLLECTIONS.content]: [
      { _id: "req2", kind: "requirement", label: "Second", order: 2, isActive: true },
      { _id: "link2", kind: "socialLink", name: "Second", url: "https://example.com/2", order: 90, isActive: true },
      { _id: "req1", kind: "requirement", label: "First", order: 1, isActive: true },
      { _id: "link1", kind: "socialLink", name: "First", url: "https://example.com/1", order: 80, isActive: true },
      { _id: "inactive", kind: "requirement", label: "Hidden", order: 3, isActive: false },
      { _id: "hidden-link", kind: "socialLink", name: "Hidden", order: 100, isActive: false },
    ],
  });
  holder.db = context.db;
});

describe("content kind isolation", () => {
  it("keeps requirement and social ordering and active reads independent", async () => {
    expect((await ContentModel.list()).map((row) => row._id)).toEqual(["req1", "req2", "inactive"]);
    expect((await ContentModel.listActive()).map((row) => row._id)).toEqual(["req1", "req2"]);
    expect((await ContentModel.listActiveSocialLinks()).map((row) => row._id)).toEqual(["link1", "link2"]);
    expect(await ContentModel.lastOrder()).toBe(3);
    expect(await ContentModel.findById("link1")).toBeNull();
    expect(await ContentModel.findById("req1")).toMatchObject({ _id: "req1", label: "First" });
  });

  it("cannot update or delete a social link through requirement IDs", async () => {
    const links = context.store[COLLECTIONS.content].filter((row) => row.kind === "socialLink");
    await ContentModel.update("link1", { order: 0, isActive: false });
    await ContentModel.remove("link2");
    expect(context.store[COLLECTIONS.content].filter((row) => row.kind === "socialLink")).toEqual(links);
    await ContentModel.update("req1", { order: 10, label: "Updated" });
    expect(await ContentModel.findById("req1")).toMatchObject({ order: 10, label: "Updated" });
    await ContentModel.remove("req2");
    expect(await ContentModel.findById("req2")).toBeNull();
  });

  it("adds the requirement discriminator without replacing caller IDs or inputs", async () => {
    const row = { _id: "preserved", label: "New", order: 4, isActive: true };
    await ContentModel.insert(row);
    expect(context.store[COLLECTIONS.content].find((stored) => stored._id === row._id)).toEqual({ ...row, kind: "requirement" });
    expect(row).not.toHaveProperty("kind");
  });
});
