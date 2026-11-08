# FINAL_PAPER — checklist

Checklist for everything [`FINAL_PAPER.md`](FINAL_PAPER.md) still needs. Figure numbers match the
placeholders in that file; do not renumber here without renumbering there.

**Capture rules** (apply to every screenshot):

- Use one demo dataset (a student at each step status, two departments, one officer, one adviser,
  one admin) — never real student data.
- If a real name, email, student number, or photo appears, blur or replace it before pasting.
- Fixed desktop viewport **1440×900**; student screens also at **390×844** (phone).
- Light theme only, zoom 100 %, browser chrome cropped, cursor out of frame.
- PNG, ≤ 300 KB per figure, named `<chapter>-<figure>-<slug>.png` (e.g. `3-6-user-flow.png`).
- Store originals outside the repo; only the sized figures belong with the paper.

---

## 1. Text placeholders (block the paper, not images)

- [x] Title page: project title, developers' names, 1st Semester AY 2026–2027
- [ ] Title page: panel members and adviser
- [ ] Table of contents, list of figures, list of tables (generated at layout)
- [x] §1.1 official organization name
- [ ] §1.1 SBO office location, interview date + interviewee
- [x] §1.1.1 history — the manual printed-card/stamping process, written from the interview notes
- [ ] §1.1.1 founding year and mandate
- [x] §1.1.3 student headcount (~1,400–1,500)
- [ ] §1.1.3 department and adviser counts
- [x] §2.1.1 TVA finalized on a 1–5 scale, with server and integration rows
- [ ] §2.1.1 adviser sign-off on the ratings
- [x] §2.2.1 all 58 requirements pasted, one table per role
- [x] §2.2.2 NFR targets set: 300 normal / 1,000 peak, 99% enrollment-week availability, RTO 1 h / RPO 24 h
- [x] §3.4 project phase dates — working plan in Table 3.1 and Figure 3.8
- [ ] §3.4 confirm the phase dates against the sprint board
- [ ] §4.2.1 university policy issuance numbers
- [ ] §4.3.1 profiling output (ports, TLS grade, headers, scan)
- [ ] §4.3.2 real CVSS findings (replace placeholder rows)
- [ ] §4.5.2 last restore-drill date (RTO 1 h / RPO 24 h are already stated)
- [ ] References: verify every URL and add any interview citation (APA 7th, alphabetical)
- [ ] Table 5 Summary of Achievements — real dates
- [ ] Table 6 Members' Contributions and Roles — names, roles, contributions

---

## 2. Chapter 1 figures

- [ ] **Figure 1.1** SBO organizational chart — `1-1-org-chart.png` (draw, then export)
- [ ] **Figure 1.2** SBO functional chart — `1-2-functional-chart.png`

## 3. Chapter 2 tables and figures

- [x] **Table 2.1** TVA worksheet — 10 rows, ratings kept, server + integrations added
- [x] **Tables 2.5–2.8** functional requirements — one table per role, 58 rows
- [ ] **Table 2.9** collections — check every collection name against `lib/db/db.ts`
- [ ] **Figure 2.1** requirements traceability matrix — `2-1-traceability.png`
- [ ] **Figure 2.2** identity/account collections — `2-2-identity-schema.png`
- [ ] **Figure 2.3** steps and evidence collections — `2-3-steps-schema.png`
- [ ] **Figure 2.4** queue collections — `2-4-queue-schema.png`
- [ ] **Figure 2.5** enrollment collections — `2-5-enrollment-schema.png`
- [ ] **Figure 2.6** configuration collections — `2-6-config-schema.png`

## 4. Chapter 3 diagrams

- [x] **Figure 3.1** Activity — student submits evidence (Mermaid in the paper)
- [x] **Figure 3.2** Activity — officer verifies / returns / revokes (Mermaid)
- [x] **Figure 3.3** Activity — student joins the queue (Mermaid)
- [x] **Figure 3.4** Activity — adviser serves and completes (Mermaid)
- [x] **Figure 3.5** Activity — admin activates an academic year (Mermaid)
- [x] **Figure 3.6** User flow, sign-in → landing surface (Mermaid)
- [x] **Figure 3.7** Use-case diagram (Mermaid)
- [x] **Figure 3.8** Gantt chart (Mermaid)
- [x] **Figure 3.9** Deployment / data-flow diagram (Mermaid)
- [x] Figures 3.1–3.9 exported to PNG in `diagrams/` (`3-1-activity-submit.png` … `3-9-deployment.png`)
- [ ] Re-render a figure whenever its Mermaid block changes, then re-check the export at page size
- [ ] Optional: redraw Figures 3.1–3.9 in the department's required diagramming tool if the panel asks for UML-styled output

## 5. Chapter 4 figures

- [ ] **Table 4.1** CVSS findings — replace placeholders with the real assessment
- [ ] **Figure 4.1** Physical deployment diagram — `4-1-physical.png`
- [ ] Network capture / scan evidence (ports, TLS, headers) — `4-2-scan.png`

## 6. API documentation figures

The reference uses **4–6 figures per endpoint** (valid request, invalid request, one per status code).
Every entry in the paper already carries its captions, numbered **1–380** through the part; what is
missing is the picture above each caption. For ERPSYS capture, per endpoint, at minimum:

- [ ] Valid request in the client / HTTP client
- [ ] Invalid or unauthorized request (`400`/`401`/`403`)
- [ ] Success response body
- [ ] Not-found (`404`) where the endpoint takes an id
- [ ] Server error (`500`) only for one representative endpoint per module

Modules to cover, in this order:

- [ ] **1.1 Student** — 22 entries, Figures 1–73
- [ ] **1.2 SBO officer** — 19 entries, Figures 74–135
- [ ] **1.3 Enrollment officer** — 30 entries, Figures 136–235
- [ ] **1.4 Admin** — 29 entries, Figures 236–332
- [ ] **1.5 Authentication** — 6 entries, Figures 333–350
- [ ] **1.6 Storage & files** — 4 entries, Figures 351–366
- [ ] **1.7 System & operations** — 7 entries, Figures 367–380

> Tip: capture the request/response pairs for one module at a time and work down the captions in
> order — each one names the code its capture must show, and the numbering is already fixed, so a
> missing figure is caught by the number it skips.

## 7. Sample code figures

- [ ] Authentication & shell (client, route, service, model) — 4 figures
- [ ] Student steps — 4 figures
- [ ] Officer review — 4 figures
- [ ] Queue & serving — 4 figures
- [ ] Enrollment completion — 3 figures
- [ ] Admin console — 4 figures
- [ ] Reports — 3 figures
- [ ] Storage — 3 figures
- [ ] Chat — 3 figures
- [ ] Code figures are captured from the current source, at a readable font size, with the file name
      in the caption (reference style: `Figure N. <what it shows> (path/to/file.ts)`).

## 8. Project management artifacts

- [ ] **Figure 1** sprint board — `pm-1-sprint-board.png`
- [ ] **Figure 2** backlog items — `pm-2-backlog.png`

## 9. System screenshots

### System interface

- [ ] **Figure 3** Sign-in — `ui-3-signin.png`
- [ ] **Figure 4** Sign-out confirmation — `ui-4-signout.png`
- [ ] **Figure 5** Footer / about panel — `ui-5-footer.png`

### Student interface

- [ ] **Figure 6** Step list / progress — `stu-6-steps.png` (desktop + phone)
- [ ] **Figure 7** Assessment step — `stu-7-assessment.png`
- [ ] **Figure 8** Social-media step with evidence — `stu-8-social.png`
- [ ] **Figure 9** Profiling step — `stu-9-profiling.png`
- [ ] **Figure 10** Mugshot step — `stu-10-mugshot.png`
- [ ] **Figure 11** Consent / medical step — `stu-11-consent.png`
- [ ] **Figure 12** Returned submission with officer feedback — `stu-12-returned.png`
- [ ] **Figure 13** Queue join + position — `stu-13-queue.png` (desktop + phone)
- [ ] **Figure 14** Notifications — `stu-14-notifications.png`
- [ ] **Figure 15** Profile + enrollment record download — `stu-15-profile.png`
- [ ] **Figure 16** Enrollment assistant (chat) — `stu-16-chat.png`

### SBO officer interface

- [ ] **Figure 17** Officer dashboard — `off-17-dashboard.png`
- [ ] **Figure 18** Submission list with filters — `off-18-submissions.png`
- [ ] **Figure 19** Submission detail (student, evidence, history) — `off-19-detail.png`
- [ ] **Figure 20** Stamp verify dialog — `off-20-verify.png`
- [ ] **Figure 21** Return with feedback chips — `off-21-return.png`
- [ ] **Figure 22** Revoke confirmation — `off-22-revoke.png`
- [ ] **Figure 23** Stamp settings — `off-23-stamp.png`
- [ ] **Figure 24** Social-media link management — `off-24-social.png`
- [ ] **Figure 25** Profiling-form URL — `off-25-profiling-form.png`
- [ ] **Figure 26** Step register report — `off-26-register.png`

### Enrollment officer interface

- [ ] **Figure 27** Availability toggle + department queues — `enr-27-availability.png`
- [ ] **Figure 28** Serving panel — `enr-28-serving.png`
- [ ] **Figure 29** Queue with share link — `enr-29-queue.png`
- [ ] **Figure 30** Removal + undo — `enr-30-remove.png`
- [ ] **Figure 31** Complete enrollment — `enr-31-complete.png`
- [ ] **Figure 32** Revert one / many — `enr-32-revert.png`
- [ ] **Figure 33** Department create/edit — `enr-33-department.png`
- [ ] **Figure 34** Transfer request — `enr-34-transfer.png`
- [ ] **Figure 35** Student roster and detail — `enr-35-roster.png`
- [ ] **Figure 36** Roster report — `enr-36-report.png`

### Administrator interface

- [ ] **Figure 37** Dashboard — `adm-37-dashboard.png`
- [ ] **Figure 38** User table with filters — `adm-38-users.png`
- [ ] **Figure 39** Role change (single + bulk) — `adm-39-roles.png`
- [ ] **Figure 40** Password reset — `adm-40-password.png`
- [ ] **Figure 41** Departments — `adm-41-departments.png`
- [ ] **Figure 42** Academic years — `adm-42-years.png`
- [ ] **Figure 43** Activation preview — `adm-43-activation.png`
- [ ] **Figure 44** Adviser mapping — `adm-44-advisers.png`
- [ ] **Figure 45** Requirements ordering — `adm-45-requirements.png`
- [ ] **Figure 46** Chatbot knowledge editor — `adm-46-knowledge.png`
- [ ] **Figure 47** Integrations toggles — `adm-47-integrations.png`
- [ ] **Figure 48** User directory report — `adm-48-directory.png`

## 10. Stakeholder validation documents

- [ ] **Figure 49–50** Letter of partnership, 2 pages — `val-49-partnership-1.png`, `val-50-partnership-2.png`
- [ ] **Figure 51–54** Project charter approval, 4 pages — `val-51-charter-1.png` … `val-54-charter-4.png`
- [ ] **Figure 55** User acceptance sign-off from the SBO adviser — `val-55-acceptance.png`

## 11. Before submission

- [ ] Every `TODO` in `FINAL_PAPER.md` is gone (search for `TODO`)
- [ ] Figure and table numbers in the text match the final layout
- [ ] Table of contents, list of figures, list of tables regenerated
- [ ] Page numbers printed; references alphabetized
- [ ] Screenshots re-checked for personal data
- [ ] `REFERENCE_OUTLINE.md` cross-check: no section from the reference is missing


- [ ] auto generate image for the api documentation in the final paper
- [ ] create a /script folder inside /docs/paper and add the script used in generating the /diagrams images