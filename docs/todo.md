add skeleton loader that completely match the ui .. in sbo officer page

how to optimize all edge cases whare the api request is too much

in the instructor page, after i click asign department and when i go to the queue page, add indicatior ui to click the accept students toggle to start the queue

rename instructor to enrollment officer

DONT SHOW IN THE LIST THE USER THAT IS RETURNED.. SO ONLY THE STUDENTS APPLYING WILL DISPLAY,,

remove admin capability to jump to other role

after reaply after its revoked the assesment in step 1. when i go to assesment page in the officer page, it did not update that the sutdent reapply again after its been rovoked

concurrency control

timestamp

two phase locking

ordering

version control

validation

online database
sql to mongodb converison (normalized sql version sql to nosql)

time stamp

created at and updated at in every collection

https://www.geeksforgeeks.org/dbms/concurrency-control-techniques/

how to impliment this techniques, among them what is the the once to be used in our system.. and create separate document for the implimentation fo this, and location of the code where it lives

AI Gateway (in front of Workers AI calls for caching/rate-limit/observability, given the Neuron budget pressure), Cloudflare Cache/CDN for static assets + cacheable GETs (keep SSE and auth paths bypassed), and Cloudflare Access (Zero Trust) gating /api/metrics and admin/ops routes instead of app-level tokens. Skip D1/KV/Queues/DO — Mongo + single-process in-memory state already cover those, and adding them buys nothing at this scale.


/preview qa fron the moment open the app umtill all process, look for too many or duplicate api request, purpose of this so that the api wont hammer the server for too many request.. add implimentaion like api is busy with ui validation so it wont limit the api's







in the final paper, dont mentions like AGENTS.md or 	lib/platform/metrics.ts, /api/metrics etc.. the paper or the panelist dont have to check the codebase.. its a pure printed paper    

remove mongodb atlas in the documentation

we try google sheets as an integration  

docu page

composite api


If you open the wrong door, and login, add dialogue modal to notice that theyr role is xxxx continue signin

check if there still comments in the /server tthat is not  an api


# Translation of Revisions (Cebuano/Visayan → English)

---

## Image 1: **Integration**

- **mpdf node**
- **custom env** (custom environment)


2. **Send the email OTP**
3. **Google Sheets**
4. **Google Authenticator**
5. **fpdf/mpdf node**

**How to maintain the system** – system admin

---

## Image 2: **Revision – Collab ERPSys**

- Upload for 1
- Profiling
- Assessment
- Consent – medical
- Which department they belong to

### In Admin:
- View each department
- Add account
- Activity logs (name, role, action, action details, action)
- Filter/search in activity log

**+** The user account's actions/movements should **not be visible** / Admins should **not have access to all roles**

**+** Each account should have its own **recent/activity logs** (own activity logs)

**+** The role should **not be fixed** when **promoting or demoting** (like in admin)

**+** Policies on how to create a password (length, uppercase/lowercase requirements)

**+** In instruct... *(cut off in image)*

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

onboarding highlight for officer and instructor page with focus,  not wizard type


review all instructor queue system, all flow, all edge cases if its handled properly

created at and updated at

There's no global timestamp mechanism — lib/db/db.ts has no auto-createdAt/updatedAt hook, each write sets what it sets.
Both createdAt + updatedAt
- user, session, account, verification — Better Auth schema writes them. Exception: the manual password-reset insert in UserAdminService.ts:115 sets neither.
- chatbot_knowledge, integration_setting, integration_credential — set by hand.
createdAt only
- academic_year, notification, step_verification, upload, social_media_link, department_transfer_request
Note: student_profile declares createdAt and StudentRecordView reads it, but neither insert path (StudentPlacementService.ts:62, StudentProfileService.ts:119) sets it — so it's missing on real docs. That's a bug, not just a gap.
Neither
- student_enrollment, department, adviser_department, requirement_item, step, admin_step_up, chat_usage
Other timestamp fields instead
- enrollment_queue → joinedAt / servedAt / completedAt
- adviser_availability → openedAt / closedAt / lastActiveAt
- admin_action_log, audit_log → at
- storage_usage, profiling_form → updatedAt only
If you want this uniform, the smallest fix is a $setOnInsert/$set timestamp injected once in guardDb() (lib/db/timestamp-ordering.ts already wraps every write) — but it would need a per-collection allowlist to avoid clobbering at/joinedAt conventions.
Skipped: checking history to see whether any collection used to write these fields (data may be mixed old/new).


run atomic commits  randomize the author:
‎github Name: Alistair Ybanez
‎github Username: @Drakaniia
‎github email: floresaybaez574@gmail.com
‎
‎github Name:  John Paul Digal
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