# ERPSYS implementation checklist

Check off repository changes when implemented. Live operations require separate confirmation and verification.

## Student and staff workflow

- [x] Use **Enrollment Officer** for the former Instructor role in the UI. Keep the stored role, API paths, and URLs unchanged.
- [x] Restrict admins to the admin console while preserving administrative actions.
- [x] Show the signed-in role after a wrong-portal sign-in. Let the user continue to their own portal or choose another account.
- [x] Limit review queues to active applications. Keep returned records in reports and history.
- [x] Show Step 1 in the assessment queue again after a student reapplies following revocation.
- [x] Label the Google Forms record in the staff Evidence column.
- [x] Accept optional proof of payment in Step 1 and display it to staff.
- [x] Add requirement previews for all six steps. The consent and medical previews redraw blank fields from Annex E and Annex F; they are not forms to submit.
- [x] Use contextual onboarding in the SBO Officer and Enrollment Officer consoles instead of a wizard.
- [x] Lighten the isometric illustration outlines on the login page.
- [x] Confirm Calendar behavior: office hours do not open the queue automatically. Staff open it by going available.

## Accounts and security

- [x] Let admins create accounts by email invitation instead of choosing someone else’s password.
- [x] Let admins promote eligible accounts after step-up authentication. Revoke existing sessions on promotion.
- [x] Enforce password length and uppercase/lowercase requirements when setting a password.
- [x] Publish a security policy in the public guide.
- [x] Show multiple active staff editors on a review record without using presence as a lock.
- [x] Verify that an anchored review save cannot overwrite a newer decision. Keep the rejected draf t.
- [x] Audit server comments against `AGENTS.md`: API and timestamp-ordering comments only, apart from tests.
- [x] Confirm server-side rate limiting. It mitigates bursts, not all database overload; see the [deployment runbook](ops/deployment.md).
- [ ] Close the generic MongoDB upsert race without introducing duplicate logical rows. This is separate from the guarded review saves verified above.

## Database and live operations

- [x] Verify the executable [normalized SQL reference](specs/normalized-database.sql) and document its [MongoDB mapping](specs/normalized-database.md). No runtime migration.
- [x] Consolidate duplicate collections and keep browser-only read markers out of MongoDB. See [storage boundaries](ops/collection-simplification.md).
- [x] Document backup scope and the isolated restore procedure in the [backup runbook](ops/database-backup.md).
- [ ] Confirm scheduled MongoDB and R2 backups and record a timed restore drill before dropping any retained legacy collections.
- [ ] Confirm production egress IP/CIDR and recovery access before reducing the Atlas allowlist to one entry.
- [ ] Confirm Sir Gil’s Atlas identity, target project or database, and least-privilege role before granting access. Do not share a database credential.

## Deferred

- [x] Skip the composite API until a screen and response contract are named.
- [ ] Evaluate Workers AI Gateway, CDN caching with auth and SSE bypasses, and Cloudflare Access for operations routes. Do not add D1, KV, Queues, or Durable Objects for this scope.
- [x] Leave Git history unchanged. Any later rewrite needs separate approval, a recoverable backup, and verified author and date attribution.

rename instructor to enrollment officer

DONT SHOW IN THE LIST THE USER THAT IS RETURNED.. SO ONLY THE STUDENTS APPLYING WILL DISPLAY,,

remove admin capability to jump to other role

after reaply after its revoked the assesment in step 1. when i go to assesment page in the officer page, it did not update that the sutdent reapply again after its been rovoked
sql to mongodb converison (normalized sql version sql to nosql)

time stamp

AI Gateway (in front of Workers AI calls for caching/rate-limit/observability, given the Neuron budget pressure), Cloudflare Cache/CDN for static assets + cacheable GETs (keep SSE and auth paths bypassed), and Cloudflare Access (Zero Trust) gating /api/metrics and admin/ops routes instead of app-level tokens. Skip D1/KV/Queues/DO — Mongo + single-process in-memory state already cover those, and adding them buys nothing at this scale.

composite api

If you open the wrong door, and login, add dialogue modal to notice that theyr role is xxxx continue signin

check if there still comments in the /server tthat is not an api

### In Admin:

- should be able to Add account

be able to promote to admin in admin page.. not just promote role to sbo

---

### Summary of Key Points:

These revisions are for a **collaborative ERP system** and cover:

- **Security features**: Super user PIN, email OTP, Google Authenticator, password policies
- **Admin controls**: Department viewing, account management, activity logging with filtering, role-based access restrictions
- **Role management**: Flexible promotion/demotion without fixed roles
- **Audit trail**: Each user has their own activity log; admins cannot see all roles' activities
- **PDF generation**: Using fpdf/mpdf nodes
- **System maintenance**: Guidelines for system admins

in all step, sample requirements for preview, so student know what requirements they have to submit

the evidence column should clearly show their record in the google forms

in the step 1 assesment can still upload for proof of payment

onboarding highlight for officer and instructor page with focus, not wizard type

rewrite entire history (delete entire comit start fresh (do this later))run atomic commits randomize the author:
‎github Name: Alistair Ybanez
‎github Username: @Drakaniia
‎github email: floresaybaez574@gmail.com
‎
‎github Name: John Paul Digal  
‎github Username: Didigzz
‎github email: 2401115560@student.buksu.edu.ph
‎
‎github Name: Miershan Cantiver
‎github Username: Mugekuro
‎github email: 2401107747@student.buksu.edu.ph

github Name: Melvis Alfonse Palmares
‎github Username: melvis1821
‎github email: bogythegreat@gmail.com
and radomize the commit date starting from october 1 up to now

sql version

database backup

in the login page. the isometric is its edge is so thic.. make it thinner or not so dark, just light grey or something

admin can change role to admin also, not just one

security policy document in page

database concurency, add array when two person editing, bot can edit but only one is saved. not just in the middleware

timestamp. when two person editing, not just timestamp.ts make it two array in the databse. meaning is it like timsetamp concurency control? it should be displayed array with two user editing and

add only 1 ip access list

add sir Gil in Mongodb Database

smiplify collections, drop duplicate, make some in local session instead of storing in collections, make collections simple as possible

use temporary Data for screenshots for the chapter snippet in the /docs/paper for the screenshots of the System for the main important pages, add it in the /paper/screenshots

add test button

why still button to connect to Google callendar if user logged in with google?
add external link to the calendar so it opens in a new tab

will the calendar auto open queue if whats in my schedule?

ip address of the mongodb

in student profiling step 3, include their status if they are submitted a form, so we can eliminate the "Ive Submitted button", also show preview of their response, become uncomplete if they have incomplete filled up
