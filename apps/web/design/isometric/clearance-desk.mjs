// Editable model for the sign-in illustration. Regenerate the component with:
//   node apps/web/design/isometric/clearance-desk.mjs
// ISOMETRIC_KIT overrides the kit location (the /isometric skill's kit/dist/index.js).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const kitPath =
  process.env.ISOMETRIC_KIT ??
  resolve(homedir(), ".agents/skills/isometric/kit/dist/index.js");
const { defineDrawing, box, cbox, cyl, ball, textLines, render, toSvg, toTsx } =
  await import(pathToFileURL(kitPath).href);

const DESK_TOP = 0.25;

const BOARD = { x: -2.8, z: -1.7, w: 3.2, d: 4.0, h: 0.12 };
const BOARD_TOP = DESK_TOP + BOARD.h;
const PAPER = { x: -2.6, z: -1.2, w: 2.8, d: 3.3, h: 0.04 };
const PAPER_TOP = BOARD_TOP + PAPER.h;

const ROWS = [0.95, 1.55, 2.15, 2.75];
const ROW_WIDTHS = [1.3, 1.0, 1.45, 1.15];

const checklist = [
  { t: "bar", x: 0.3, y: 0.35, w: 1.3, h: 0.14, fill: "ink" },
  { t: "bar", x: 0.3, y: 0.58, w: 0.8, h: 0.08 },
  ...ROWS.flatMap((y, i) => {
    const marks = [
      { t: "rect", x: 0.3, y: y - 0.15, w: 0.3, h: 0.3, r: 0.06, fill: "face", stroke: true },
      { t: "bar", x: 0.78, y: y - 0.05, w: ROW_WIDTHS[i], h: 0.1 },
    ];
    if (i < 3) {
      marks.push({
        t: "line",
        pts: [
          [0.37, y],
          [0.44, y + 0.07],
          [0.55, y - 0.08],
        ],
        stroke: true,
      });
    }
    return marks;
  }),
];

const STAMP_X = PAPER.x + 2.35;
const STAMP_Z = PAPER.z + ROWS[3];
const STAMP_LIFT = 0.6;
const STAMP_Y = PAPER_TOP + STAMP_LIFT;

const DISPENSER = { x: 1.0, z: -2.0, w: 1.6, h: 2.6, d: 1.2 };
const dispenserFront = [
  { t: "rect", x: 0.25, y: 0.3, w: 1.1, h: 0.62, r: 0.08, fill: "ink" },
  { t: "bar", x: 0.42, y: 0.52, w: 0.42, h: 0.1, fill: "face" },
  { t: "bar", x: 0.42, y: 0.7, w: 0.7, h: 0.07, fill: "soft" },
  { t: "circle", cx: 0.8, cy: 1.3, r: 0.16, fill: "detail", stroke: true },
  { t: "rect", x: 0.3, y: 1.72, w: 1.0, h: 0.09, r: 0.04, fill: "ink" },
];
const SLOT_Y = DESK_TOP + DISPENSER.h - 1.81;

const TICKET = { x: 1.4, w: 0.8, h: 0.62 };
const ticketFront = [
  {
    t: "segs",
    segs: [0, 1, 2, 3, 4, 5].map((i) => [0.08 + i * 0.12, 0.06, 0.14 + i * 0.12, 0.06]),
    stroke: "soft",
  },
  { t: "bar", x: 0.14, y: 0.2, w: 0.36, h: 0.14, fill: "ink" },
  { t: "bar", x: 0.14, y: 0.44, w: 0.52, h: 0.06 },
];

const CARD = { w: 1.5, d: 1.0, h: 0.05 };
const cardTop = [
  { t: "circle", cx: 0.32, cy: 0.42, r: 0.2, fill: "detail", stroke: true },
  ...textLines(0.64, 0.3, 0.7, [1, 0.6], 0.2, 0.08),
  { t: "bar", x: 0.14, y: 0.8, w: 1.2, h: 0.06, fill: "soft" },
];
const cards = [0, 1, 2].map((i) =>
  box(
    [0.95 + i * 0.12, DESK_TOP + i * CARD.h, 0.55 + i * 0.16],
    [CARD.w, CARD.h, CARD.d],
    {
      id: `card-${i}`,
      r: 0.1,
      role: i === 2 ? "face" : "detail",
      decals: i === 2 ? { top: cardTop } : undefined,
    },
  ),
);

export const model = defineDrawing({
  id: "clearance-desk",
  name: "Enrollment clearance desk",
  category: "interface",
  kind: "scene",
  tags: ["enrollment", "requirements", "checklist", "stamp", "queue", "login"],
  createdAt: "2026-11-08",
  prompt: "/isometric an enrollment clearance desk for the ERPSYS sign-in page",
  description:
    "A requirements checklist on a clipboard with three rows ticked, a gold rubber stamp over the last row, a queue-ticket dispenser and a stack of ID cards.",
  parts: [
    box([-3.1, 0, -2.3], [6.0, DESK_TOP, 4.8], { id: "desk", r: 0.16, role: "face" }),
    box([BOARD.x, DESK_TOP, BOARD.z], [BOARD.w, BOARD.h, BOARD.d], {
      id: "board",
      r: 0.14,
      role: "detail",
    }),
    box([-1.7, BOARD_TOP, -1.65], [1.0, 0.18, 0.45], { id: "clip", r: 0.06, role: "ink" }),
    box([PAPER.x, BOARD_TOP, PAPER.z], [PAPER.w, PAPER.h, PAPER.d], {
      id: "paper",
      r: 0.04,
      role: "face",
      decals: { top: checklist },
    }),
    cbox(STAMP_X, STAMP_Y, STAMP_Z, [0.66, 0.16, 0.66], {
      id: "stamp-pad",
      r: 0.08,
      role: "accent",
      group: "stamp",
    }),
    cyl([STAMP_X, STAMP_Y + 0.16, STAMP_Z], 0.12, 0.42, {
      id: "stamp-neck",
      role: "detail",
      group: "stamp",
    }),
    ball([STAMP_X, STAMP_Y + 0.16 + 0.42 + 0.22, STAMP_Z], 0.24, {
      id: "stamp-knob",
      role: "accent",
      group: "stamp",
    }),
    box([DISPENSER.x, DESK_TOP, DISPENSER.z], [DISPENSER.w, DISPENSER.h, DISPENSER.d], {
      id: "dispenser",
      r: 0.14,
      role: "body",
      decals: { front: dispenserFront },
    }),
    box(
      [TICKET.x, SLOT_Y - TICKET.h, DISPENSER.z + DISPENSER.d],
      [TICKET.w, TICKET.h, 0.03],
      { id: "ticket", r: 0.03, axis: "z", role: "face", decals: { front: ticketFront } },
    ),
    ...cards,
  ],
  motion: {
    duration: 2.6,
    label: "the stamp clears the last requirement",
    tracks: [
      { group: "stamp", t: [0, -STAMP_LIFT, 0], from: 0.35, to: 1, ease: "in" },
    ],
  },
});

export const options = {
  style: "two-tone",
  theme: "light",
  weight: 1,
  tokens: { ink: "#0b2340", face: "#fdfcf9", accent: "#f5a623", bg: "#051d37" },
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  for (const phase of [undefined, 0.25, 0.5, 0.75, 0.99]) {
    const { audit } = render(model, { ...options, phase });
    if (audit.cycles) throw new Error(`Depth cycles at phase ${phase}: ${audit.cycles}`);
  }
  const preview = resolve(here, "out");
  mkdirSync(preview, { recursive: true });
  writeFileSync(resolve(preview, "clearance-desk.svg"), toSvg(model, options));
  writeFileSync(
    resolve(preview, "clearance-desk-pressed.svg"),
    toSvg(model, { ...options, phase: 0.5 }),
  );
  // The component ships the still only: every motion frame is a full copy of
  // the picture, and 12 of them weigh ~480 KB on the signed-out entry path.
  const still = { ...model, motion: undefined };
  const tsx = toTsx(still, options).replace(/^"use client";\r?\n/m, "");
  writeFileSync(
    resolve(here, "../../src/components/auth/ClearanceDeskIllustration.tsx"),
    tsx,
  );
  console.log("clearance-desk: 0 depth cycles; component written");
}
