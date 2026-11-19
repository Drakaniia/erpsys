/**
 * Editable /isometric model for the ERPSYS auth illustration (`ClearanceDeskIllustration.tsx`).
 *
 * Scene: The COT-SBO enrollment clearance desk where students, instructors and
 * SBO officers meet — a live queue monitor on the back left, a ticket dispenser
 * feeding a queue slip on the front left, a 6-step clearance clipboard in the
 * centre with the officer's gold rubber stamp poised over the verification seal,
 * an organizer tray of requirement folders at the back right, and a stack of
 * student ID cards with a pen in the foreground.
 */
import type { Decal, Drawing, Part } from "./clearance-desk.types";

/**
 * Tick mark in a top-face decal frame (`u` runs +x to lower-right, `v` runs +z to lower-left).
 * In screen space, `[-du, +dv]` goes down-left and `[+du, -dv]` goes up-right,
 * producing an upright checkmark `✓` for the viewer.
 */
const topCheck = (
  x: number,
  y: number,
  s = 0.12,
  stroke: true | "soft" | "accent" | "face" | "ink" = "ink",
): Decal => ({
  t: "line",
  pts: [
    [x, y],
    [x + s * 0.1, y + s * 0.55],
    [x + s * 0.95, y - s * 0.15],
  ],
  stroke,
  width: 1.4,
});

/** Tick mark in a front-face decal frame (`u` runs +x, `v` runs -y downward). */
const frontCheck = (
  x: number,
  y: number,
  s = 0.11,
  stroke: true | "soft" | "accent" | "face" | "ink" = "face",
): Decal => ({
  t: "line",
  pts: [
    [x, y],
    [x + s * 0.36, y + s * 0.4],
    [x + s, y - s * 0.42],
  ],
  stroke,
  width: 1.35,
});

const textLines = (
  x: number,
  y: number,
  w: number,
  widths: number[],
  gap = 0.22,
  h = 0.08,
  fill: "soft" | "face" | "detail" | "ink" | "accent" = "soft",
): Decal[] =>
  widths.map((k, i) => ({
    t: "bar",
    x,
    y: y + i * gap,
    w: w * k,
    h,
    fill,
  }));

const slots = (
  x: number,
  y: number,
  n: number,
  step: number,
  len: number,
  dir: "h" | "v" = "v",
  stroke: true | "soft" = "soft",
): Decal => {
  const segs: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (dir === "v") segs.push([x + i * step, y, x + i * step, y + len]);
    else segs.push([x, y + i * step, x + len, y + i * step]);
  }
  return { t: "segs", segs, stroke };
};

// Desk slab dimensions
const DESK = { x: -4.2, y: 0, z: -2.65, w: 8.4, h: 0.28, d: 5.3 };
const DY = DESK.y + DESK.h;

// 1. Back-left: Instructor Queue Monitor
const MON = { x: -3.85, y: DY + 0.34, z: -2.2, w: 3.15, h: 2.28, d: 0.22 };
const monitorScreen: Decal[] = [
  // Dark display bezel
  {
    t: "rect",
    x: 0.14,
    y: 0.14,
    w: MON.w - 0.28,
    h: MON.h - 0.28,
    r: 0.08,
    fill: "ink",
  },
  // Top window status strip
  { t: "circle", cx: 0.32, cy: 0.31, r: 0.05, fill: "accent" },
  { t: "bar", x: 0.46, y: 0.27, w: 0.88, h: 0.07, fill: "face" },
  { t: "bar", x: MON.w - 0.8, y: 0.27, w: 0.5, h: 0.07, fill: "soft" },
  { t: "segs", segs: [[0.24, 0.46, MON.w - 0.24, 0.46]], stroke: "soft" },
  // Left "Now Serving" hero ticket tile inside the screen
  { t: "rect", x: 0.26, y: 0.58, w: 1.2, h: 1.4, r: 0.07, fill: "face" },
  { t: "rect", x: 0.38, y: 0.7, w: 0.96, h: 0.24, r: 0.05, fill: "accent" },
  { t: "bar", x: 0.5, y: 0.78, w: 0.72, h: 0.08, fill: "face" },
  { t: "bar", x: 0.42, y: 1.1, w: 0.84, h: 0.18, fill: "ink" },
  { t: "bar", x: 0.42, y: 1.4, w: 0.62, h: 0.08, fill: "soft" },
  { t: "circle", cx: 0.5, cy: 1.73, r: 0.07, fill: "accent" },
  { t: "bar", x: 0.64, y: 1.69, w: 0.54, h: 0.07, fill: "ink" },
  // Right department queue rows (3 rows)
  ...[0, 1, 2].flatMap((r): Decal[] => {
    const ry = 0.58 + r * 0.48;
    const active = r === 0;
    return [
      {
        t: "rect",
        x: 1.58,
        y: ry,
        w: 1.3,
        h: 0.38,
        r: 0.06,
        fill: active ? "detail" : "ink",
        stroke: "soft",
      },
      {
        t: "circle",
        cx: 1.76,
        cy: ry + 0.19,
        r: 0.065,
        fill: active ? "accent" : "face",
      },
      {
        t: "bar",
        x: 1.9,
        y: ry + 0.11,
        w: [0.6, 0.48, 0.54][r]!,
        h: 0.07,
        fill: "face",
      },
      {
        t: "bar",
        x: 1.9,
        y: ry + 0.23,
        w: [0.38, 0.3, 0.34][r]!,
        h: 0.05,
        fill: "soft",
      },
      {
        t: "bar",
        x: 2.58,
        y: ry + 0.14,
        w: 0.18,
        h: 0.09,
        fill: active ? "accent" : "face",
      },
    ];
  }),
];

// 2. Center: SBO Clearance Clipboard & 6-Step Checklist Sheet
const BOARD = { x: -1.45, y: DY, z: -1.1, w: 3.3, h: 0.12, d: 3.35 };
const SHEET = {
  x: BOARD.x + 0.2,
  y: DY + BOARD.h,
  z: BOARD.z + 0.34,
  w: BOARD.w - 0.4,
  h: 0.05,
  d: BOARD.d - 0.52,
};

const sheetDecals: Decal[] = [
  // Header block: BukSU COT-SBO clearance header + status pill
  { t: "bar", x: 0.24, y: 0.2, w: 1.32, h: 0.12, fill: "ink" },
  { t: "bar", x: 0.24, y: 0.39, w: 0.84, h: 0.065, fill: "soft" },
  {
    t: "rect",
    x: SHEET.w - 0.94,
    y: 0.18,
    w: 0.7,
    h: 0.26,
    r: 0.13,
    fill: "accent",
    stroke: true,
  },
  { t: "bar", x: SHEET.w - 0.8, y: 0.27, w: 0.42, h: 0.07, fill: "face" },
  { t: "segs", segs: [[0.22, 0.56, SHEET.w - 0.22, 0.56]], stroke: "soft" },
  // 5 pre-enrollment steps ticked + status badges on right
  ...[0, 1, 2, 3, 4].flatMap((i): Decal[] => {
    const ry = 0.68 + i * 0.32;
    const widths = [1.28, 1.02, 1.18, 0.92, 1.12];
    const tags = [0.34, 0.28, 0.32, 0.28, 0.3];
    return [
      {
        t: "rect",
        x: 0.24,
        y: ry,
        w: 0.24,
        h: 0.24,
        r: 0.05,
        fill: "face",
        stroke: true,
      },
      topCheck(0.295, ry + 0.08, 0.13, "ink"),
      {
        t: "bar",
        x: 0.6,
        y: ry + 0.04,
        w: widths[i]!,
        h: 0.075,
        fill: "ink",
      },
      {
        t: "bar",
        x: 0.6,
        y: ry + 0.15,
        w: widths[i]! * 0.56,
        h: 0.05,
        fill: "soft",
      },
      {
        t: "rect",
        x: SHEET.w - 0.7,
        y: ry + 0.03,
        w: 0.46,
        h: 0.18,
        r: 0.09,
        fill: "detail",
        stroke: "soft",
      },
      {
        t: "bar",
        x: SHEET.w - 0.6,
        y: ry + 0.09,
        w: tags[i]!,
        h: 0.055,
        fill: "face",
      },
    ];
  }),
  // 6th row: Final Enrollment Stamp Seal Box on the right + signature lines on the left
  { t: "segs", segs: [[0.22, 2.32, SHEET.w - 0.22, 2.32]], stroke: "soft" },
  { t: "bar", x: 0.24, y: 2.45, w: 0.86, h: 0.075, fill: "ink" },
  { t: "bar", x: 0.24, y: 2.59, w: 0.58, h: 0.055, fill: "soft" },
  {
    t: "rect",
    x: SHEET.w - 1.38,
    y: 2.38,
    w: 1.14,
    h: 0.36,
    r: 0.07,
    fill: "face",
    stroke: "accent",
  },
  {
    t: "bar",
    x: SHEET.w - 1.14,
    y: 2.52,
    w: 0.66,
    h: 0.075,
    fill: "accent",
  },
];

// Officer's Rubber Stamp (Accent) hovering directly above the 6th-step seal box
const STAMP = {
  cx: SHEET.x + SHEET.w - 0.72,
  y: SHEET.y + SHEET.h + 0.36,
  cz: SHEET.z + 2.54,
};

// 3. Back-right: Requirement Folders & Verified Document Organizer (spaced cleanly from clipboard)
const TRAY = { x: 2.05, y: DY, z: -2.15, w: 1.85, h: 1.25, d: 1.32 };

// 4. Front-left: Queue Ticket Dispenser & Emerging Slip
const KIOSK = { x: -3.65, y: DY, z: 0.55, w: 1.45, h: 1.45, d: 1.35 };

// 5. Front-right: Student ID Card Stack
const ID_CARD = { x: 2.18, y: DY, z: 0.68, w: 1.65, h: 0.07, d: 1.1 };
const topIdDecals: Decal[] = [
  // Header band on ID card
  {
    t: "rect",
    x: 0.1,
    y: 0.1,
    w: ID_CARD.w - 0.2,
    h: 0.18,
    r: 0.04,
    fill: "ink",
  },
  { t: "circle", cx: 0.22, cy: 0.19, r: 0.045, fill: "accent" },
  { t: "bar", x: 0.32, y: 0.16, w: 0.55, h: 0.055, fill: "face" },
  // Lanyard slot
  {
    t: "rect",
    x: ID_CARD.w / 2 - 0.16,
    y: 0.03,
    w: 0.32,
    h: 0.04,
    r: 0.02,
    fill: "detail",
  },
  // Student photo frame on left
  {
    t: "rect",
    x: 0.14,
    y: 0.36,
    w: 0.46,
    h: 0.54,
    r: 0.06,
    fill: "detail",
    stroke: true,
  },
  { t: "circle", cx: 0.37, cy: 0.54, r: 0.1, fill: "face" },
  {
    t: "line",
    pts: [
      [0.22, 0.84],
      [0.28, 0.7],
      [0.46, 0.7],
      [0.52, 0.84],
    ],
    stroke: "face",
    closed: true,
    fill: "face",
  },
  // Student name, number & year level bars on right
  { t: "bar", x: 0.7, y: 0.39, w: 0.76, h: 0.08, fill: "ink" },
  { t: "bar", x: 0.7, y: 0.53, w: 0.54, h: 0.06, fill: "soft" },
  { t: "rect", x: 0.7, y: 0.66, w: 0.46, h: 0.16, r: 0.08, fill: "accent" },
  { t: "bar", x: 0.78, y: 0.71, w: 0.3, h: 0.055, fill: "face" },
  // Barcode ticks at bottom right
  slots(0.7, 0.88, 10, 0.075, 0.1, "v", true),
];

export const clearanceDeskModel: Drawing = {
  id: "clearance-desk",
  name: "Enrollment clearance desk",
  category: "interface",
  tags: [
    "auth",
    "login",
    "clearance",
    "enrollment",
    "checklist",
    "stamp",
    "queue",
    "student",
    "university",
  ],
  kind: "scene",
  prompt:
    "/isometric redesign the auth isometric for the ERPSYS enrollment clearance desk",
  description:
    "An enrollment clearance desk: a live queue monitor and ticket dispenser on the left, a six-step requirements clipboard at the centre with an officer's gold rubber stamp poised over the verification seal, requirement folders in an organizer tray at the back right, and a stack of student ID cards in the foreground.",
  createdAt: "2026-11-13",
  parts: [
    // Desk platform
    {
      id: "desk",
      role: "face",
      shape: {
        kind: "box",
        at: [DESK.x, DESK.y, DESK.z],
        size: [DESK.w, DESK.h, DESK.d],
        r: 0.28,
      },
      decals: {
        top: [
          {
            t: "rect",
            x: 0.22,
            y: 0.22,
            w: DESK.w - 0.44,
            h: DESK.d - 0.44,
            r: 0.2,
            stroke: "soft",
          },
          slots(0.55, DESK.d - 0.38, 14, 0.2, 0.1, "v"),
        ],
        front: [
          {
            t: "segs",
            segs: [[0.4, DESK.h * 0.5, DESK.w - 0.4, DESK.h * 0.5]],
            stroke: "soft",
          },
        ],
      },
    },

    // Queue Monitor Stand & Screen (back-left)
    {
      id: "monitor-foot",
      role: "detail",
      shape: {
        kind: "box",
        at: [MON.x + MON.w / 2 - 0.65, DY, MON.z - 0.18],
        size: [1.3, 0.1, 0.85],
        r: 0.12,
      },
    },
    {
      id: "monitor-neck",
      role: "detail",
      shape: {
        kind: "box",
        at: [MON.x + MON.w / 2 - 0.18, DY + 0.1, MON.z - 0.02],
        size: [0.36, 0.24, 0.2],
      },
    },
    {
      id: "monitor",
      role: "body",
      shape: {
        kind: "box",
        at: [MON.x, MON.y, MON.z],
        size: [MON.w, MON.h, MON.d],
        r: 0.14,
        axis: "z",
      },
      decals: {
        front: monitorScreen,
        top: [slots(0.5, 0.06, 11, 0.2, 0.1, "v")],
      },
    },

    // Queue Ticket Dispenser & Emerging Ticket (front-left)
    {
      id: "kiosk",
      role: "body",
      shape: {
        kind: "box",
        at: [KIOSK.x, KIOSK.y, KIOSK.z],
        size: [KIOSK.w, KIOSK.h, KIOSK.d],
        r: 0.14,
      },
      decals: {
        top: [
          {
            t: "circle",
            cx: KIOSK.w / 2,
            cy: KIOSK.d / 2,
            r: 0.34,
            fill: "detail",
            stroke: "soft",
          },
          {
            t: "circle",
            cx: KIOSK.w / 2,
            cy: KIOSK.d / 2,
            r: 0.14,
            fill: "accent",
          },
        ],
        front: [
          // Ticket display window
          {
            t: "rect",
            x: 0.2,
            y: 0.22,
            w: KIOSK.w - 0.4,
            h: 0.52,
            r: 0.06,
            fill: "ink",
          },
          { t: "circle", cx: 0.36, cy: 0.38, r: 0.05, fill: "accent" },
          { t: "bar", x: 0.48, y: 0.34, w: 0.56, h: 0.07, fill: "face" },
          { t: "bar", x: 0.32, y: 0.52, w: 0.78, h: 0.09, fill: "soft" },
          // Dispenser mouth slot
          {
            t: "rect",
            x: 0.22,
            y: 0.92,
            w: KIOSK.w - 0.44,
            h: 0.14,
            r: 0.04,
            fill: "ink",
          },
          slots(0.28, 1.2, 5, 0.22, 0.12, "v"),
        ],
      },
    },
    {
      id: "ticket",
      role: "face",
      group: "ticket",
      shape: {
        kind: "box",
        at: [KIOSK.x + 0.3, KIOSK.y + 0.36, KIOSK.z + KIOSK.d],
        size: [KIOSK.w - 0.6, 0.04, 0.72],
        r: 0.04,
      },
      decals: {
        top: [
          {
            t: "segs",
            segs: [
              [0.08, 0.12, 0.22, 0.12],
              [0.3, 0.12, 0.44, 0.12],
              [0.52, 0.12, 0.66, 0.12],
            ],
            stroke: "soft",
          },
          {
            t: "rect",
            x: 0.14,
            y: 0.22,
            w: 0.56,
            h: 0.22,
            r: 0.04,
            fill: "accent",
          },
          { t: "bar", x: 0.22, y: 0.29, w: 0.4, h: 0.07, fill: "face" },
          { t: "bar", x: 0.14, y: 0.52, w: 0.56, h: 0.06, fill: "ink" },
        ],
      },
    },

    // Center Clipboard, Clip & 6-Step Clearance Sheet
    {
      id: "clipboard",
      role: "detail",
      shape: {
        kind: "box",
        at: [BOARD.x, BOARD.y, BOARD.z],
        size: [BOARD.w, BOARD.h, BOARD.d],
        r: 0.18,
      },
    },
    {
      id: "clip-base",
      role: "ink",
      shape: {
        kind: "box",
        at: [BOARD.x + BOARD.w / 2 - 0.62, BOARD.y + BOARD.h, BOARD.z + 0.06],
        size: [1.24, 0.14, 0.32],
        r: 0.06,
      },
      decals: {
        top: [
          {
            t: "rect",
            x: 0.32,
            y: 0.08,
            w: 0.6,
            h: 0.14,
            r: 0.04,
            fill: "detail",
          },
        ],
      },
    },
    {
      id: "sheet",
      role: "body",
      shape: {
        kind: "box",
        at: [SHEET.x, SHEET.y, SHEET.z],
        size: [SHEET.w, SHEET.h, SHEET.d],
        r: 0.08,
      },
      decals: {
        top: sheetDecals,
      },
    },

    // Officer's Gold Rubber Stamp (Accent) hovering over the seal box
    {
      id: "stamp-pad",
      role: "ink",
      group: "stamp",
      shape: {
        kind: "box",
        at: [STAMP.cx - 0.46, STAMP.y, STAMP.cz - 0.3],
        size: [0.92, 0.06, 0.6],
        r: 0.06,
      },
    },
    {
      id: "stamp-body",
      role: "accent",
      group: "stamp",
      shape: {
        kind: "box",
        at: [STAMP.cx - 0.5, STAMP.y + 0.06, STAMP.cz - 0.34],
        size: [1.0, 0.2, 0.68],
        r: 0.1,
      },
      decals: {
        top: [
          {
            t: "rect",
            x: 0.14,
            y: 0.12,
            w: 0.72,
            h: 0.44,
            r: 0.06,
            stroke: "soft",
          },
        ],
      },
    },
    {
      id: "stamp-collar",
      role: "detail",
      group: "stamp",
      shape: {
        kind: "cyl",
        at: [STAMP.cx, STAMP.y + 0.26, STAMP.cz],
        r: 0.22,
        h: 0.12,
        n: 28,
      },
    },
    {
      id: "stamp-stem",
      role: "detail",
      group: "stamp",
      shape: {
        kind: "cyl",
        at: [STAMP.cx, STAMP.y + 0.38, STAMP.cz],
        r: 0.14,
        h: 0.42,
        r2: 0.18,
        n: 28,
      },
    },
    {
      id: "stamp-knob",
      role: "accent",
      group: "stamp",
      shape: {
        kind: "sphere",
        at: [STAMP.cx, STAMP.y + 0.98, STAMP.cz],
        r: 0.3,
      },
    },

    // Back-right: Submission Tray with Upright Requirement Folders
    {
      id: "tray-floor",
      role: "detail",
      shape: {
        kind: "box",
        at: [TRAY.x, TRAY.y, TRAY.z],
        size: [TRAY.w, 0.1, TRAY.d],
        r: 0.08,
      },
    },
    {
      id: "tray-back",
      role: "detail",
      shape: {
        kind: "box",
        at: [TRAY.x, TRAY.y + 0.1, TRAY.z],
        size: [TRAY.w, TRAY.h, 0.1],
        r: 0.04,
        axis: "z",
      },
    },
    {
      id: "tray-left",
      role: "detail",
      shape: {
        kind: "box",
        at: [TRAY.x, TRAY.y + 0.1, TRAY.z + 0.1],
        size: [0.1, TRAY.h * 0.72, TRAY.d - 0.1],
      },
    },
    {
      id: "tray-right",
      role: "detail",
      shape: {
        kind: "box",
        at: [TRAY.x + TRAY.w - 0.1, TRAY.y + 0.1, TRAY.z + 0.1],
        size: [0.1, TRAY.h * 0.72, TRAY.d - 0.1],
      },
      decals: {
        right: [slots(0.2, 0.2, 4, 0.22, 0.5, "v")],
      },
    },
    {
      id: "folder-back",
      role: "face",
      shape: {
        kind: "box",
        at: [TRAY.x + 0.2, TRAY.y + 0.1, TRAY.z + 0.24],
        size: [TRAY.w - 0.4, 1.48, 0.08],
        r: 0.05,
        axis: "z",
      },
      decals: {
        front: [
          { t: "bar", x: 0.18, y: 0.18, w: 0.55, h: 0.07, fill: "detail" },
        ],
      },
    },
    {
      id: "folder-mid",
      role: "accent",
      shape: {
        kind: "box",
        at: [TRAY.x + 0.24, TRAY.y + 0.1, TRAY.z + 0.52],
        size: [TRAY.w - 0.48, 1.32, 0.08],
        r: 0.05,
        axis: "z",
      },
      decals: {
        front: [{ t: "bar", x: 0.16, y: 0.16, w: 0.65, h: 0.07, fill: "face" }],
      },
    },
    {
      id: "folder-front",
      role: "body",
      shape: {
        kind: "box",
        at: [TRAY.x + 0.2, TRAY.y + 0.1, TRAY.z + 0.8],
        size: [TRAY.w - 0.4, 1.18, 0.09],
        r: 0.05,
        axis: "z",
      },
      decals: {
        front: [
          { t: "circle", cx: 0.28, cy: 0.26, r: 0.1, fill: "accent" },
          frontCheck(0.22, 0.27, 0.11, "face"),
          { t: "bar", x: 0.46, y: 0.2, w: 0.72, h: 0.08, fill: "ink" },
          ...textLines(
            0.2,
            0.46,
            1.05,
            [1, 0.78, 0.88, 0.6],
            0.16,
            0.055,
            "soft",
          ),
        ],
      },
    },
    {
      id: "tray-front-lip",
      role: "detail",
      shape: {
        kind: "box",
        at: [TRAY.x + 0.1, TRAY.y + 0.1, TRAY.z + TRAY.d - 0.1],
        size: [TRAY.w - 0.2, 0.34, 0.1],
      },
      decals: {
        front: [
          {
            t: "rect",
            x: (TRAY.w - 0.2) / 2 - 0.32,
            y: 0.1,
            w: 0.64,
            h: 0.14,
            r: 0.04,
            fill: "face",
            stroke: "soft",
          },
        ],
      },
    },

    // Front-right: Stack of 3 Student ID Cards
    ...(
      [
        [0, 0, "detail"],
        [-0.05, 0.07, "detail"],
        [-0.1, 0.14, "body"],
      ] as [number, number, Part["role"]][]
    ).map(
      ([off, dy, role], idx): Part => ({
        id: `id-card-${idx}`,
        role,
        shape: {
          kind: "box",
          at: [ID_CARD.x + off, ID_CARD.y + dy, ID_CARD.z - off * 0.8],
          size: [ID_CARD.w, ID_CARD.h, ID_CARD.d],
          r: 0.1,
        },
        decals: idx === 2 ? { top: topIdDecals } : undefined,
      }),
    ),

    // Signing Pen resting beside the clipboard on the right
    {
      id: "pen-body",
      role: "ink",
      shape: {
        kind: "cyl",
        at: [2.22, DY + 0.075, -0.42],
        r: 0.075,
        h: 0.75,
        axis: "z",
        n: 16,
      },
    },
    {
      id: "pen-band",
      role: "accent",
      shape: {
        kind: "cyl",
        at: [2.22, DY + 0.075, 0.33],
        r: 0.078,
        h: 0.1,
        axis: "z",
        n: 16,
      },
    },
    {
      id: "pen-tip",
      role: "detail",
      shape: {
        kind: "cyl",
        at: [2.22, DY + 0.075, 0.43],
        r: 0.075,
        r2: 0.015,
        h: 0.18,
        axis: "z",
        n: 16,
      },
    },
  ],
  motion: {
    duration: 2.4,
    label:
      "the officer's stamp presses the clearance seal while a queue ticket feeds out",
    tracks: [
      {
        group: "stamp",
        t: [0, -0.35, 0],
        from: 0.08,
        to: 0.55,
        ease: "back",
      },
      {
        group: "ticket",
        t: [0, 0, 0.28],
        from: 0.15,
        to: 0.8,
        ease: "inOut",
      },
    ],
  },
};

export default clearanceDeskModel;
