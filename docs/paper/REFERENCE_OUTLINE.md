# Reference outline — Collab Final Project Documentation (UTSMS)

Source: [`Collab Final Project Documentation.REFERENCE.pdf`](Collab%20Final%20Project%20Documentation.REFERENCE.pdf)

- 259 pages. The PDF carries **no outline/bookmarks**, so this outline was recovered from the
  document's own heading lines (bold runs and chapter/section titles), not from a table of contents.
- Page numbers are **PDF page numbers**; the file has no printed folios.
- Headings are reproduced verbatim, including the reference document's numbering typos, so every
  line here can be matched against the source.
- The reference documents a different system (Bukidnon State University CITL — *University Training
  and Seminar Management System*, UTSMS). It is used here only as the structural template for
  `FINAL_PAPER.md`.

---

## Front matter

| Page | Content                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------ |
| 1    | Title page — Bukidnon State University / College of Technologies / IT Department; project title; "A Project Presented to" + panel; "In Partial Fulfillment …" (IT133 SIA 1, IT137 Elective 3, IT132 Advanced Database Systems, IT135 Information Assurance and Security 1); "By:" + developers; date |

No table of contents, list of figures, or list of tables is present.

---

## Chapter 1 — INTRODUCTION (p. 2)

- 1.1. Background of the Organization (p. 2)
  - 1.1.1. History (p. 2)
  - 1.1.2. Nature of Operations (p. 2)
  - 1.1.3. Demographics (p. 2)
  - 1.1.4. Organizational Chart (p. 3) — Figure 1.1
  - 1.1.5. Functional Chart (p. 4) — Figure 1.2
- 1.2. Business Processes (p. 5)
  - 1.2.1. Information Asset Identification (p. 5)
  - 1.2.2. List of Information Assets (p. 5) — Table 1.1
  - 1.2.3. Weighted Factor Analysis (p. 6)
  - 1.2.4. Threat Identification (p. 6)
  - 1.2.5. Vulnerability Database (p. 7) — Table 1.2
  - 1.2..6. Vulnerability Assessment (p. 8) — *printed with a double dot; High / Medium priority controls*
- 1.3. Background of the System (p. 8)
- 1.4. Objectives (p. 10)
  - 1.4.1. General Objectives (p. 10)
  - 1.4.2. Specific Objectives (p. 10)
- 1.5. Scope and Limitations (p. 11)
- 1.6. Definition of Terms (p. 11)

## Chapter 2 — RISK & SYSTEM ANALYSIS (p. 13)

- 2.1. Risk Analysis (p. 13)
  - 2.1.1. TVA Worksheet (p. 13) — Table 2.1
  - 2.1.2. Likelihood Scale (p. 14) — Table 2.2 (1 Unlikely … 4 Almost Certain)
  - 2.1.3. Risk Impact Scale (p. 15) — Table 2.3 (1 Negligible … 4 Extreme)
  - 2.1.4. Risk Control Strategy (p. 15) — Table 2.4
- 2.2. Requirements (p. 18)
  - 2.2.1 Functional Requirements (p. 18)
  - 2.2.2 Non-Functional Requirements (p. 19)
  - 2.2.3 Database Schema (p. 20) — Figures 2.1–2.4
  - 2.2.4 System Interface and Execution (p. 24) — Browser / Backend / Frontend requirements

## Chapter 3 — SYSTEM DESIGN & DEVELOPMENT (p. 25)

- 3.1. Solution Design (p. 26)
- 3.2. Architectural Views (p. 27)
  - 3.2.1. Logical View (Activity Diagram) (p. 27) — Figures 3.1–3.4
  - 3.2.2. Process View (User Flow Diagram) (p. 32) — Figure 3.5
  - 3.2.3. Scenario View (Use-Case Diagram) (p. 33) — Figure 3.6
- *(no 3.3 in the source — numbering jumps from 3.2.3 to 3.4)*
- 3.4. Project Schedule (p. 34) — Figure 3.7 Gantt chart
- 3.5. Integration Strategies (p. 35)
  - 3.5.1. API Integrations and Interactions (p. 35) — numbered 1–6, one sub-block each:
    - 1. OAuth (p. 35)
    - 2. reCAPTCHA (p. 38)
    - 3. Gmail API (p. 40)
    - 4. Google Sheets API (p. 43)
    - 5. Google Calendar API (p. 45)
    - 6. Google Forms API (p. 48)
  - 3.5.2. Integration of Subject Components (p. 51)
  - 3.5.3. Data Flow and Communication (p. 52)

## Chapter 4 — SECURITY POLICY (p. 46)

- 4.1. IS Policy Document (p. 46)
  - 4.1.1. Hardware Security Policy (p. 46)
  - 4.1.2. Software Security Policy (p. 46)
  - 4.1.3. Network Communications Policy (p. 46)
  - 4.1.4. Data Policy (p. 47)
  - 4.1.5. Process Policy (p. 47)
  - 4.1.6. People Policy (p. 47)
- 4.2. IT Security Management Framework (p. 48)
  - 4.2.1. Legal Compliance (p. 48)
  - 4.2.2. Security Governance Standard (p. 48)
- 4.3. Network Security Testing (p. 49)
  - 4.3.1. Network and Server Profiling (p. 49)
  - 4.3.2. CVSS (p. 49) — Table 4.1 Vulnerability Assessment Table
- 4.4. Solution Design (p. 50)
  - 4.4.1. Policy Design (p. 50)
  - 4.4.2. Logical Design (p. 51)
  - 4.4.3. Physical Design (p. 51)
  - 4.4.4. IS implementation Design (if applicable) (p. 52)
  - 4.4.5. Intrusion and Detection Systems (p. 52)
  - 4.4.6. Secure Process Model (p. 52)
- 4.5. Business Continuity Plan (p. 53)
  - 4.5.1 Incident Response Plan (p. 53)
  - 4.5.2. Disaster Recovery Plan (p. 53)

## Chapter 5 — CONCLUSION (p. 55)

- 5.1. Reflection on Architecture Decisions (p. 55)
- 5.2. Difficulties Encountered (p. 55)
- 5.3. Improvements and Extensions (p. 56)
- 5.4. Conclusion (p. 56)

## References (p. 57)

Numbered/APA-style entries: IBM i 7.3 disaster recovery, CVSS v4.0 examples (FIRST), GeeksforGeeks
coding standards, SafetyCulture risk assessment, Kong "What is an API?".

## Appendices (p. 58)

- Table 5. Summary of Achievements (p. 58) — Objective / Achievements / Date
- Table 6. Member's Contributions and Roles (p. 59) — Team Member / Roles / Contributions

## API Documentation (p. 61)

Unnumbered part title, then three module chapters. Each endpoint follows one fixed block:
`Version` → `Date` → `Description` → `Endpoint` → `Method` → `Configurations` → `Parameters` →
`Response codes of this API endpoint` (Code / Message / Description) → figures for the valid
request, invalid request, and each response code.

### 1.1 USER MODULE API (p. 61)

- 1.1.1 Module Description (p. 61)
- 1.1.2 Retrieve User Profile (p. 62)
- 1.1.3 Patching User Profile (p. 66)
- 1.1.4 Retrieving User Certificates (p. 70)
- 1.1.5 Retrieving Specific User Certificates (p. 74)
- 1.1.6 Retrieving User Events (p. 79)
- 1.1.7 Retrieving Specific Event (p. 82)
- 1.1.8 Register User for Specific Event (p. 86)
- 1.1.9 Checking User Registered Events (p. 90)
- 1.1.10 User Cancellation of an Event (p. 94)
- 1.1.11 Retrieving Users Event History (p. 98)
- 1.1.12 User Specific Event Form Submission (p. 102)
- 1.1.13 User Registered Form Status (p. 106)
- 1.1.14 Retrieving Users Form Analytics (p. 110)
- 1.1.15 Retrieving Users Certificate Status (p. 114)
- 1.1.16 Retrieving User Notification List (p. 118)
- 1.1.17 Updating Notification Read Status (p. 122)
- 1.1.18 Updating Notification Status on Removal (p. 126)

### 1.2 ADMIN MODULE API (p. 130)

- 1.2.1 Module Description (p. 130)
- 1.2.2 Retrieve All Users (p. 131)
- 1.2.3 Add User Account (p. 135)
- 1.2.4 Modify User Account (p. 140)
- 1.2.5 Add Event (p. 144)
- 1.2.6 Retrieve All Events (p. 149)
- 1.2.7 Edit or Update an Event (p. 153)
- 1.2.8 Cancel an Event (p. 158)
- 1.2.9 Event Concurrency Lock (p. 162)
- 1.2.10 Event Clear Concurrency Lock (p. 167)
- 1.2.11 Retrieve Admin Event History List (p. 172)
- 1.2.12 Retrieve User Registrations List (p. 176)
- 1.2.13 Retrieve Specific User Event Registrations (p. 180)
- 1.2.14 Retrieve All Submitted Forms (p. 184)
- 1.2.15 Retrieve All Submissions in a Specific Event (p. 187)
- 1.2.16 Retrieving Admin Dashboard Data (p. 191)
- 1.2.17 Retrieving Activity Logs (p. 194)

### 1.3 AUTHENTICATION MODULE API (p. 198)

- 1.3.1 Module Description (p. 198)
- 1.3.2 Retrieve User Google Account (p. 198)
- 1.3.3 Verify User Google Account (p. 201)
- 1.3.4 Manual login and authenticate User Credentials (p. 203)
- 1.3.5 Logout User and Terminate Session (p. 206)
- 2.3.6 New User Password Set Up (p. 209) — *printed as 2.3.6; belongs to 1.3*

## External API Documentation (p. 213)

Unnumbered part title; six entries, each `a. Description`, `b. Version`, `c. Documentation`:

1. Google Auth 2.0 API (p. 213)
2. reCaptcha v3 (p. 213)
3. Gmail API (p. 213)
4. Google Sheets API (p. 213)
5. Google Calendar API (p. 213)
6. Google Form API (p. 213)

## Sample Code Snippets (p. 214)

Unnumbered part title; eight feature groups, each naming the client file, model, route, and service
and showing the code as figures (Figures 1–72 in this part):

- Login Management Code Sample (p. 214) — AppRouter, Login.jsx, authRoutes, authServices, LoginSuccess
- Event Management Code Sample (p. 216)
- Notification Code Sample (p. 220)
- User Accounts Code Sample (p. 224)
- Activity Logs Code Sample (p. 227)
- Generate Certificate Code Sample (p. 229)
- Event Registration Management Code Sample (p. 231)
- Form Submission Code Sample (p. 233)
- Calendar Code Sample (p. 236)

## Coding Standards and Guidelines (p. 238)

Unnumbered part title; five numbered standards, each citing the GeeksforGeeks guideline and then
applying it to the system:

1. Code Formatting (p. 238)
2. Naming Conventions (p. 238)
3. Commenting (p. 238)
4. Code Structure (p. 238)
5. Error Handling (p. 239)

## Project Management Artifacts (p. 240)

- Sprint Click Up (p. 240) — Figure 1 Click Up Sprint Board, Figure 2 Click Up Backlog Items

## Screenshots of System (p. 241)

Numbered Figure 3 onward, in three groups:

- System Interface (p. 241) — Log In, Log out, Footer
- User Interface (p. 241) — Homepage, Events, Calendar, Registration, Survey Form (web + Google Form),
  Verify Submission, Kanban, Certificate Gallery, Profile, Notifications
- Admin & Departmental Admins Interface (p. 245) — Dashboard, Calendar, User Table, Add User,
  Activity Logs, Event Page (admin vs departmental), Event History, Report Analytics, Add/Edit Event
  modal, concurrent-edit warning, Delete confirmation

## Stakeholder Validation Documents (p. 254)

- Figure 29. Letter of Partnership Page 1 (p. 254)
- Figure 30. Letter of Partnership Page 2 (p. 254)
- Figure 31. Letter of Project Charter Approval Page 1 (p. 255)
- Figure 32. Letter of Project Charter Approval Page 2 (p. 255)
- Figure 33. Letter of Project Charter Approval Page 3 (p. 255)
- Figure 34. Letter of Project Charter Approval Page 4 (p. 255)

---

## Anomalies to avoid copying

| Where              | What                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| 1.2                | `1.2..6. Vulnerability Assessment` — double dot                                        |
| Chapter 3          | no `3.3` — numbering jumps from `3.2.3` to `3.4`                                        |
| 2.2                | `2.2.1`–`2.2.4` are printed without the trailing dot used elsewhere                     |
| API 1.3            | last endpoint printed as `2.3.6` instead of `1.3.6`                                     |
| Figures, API part  | numbering skips `133`/`134` and later restarts at `Figure 1` in each later part         |
| Figures, calendar  | `Figure 59`, `Figure 70`, `Figure 71`, `Figure 72` — the 60s are missing                |
| Tables             | `Table 5`, `Table 6` appear after the chapter tables (chapter tables stop at `Table 4.1`) |
| References         | entries are out of alphabetical order (Kong after Pulsifer)                             |
