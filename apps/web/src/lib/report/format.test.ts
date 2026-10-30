import { YEAR_LEVELS, YEAR_LEVEL_LABELS } from "$lib/domain/constants";
import { describe, expect, it } from "vitest";
import { STEP_STATE_LABELS } from "../instructor/students";
import {
  EMPTY,
  ORG_NAME,
  QUEUE_LABELS,
  QUEUE_SHORT,
  SHORT_STATE_LABELS,
  formatCount,
  formatDate,
  formatDateTime,
  formatPercent,
  orDash,
  shortYearLevel,
  toWinAnsi,
} from "./format";

const TYPOGRAPHIC_CASES: Array<[string, string]> = [
  ["\u2019", "'"],
  ["\u2018", "'"],
  ["\u201C", '"'],
  ["\u201D", '"'],
  ["\u2014", "-"],
  ["\u2013", "-"],
  ["\u2026", "..."],
  ["\u2022", "-"],
  ["\u00A0", " "],
];

describe("toWinAnsi", () => {
  it.each(TYPOGRAPHIC_CASES)("maps %j to %j", (input, expected) => {
    expect(toWinAnsi(input)).toBe(expected);
  });

  it("folds a whole typographic sentence", () => {
    expect(
      toWinAnsi(
        "Dela Pe\xF1a \u2014 \u201CNiagara\u201D\u2019s\u2026 ok \u2022 yes",
      ),
    ).toBe('Dela Pe\xF1a - "Niagara"\'s... ok - yes');
  });

  it("leaves accented Latin untouched", () => {
    // cp1252 covers the Latin-1 letters plus Œ/œ Š/š Ÿ Ž/ž; U+015B (Ś) is
    // outside WinAnsi, so it is deliberately absent from this list.
    expect(
      toWinAnsi(
        "Pe\xF1a, Jos\xE9, M\xFCller, Fran\xE7ois, \u00C5sa, \u00D6re, \u0160imek, \u0153uvre",
      ),
    ).toBe(
      "Pe\xF1a, Jos\xE9, M\xFCller, Fran\xE7ois, \u00C5sa, \u00D6re, \u0160imek, \u0153uvre",
    );
  });

  it("leaves plain ASCII untouched", () => {
    expect(toWinAnsi("BSIT-1A 2026_04/09 (a+b) [c] {d} #e $f %g &h")).toBe(
      "BSIT-1A 2026_04/09 (a+b) [c] {d} #e $f %g &h",
    );
  });

  it("replaces an unsupported CJK character with a question mark", () => {
    expect(toWinAnsi("\u6F22\u5B57")).toBe("??");
  });

  it("replaces an emoji, which is outside the repertoire, with one question mark", () => {
    expect(toWinAnsi("ok \u{1F600}")).toBe("ok ?");
  });

  it("replaces control characters and other outside-range code points", () => {
    expect(toWinAnsi("a\u0007b\u007Fc\u009Fd\u4E2De")).toBe("a?b?c?d?e");
  });

  it("returns an empty string for absent input", () => {
    expect(toWinAnsi(null)).toBe("");
    expect(toWinAnsi(undefined)).toBe("");
    expect(toWinAnsi("")).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a Date as dd MMM yyyy", () => {
    expect(formatDate(new Date("2026-03-04T06:32:00.000Z"))).toBe(
      "04 Mar 2026",
    );
  });

  it("formats an ISO string as dd MMM yyyy", () => {
    expect(formatDate("2026-03-04T06:32:00.000Z")).toBe("04 Mar 2026");
  });

  it("falls back to a hyphen for absent or invalid input", () => {
    expect(formatDate(null)).toBe(EMPTY);
    expect(formatDate(undefined)).toBe(EMPTY);
    expect(formatDate("")).toBe(EMPTY);
    expect(formatDate("   ")).toBe(EMPTY);
    expect(formatDate("not a date")).toBe(EMPTY);
    expect(formatDate(new Date("nope"))).toBe(EMPTY);
  });
});

describe("formatDateTime", () => {
  it("formats 24-hour time after the date", () => {
    expect(formatDateTime("2026-03-04T06:32:00.000Z")).toBe(
      "04 Mar 2026, 14:32",
    );
  });

  it("uses two-digit hours and keeps midnight at 00", () => {
    expect(formatDateTime("2026-03-03T16:05:00.000Z")).toBe(
      "04 Mar 2026, 00:05",
    );
  });

  it("falls back to a hyphen for absent or invalid input", () => {
    expect(formatDateTime(null)).toBe(EMPTY);
    expect(formatDateTime(undefined)).toBe(EMPTY);
    expect(formatDateTime("")).toBe(EMPTY);
    expect(formatDateTime("2026-13-45")).toBe(EMPTY);
  });
});

describe("the Asia/Manila pin", () => {
  // 17:00Z on 3 Mar is 01:00 on 4 Mar in Manila, but still 3 Mar everywhere
  // west of Greenwich, so the rendered value proves the viewer timezone is
  // ignored rather than merely agreeing with it.
  const NEAR_MIDNIGHT = "2026-03-03T17:00:00.000Z";

  it("renders identically under TZ=UTC and TZ=Asia/Tokyo", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utcDate = formatDate(NEAR_MIDNIGHT);
      const utcDateTime = formatDateTime(NEAR_MIDNIGHT);

      process.env.TZ = "Asia/Tokyo";
      const tokyoDate = formatDate(NEAR_MIDNIGHT);
      const tokyoDateTime = formatDateTime(NEAR_MIDNIGHT);

      expect(utcDate).toBe("04 Mar 2026");
      expect(utcDateTime).toBe("04 Mar 2026, 01:00");
      expect(tokyoDate).toBe(utcDate);
      expect(tokyoDateTime).toBe(utcDateTime);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1234)).toBe("1,234");
  });

  it("leaves small numbers and zero ungrouped", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(999)).toBe("999");
  });
});

describe("formatPercent", () => {
  it("is 0% on a zero total rather than NaN%", () => {
    expect(formatPercent(0, 0)).toBe("0%");
  });

  it("rounds to the nearest whole percent", () => {
    expect(formatPercent(1, 3)).toBe("33%");
    expect(formatPercent(2, 3)).toBe("67%");
    expect(formatPercent(4, 5)).toBe("80%");
  });

  it("is 100% when the part equals the total", () => {
    expect(formatPercent(6, 6)).toBe("100%");
  });
});

describe("orDash", () => {
  it("replaces absent and blank values with a hyphen", () => {
    expect(orDash(null)).toBe(EMPTY);
    expect(orDash(undefined)).toBe(EMPTY);
    expect(orDash("")).toBe(EMPTY);
    expect(orDash("   ")).toBe(EMPTY);
  });

  it("returns the trimmed value otherwise", () => {
    expect(orDash("  BSIT  ")).toBe("BSIT");
  });
});

describe("shortYearLevel", () => {
  it("abbreviates every year level", () => {
    const expected = ["1st", "2nd", "3rd", "4th", "5th"];
    expect(YEAR_LEVELS.map(shortYearLevel)).toEqual(expected);
  });

  it("is derived from the domain labels, not a second list", () => {
    for (const level of YEAR_LEVELS) {
      expect(shortYearLevel(level)).toBe(
        YEAR_LEVEL_LABELS[level].replace(/\s*Year$/, ""),
      );
    }
  });

  it("falls back to a hyphen for an absent or unknown level", () => {
    expect(shortYearLevel(null)).toBe(EMPTY);
    expect(shortYearLevel("SIXTH")).toBe(EMPTY);
  });
});

describe("SHORT_STATE_LABELS", () => {
  it("has the exact five short labels", () => {
    expect(SHORT_STATE_LABELS).toEqual({
      MISSING: "Missing",
      PENDING: "Pending",
      SUBMITTED: "Review",
      VERIFIED: "Verified",
      RETURNED: "Returned",
    });
  });

  it("covers exactly the keys of the authoritative long labels", () => {
    expect(Object.keys(SHORT_STATE_LABELS).sort()).toEqual(
      Object.keys(STEP_STATE_LABELS).sort(),
    );
  });

  it("only ever shortens a long label to itself or a truncation of itself", () => {
    for (const [state, short] of Object.entries(SHORT_STATE_LABELS)) {
      const long = STEP_STATE_LABELS[state as keyof typeof STEP_STATE_LABELS];
      const words = long.toLowerCase().split(" ");
      const needle = short.toLowerCase();
      expect(needle.length).toBeGreaterThan(0);
      expect(
        needle === long.toLowerCase() ||
          needle === words[words.length - 1] ||
          words.some((word) => word.startsWith(needle)),
      ).toBe(true);
    }
  });
});

describe("queue labels", () => {
  it("has the short roster labels", () => {
    expect(QUEUE_SHORT).toEqual({
      NONE: EMPTY,
      WAITING: "Waiting",
      IN_PROGRESS: "Serving",
      COMPLETED: "Done",
    });
  });

  it("has the long record-sheet labels", () => {
    expect(QUEUE_LABELS).toEqual({
      NONE: "Not in queue",
      WAITING: "Waiting",
      IN_PROGRESS: "Serving",
      COMPLETED: "Completed",
    });
  });

  it("agrees on the two statuses it does not rename", () => {
    expect(QUEUE_SHORT.WAITING).toBe(QUEUE_LABELS.WAITING);
    expect(QUEUE_SHORT.IN_PROGRESS).toBe(QUEUE_LABELS.IN_PROGRESS);
  });
});

describe("constants", () => {
  it("names the org and the empty marker as hyphens", () => {
    expect(ORG_NAME).toBe("College of Technology - Student Body Organization");
    expect(EMPTY).toBe("-");
  });
});
