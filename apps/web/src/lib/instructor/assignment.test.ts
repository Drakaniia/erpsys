import { describe, expect, it } from "vitest";
import { YEAR_LEVELS, type YearLevel } from "$lib/domain/constants";
import {
  resolveAssignScope,
  takenYearLevels,
  type DepartmentOwner,
} from "./assignment";

const owner = (
  adviserId: string,
  name: string,
  yearLevels: YearLevel[],
): DepartmentOwner => ({ adviserId, name, yearLevels });

describe("resolveAssignScope", () => {
  it("keeps an explicit selection as-is (normalized)", () => {
    expect(resolveAssignScope(["FOURTH", "THIRD"], ["FIRST", "FIFTH"])).toEqual(
      ["THIRD", "FOURTH"],
    );
  });

  it("treats an empty selection as every level the department offers", () => {
    expect(resolveAssignScope([], ["FIRST", "SECOND", "THIRD"])).toEqual([
      "FIRST",
      "SECOND",
      "THIRD",
    ]);
  });

  it("falls back to all five levels when the department declares none", () => {
    expect(resolveAssignScope([], [])).toEqual([...YEAR_LEVELS]);
  });
});

describe("takenYearLevels", () => {
  it("returns nothing when nobody else is mapping the department", () => {
    expect(takenYearLevels([])).toEqual([]);
  });

  it("unions and dedupes the other owners' levels", () => {
    expect(
      takenYearLevels([
        owner("a1", "Ada", ["THIRD"]),
        owner("a2", "Ben", ["THIRD", "FOURTH"]),
      ]),
    ).toEqual(["THIRD", "FOURTH"]);
  });

  it("lets an owner holding every level (empty set) take the whole department", () => {
    expect(takenYearLevels([owner("a1", "Ada", [])])).toEqual([...YEAR_LEVELS]);
  });

  it("ignores the caller's own mapping", () => {
    expect(
      takenYearLevels(
        [owner("me", "Me", ["FIRST"]), owner("a2", "Ben", ["THIRD"])],
        "me",
      ),
    ).toEqual(["THIRD"]);
  });

  it("ignores the caller's own unrestricted mapping too", () => {
    expect(takenYearLevels([owner("me", "Me", [])], "me")).toEqual([]);
  });
});
