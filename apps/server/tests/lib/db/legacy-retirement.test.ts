import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  LEGACY_COLLECTIONS,
  reconcileLegacy,
  assertLegacySnapshot,
  type LegacySnapshot,
} from "../../../src/scripts/retire-legacy-collections.js";

function fixture(): LegacySnapshot {
  const at = new Date("2025-01-01T00:00:00Z");
  const later = new Date("2025-02-01T00:00:00Z");
  const result = Object.fromEntries(
    LEGACY_COLLECTIONS.map((name) => [name, []]),
  ) as unknown as LegacySnapshot;
  result.admin_action_log = [
    {
      _id: "old",
      actorId: "actor",
      action: "RESET",
      targetRef: "target",
      reason: "reason",
      detail: { n: 1 },
      at,
    },
  ];
  result.audit_log = [
    {
      ...result.admin_action_log[0],
      _id: "new",
      legacyId: "old",
      kind: "action",
      createdAt: at,
      updatedAt: at,
    },
  ];
  result.integration_setting = [
    {
      _id: "setting",
      key: "mail",
      enabled: true,
      createdAt: later,
      updatedAt: later,
      updatedById: "actor",
    },
  ];
  result.integration_credential = [
    {
      _id: "credential",
      key: "mail",
      values: { secret: { ciphertext: "opaque", iv: "iv" } },
      version: 3,
      createdAt: at,
      updatedAt: at,
      updatedById: "actor",
    },
  ];
  result.integration = [
    {
      _id: "integration",
      key: "mail",
      enabled: true,
      enabledAt: later,
      enabledById: "actor",
      values: { secret: { ciphertext: "opaque", iv: "iv" } },
      version: 3,
      createdAt: at,
      updatedAt: at,
      updatedById: "actor",
    },
  ];
  result.profiling_form = [
    {
      _id: "form",
      academicYearId: "year",
      formId: "external",
      title: "Title",
      responderUri: "https://example.test",
      updatedAt: at,
      updatedById: "actor",
    },
  ];
  result.academic_year = [
    {
      _id: "year",
      profilingForm: {
        legacyId: "form",
        formId: "external",
        title: "Title",
        responderUri: "https://example.test",
        updatedAt: at,
        updatedById: "actor",
      },
    },
  ];
  return result;
}

describe("legacy retirement reconciliation", () => {
  it("uses legacyId rather than destination ID, preserving opaque credentials and earliest integration creation", () => {
    const input = fixture();
    const before = structuredClone(input);
    reconcileLegacy(input);
    expect(input).toEqual(before);
  });

  it("supports BSON legacy identifiers", () => {
    const input = fixture();
    const id = new ObjectId();
    input.admin_action_log[0]!._id = id;
    input.audit_log[0]!.legacyId = id.toHexString();
    reconcileLegacy(input);
  });

  it.each([
    "missing action",
    "duplicate mapping",
    "reused mapping",
    "wrong kind",
    "changed reason",
    "changed detail",
    "wrong derived timestamp",
    "switch changed",
    "credential changed",
    "version changed",
    "wrong creation",
    "unknown setting field",
    "unknown credential field",
    "unlinked form",
    "missing year",
    "changed form",
    "duplicate setting",
    "active presence",
  ])("rejects %s", (scenario) => {
    const input = fixture();
    switch (scenario) {
      case "missing action":
        input.audit_log = [];
        break;
      case "duplicate mapping":
        input.audit_log.push({ ...input.audit_log[0] });
        break;
      case "reused mapping":
        input.admin_action_log.push({ ...input.admin_action_log[0] });
        break;
      case "wrong kind":
        input.audit_log[0]!.kind = "http";
        break;
      case "changed reason":
        input.audit_log[0]!.reason = "different";
        break;
      case "changed detail":
        input.audit_log[0]!.detail = { n: 2 };
        break;
      case "wrong derived timestamp":
        input.audit_log[0]!.createdAt = new Date();
        break;
      case "switch changed":
        input.integration[0]!.enabled = false;
        break;
      case "credential changed":
        input.integration[0]!.values = {};
        break;
      case "version changed":
        input.integration[0]!.version = 4;
        break;
      case "wrong creation":
        input.integration[0]!.createdAt = new Date();
        break;
      case "unknown setting field":
        input.integration_setting[0]!.unexpected = "unpreserved";
        break;
      case "unknown credential field":
        input.integration_credential[0]!.unexpected = "unpreserved";
        break;
      case "unlinked form":
        input.academic_year[0]!.profilingForm = null;
        break;
      case "missing year":
        input.academic_year = [];
        break;
      case "changed form":
        (
          input.academic_year[0]!.profilingForm as Record<string, unknown>
        ).title = "Changed";
        break;
      case "duplicate setting":
        input.integration_setting.push({ ...input.integration_setting[0] });
        break;
      case "active presence":
        input.editing_presence = [{ _id: "active" }];
        break;
    }
    expect(() => reconcileLegacy(input)).toThrow();
  });

  it("allows already retired sources to remain absent on rerun", () => {
    const input = fixture();
    for (const name of [
      "integration_setting",
      "integration_credential",
      "profiling_form",
      "admin_action_log",
    ] as const) {
      input[name] = [];
      reconcileLegacy(input);
    }
  });

  it("snapshot checks tolerate order but catch additions, mutations and BSON changes", () => {
    const input = fixture();
    const actual = fixture();
    assertLegacySnapshot(input, actual);
    actual.audit_log[0]!.reason = "changed";
    expect(() => assertLegacySnapshot(input, actual)).toThrow(
      "LEGACY_SNAPSHOT_CHANGED",
    );
    actual.audit_log = [...input.audit_log, { _id: "new-event" }];
    expect(() => assertLegacySnapshot(input, actual)).toThrow(
      "LEGACY_SNAPSHOT_CHANGED",
    );
  });
});
