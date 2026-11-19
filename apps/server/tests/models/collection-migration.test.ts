import type { Db } from "mongodb";
import { expect, it } from "vitest";
import { simplifyCollections } from "../../src/scripts/simplify-collections.js";
import { fakeDb } from "../helpers/fakeDb.js";

it("dry-runs, preserves encrypted fields and history, and safely reruns", async () => {
  const at = new Date("2026-01-01");
  const cipher = { ciphertext: "opaque", iv: "iv", tag: "tag", fingerprint: "fp" };
  const fake = fakeDb({
    admin_action_log: [{ _id: "a", actorId: "admin", action: "Changed", at }],
    audit_log: [{ _id: "http", method: "POST", createdAt: at }],
    integration_setting: [{ _id: "s", key: "r2", enabled: false, updatedById: "admin", updatedAt: at }],
    integration_credential: [{ _id: "c", key: "r2", values: { R2_SECRET_ACCESS_KEY: cipher }, version: 3, updatedAt: at }],
    profiling_form: [{ _id: "p", academicYearId: "year", formId: "google", updatedAt: at }],
    academic_year: [{ _id: "year", isActive: true }],
  });
  const db = { collection: (name: string) => ({ ...fake.db.collection(name), createIndex: async () => "index" }) } as unknown as Db;
  expect((await simplifyCollections(db)).applied).toBe(false);
  expect(fake.store.audit_log).toHaveLength(1);
  await simplifyCollections(db, true);
  expect(fake.store.audit_log).toHaveLength(2);
  expect(fake.store.integration[0]).toMatchObject({ key: "r2", enabled: false, version: 3, values: { R2_SECRET_ACCESS_KEY: cipher } });
  expect(fake.store.academic_year[0].profilingForm).toMatchObject({ formId: "google" });
  await simplifyCollections(db, true);
  expect(fake.store.audit_log).toHaveLength(2);
  expect(fake.store.integration).toHaveLength(1);
  expect(fake.store.admin_action_log).toHaveLength(1);
  expect(fake.store.integration_credential).toHaveLength(1);
  expect(fake.store.profiling_form).toHaveLength(1);
});

it("refuses ambiguous data before copying anything", async () => {
  const fake = fakeDb({ integration_setting: [{ key: "r2" }, { key: "r2" }] });
  await expect(simplifyCollections(fake.db as unknown as Db, true)).rejects.toThrow("Duplicate key");
  expect(fake.store.audit_log).toBeUndefined();
});
