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



AI Gateway (in front of Workers AI calls for caching/rate-limit/observability, given the Neuron budget pressure), Cloudflare Cache/CDN for static assets + cacheable GETs (keep SSE and auth paths bypassed), and Cloudflare Access (Zero Trust) gating /api/metrics and admin/ops routes instead of app-level tokens. Skip D1/KV/Queues/DO — Mongo + single-process in-memory state already cover those, and adding them buys nothing at this scale.


in all step, sample requirements for preview, so student know what requirements they have to submit

the evidence column should clearly show their record in the google forms


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


add only 1 ip access list

add sir Gil in Mongodb Database

only show the apple-design scrolbar on hover og the scrollable content.. apple design all legacy generic scrollbar

plan. fully optimze system, fast response in all edit or update, async or page load or install tanstack react

bug: editing state in myself account counted as "xxx is editing. You can edit when they finish."

when i delete attahced files,  or  somehting wroong to attache or failed to attached error but its already uploaded.. will it delete also in the storage?  because it should

add success toast after succes admin integration updates