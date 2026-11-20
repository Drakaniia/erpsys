import { describe, expect, it } from "vitest";
import {
  PRE_ENROLLMENT_STEP_CODES,
  STEP_CODES,
  STEP_NAMES,
  findStepByCode,
  findStepById,
  listStepCodeMap,
  listSteps,
  listStepsByCodes,
} from "../../src/config/constants.js";

describe("fixed step definitions", () => {
  it("uses canonical codes as IDs and preserves names and one-based order", () => {
    expect(listSteps()).toEqual(
      STEP_CODES.map((code, index) => ({
        _id: code,
        code,
        name: STEP_NAMES[code],
        order: index + 1,
      })),
    );
    expect(listSteps()).toHaveLength(6);
    expect(new Set(listSteps().map((step) => step._id)).size).toBe(6);
    expect(listSteps()[0]).toEqual({
      _id: "ASSESSMENT",
      code: "ASSESSMENT",
      name: "Assessment",
      order: 1,
    });
  });

  it("resolves IDs and codes identically without historical database aliases", () => {
    for (const code of STEP_CODES) {
      expect(findStepById(code)).toEqual(findStepByCode(code));
    }
    for (const unknown of [
      "",
      "assessment",
      "step-assessment",
      "UNKNOWN",
      "toString",
    ]) {
      expect(findStepByCode(unknown)).toBeNull();
      expect(findStepById(unknown)).toBeNull();
    }
  });

  it("filters in canonical order, ignores unknown codes, and removes duplicates", () => {
    expect(
      listStepsByCodes(["CONSENT", "ASSESSMENT", "UNKNOWN", "CONSENT"]),
    ).toEqual([findStepByCode("ASSESSMENT"), findStepByCode("CONSENT")]);
    expect(listStepsByCodes([])).toEqual([]);
    expect(
      listStepsByCodes(PRE_ENROLLMENT_STEP_CODES).map((step) => step.code),
    ).toEqual(PRE_ENROLLMENT_STEP_CODES);
    expect(
      listStepsByCodes(PRE_ENROLLMENT_STEP_CODES).some(
        (step) => step.code === "ENROLLMENT",
      ),
    ).toBe(false);
  });

  it("returns fresh data so callers cannot corrupt later lookups", () => {
    const steps = listSteps();
    steps[0]!.name = "Changed";
    steps.reverse();
    const step = findStepById("ASSESSMENT")!;
    step.order = 99;
    const map = listStepCodeMap();
    map[0]!.code = "ENROLLMENT";
    expect(listSteps()[0]).toEqual({
      _id: "ASSESSMENT",
      code: "ASSESSMENT",
      name: "Assessment",
      order: 1,
    });
    expect(listStepCodeMap()).toEqual(
      STEP_CODES.map((code) => ({ _id: code, code })),
    );
  });

  it("remains compatible with awaited and Promise.all callers", async () => {
    expect(await findStepByCode("ASSESSMENT")).toEqual(listSteps()[0]);
    const [steps, map] = await Promise.all([listSteps(), listStepCodeMap()]);
    expect(steps.map((step) => step._id)).toEqual(map.map((step) => step._id));
  });
});
