# ERPSYS — Spec (Day 1)

> Full spec file before start implementation.

## Requirements

- Make the schema as simple as possible but still workable
- The database we'll use is MongoDB
- The backend should be Node.js
- Role-based access control: with the domain `@buksu.edu.ph` / `@student.buksu.edu.ph` login

## The Steps

> Detailed in [The Scenario](#the-scenario) below.

## What We're Planning to Make

- AI integration: AI chatbot using Groq
- File/document upload with UploadThing
- student page is optmize for mobile view
- Integration: Enrollment Queue (final process for fully enrolled students) / Adviser Approval in the instructor page

## The Scenario

Too many students from freshman or 2nd year to 4th year go to the SBO office just to get past the "me card" with the 6 steps:

1. **Step 1 — Assessment** (SBO officers)
2. **Step 2 — Social media** (by liking and following FB pages related to school such as COT SBO, SSC, etc.)
3. **Step 3 — Profiling** (thru Google form)
4. **Step 4 — Mugshot** [style (pictorial for documentation)]
5. **Step 5 — Parent consent and medical form submission** (submitting the physical requirements paper)
6. **Step 6 — Enrollment** (enrollment officer)

The process is that there are three main roles: the students, the SBO officers, and the adviser.

- Students first have a different page when logging in using Google (edge case: if students don't use their institutional account) to go to the first step.
- The first step is assessment: apply for assessment if they have a payment record in the SIMS (Student Information Management System), which the SBO already have; they assess students if they have a balance to pay.
- Continue with step 2 (social media) up to step 5.
- All this process is face-to-face with stamps; in each step, SBO officers check and stamp if verified — we just have to digitalize it.
- The last step is the enrollment officer — this is where `@buksu.edu.ph` comes in; this email is used by the instructor.
- The final verification is for the processing of the COR; you can't go to step 6 if none of these steps is fulfilled.
- The instructor is a new role, so it has a different dashboard. Students, Sbo Officers, and Adviser have different pages.

