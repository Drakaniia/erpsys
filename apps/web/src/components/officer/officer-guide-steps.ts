export const STEPS = [
  {
    title: "Overview and step tabs",
    body: "Overview answers 'what's waiting' — five step cards with unverified counts and a recent-activity strip. Below it, the pill tab bar is your workbench: Assessment, Social Media, Profiling, Mugshot, Consent. The badge on each tab is the unverified count — it spring-scales when new submissions arrive.",
  },
  {
    title: "Submission lists — table or cards",
    body: "Each step tab is the same list in two views. Table is dense and keyboard-friendly; Cards are airier. Students appear here only after they finish that step's requirements — oldest first by default. Search, filter, and sort are in the header; view choice lives in ?view= so it survives reload.",
  },
  {
    title: "Detail sheet — review the evidence",
    body: "Click or press Enter on a row to open the right-side sheet. It stays anchored to the row you opened. The evidence section shows every upload for that step — click a thumbnail to open the lightbox (full-size, zoom 1–4×, pan, arrow through images). Assessment (step 1) shows the requirements checklist instead: check SIMS balance before stamping.",
  },
  {
    title: "Stamp as verified — then revoke if needed",
    body: "Inside the sheet, Stamp as verified is the primary. It opens a confirm with your stamp preview — name, graphic, signature, date over a VERIFIED backdrop. Confirming fires verifyStep; the row flips to Verified and the stamp scales/rotates in with momentum (bounce is earned). On verified items the action becomes Revoke stamp (destructive, red-tinted text button + confirm).",
  },
  {
    title: "Send back — and the two form tabs",
    body: "If evidence is wrong, Send back opens an inline composer: multi-select chip buttons per step (e.g. Wrong screenshot, Screenshot unclear) plus an optional note. Sending flips the student's step to Returned and records respondedById/At + chips. The two extra tabs are Profiling Form and Social Media Links. Profiling Form is a built-in form builder (short answer, paragraph, radio, checkbox, dropdown, date) per academic year; students fill it in the app and you read their answers in the review sheet.",
  },
  {
    title: "Bell, shortcuts & mugshot capture",
    body: "The bell (right of the tab bar, next to refresh) is the cross-step signal — red badge = unverified submissions across steps. Click → popover anchored to the bell, newest first, Review jumps to that step + sheet. Mugshot (step 4) capture lives inside the detail sheet: Capture → preview → Retake or Save & stamp (one logical action). Camera unavailable falls back to 'use student upload instead' and keeps stamping available.",
  },
] as const;

export type GuideStep = (typeof STEPS)[number];
