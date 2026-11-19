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

we try google sheets as an integration  

docu page

composite api


If you open the wrong door, and login, add dialogue modal to notice that theyr role is xxxx continue signin

check if there still comments in the /server tthat is not  an api


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


rewrite entire history  run atomic commits  randomize the author:
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


ISSUE IN THE FINAL PAPER, DONT MENTION SYTEM FILES LIKE "(apps/server/src/routes/storage/index.ts)." OR "ENROLLMENT_ADVISER" REMOVE EVEYWHERE,

SPLIT THE API DODCUMENTATION AND CHAPTERS 1-5

Definition of Terms IS WRONG,  REFER TO THE @Collab Final Project Documentation.REFERENCE.pdf  TERMS LIKE THE  API, CONCURRENCY, RBACC, JWT  ETC..


the first step we missed is we should make a normalized version of the database in sql tables, we make 1st normal form to the 3rd or final normal form. but we skip it.. can we create a sql version first based on the prblem statement or the system itselt. look for duplication, and not needed tables or collections, we make the collections as simple possible and minimal tables  that has created at and updated at in each collections



database backup

admin can change role to admin also, not just one

security policy document in page

backup

database concurency, add array  when two person editing, bot can edit but only one is saved. not just in the middleware

timestamp. when two person editing, not just timestamp.ts  make it two array in the databse. meaning is it like timsetamp concurency control?  it should be displayed array with two user editing and

add only 1 ip access list

add sir Gil in Mongodb Database

smiplify collections, drop duplicate, make some in local session instead of storing in collections, make collections simple as possible 

use temporary Data for screenshots for the chapter snippet in the /docs/paper  for the screenshots of the System for the main important pages, add it in the /paper/screenshots


add test button


why still button to connect to Google callendar if user logged in with google?
add external link to the calendar so it opens in a new tab

will the calendar auto open queue if whats in my schedule?

ip address of the mongodb

in the step 1, add sample preview for the requirements that needs to submit so students have idea what  image they have to sttach