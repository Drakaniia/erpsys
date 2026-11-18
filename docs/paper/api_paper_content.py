"""Reader-friendly descriptions for the API manuscript, without example payloads."""

MODULES = {
    "auth": ("AUTHENTICATION AND ADMINISTRATOR VERIFICATION MODULE API", "This module lets users sign in, sign out, and recover their accounts. It also checks an administrator's identity before sensitive settings can be changed."),
    "students": ("STUDENT RECORDS MODULE API", "This module helps students view their enrollment progress. Authorized staff can search student records, review requirements, and send reminders."),
    "enrollments": ("ENROLLMENT MODULE API", "This module saves a student's course and year level. It also lets assigned advisers finish enrollment or correct an enrollment marked complete by mistake."),
    "evidence": ("REQUIREMENT EVIDENCE MODULE API", "This module manages the files and links that students use as proof of completing a requirement. Students can submit or withdraw eligible requirements for review."),
    "storage": ("FILE UPLOAD MODULE API", "This module gives permitted users a secure way to upload files and view stored evidence. Starting an upload and finishing an upload are separate steps."),
    "submissions": ("REQUIREMENT REVIEW MODULE API", "This module lets SBO officers review student submissions, approve requirements, and return unclear or incomplete evidence with feedback."),
    "queues": ("ENROLLMENT QUEUE MODULE API", "This module manages the waiting line for enrollment. Students can join or leave the line, while assigned advisers serve eligible students."),
    "queue-shares": ("QUEUE INVITATION MODULE API", "This module creates and checks invitation links to a department's enrollment queue. Opening a link does not automatically add a student to the line."),
    "departments": ("DEPARTMENT MODULE API", "This module manages departments, their offered year levels, and related enrollment records."),
    "advisers": ("ADVISER ASSIGNMENT MODULE API", "This module manages adviser assignments and live queue availability. An adviser must be available before eligible students can join the queue."),
    "transfers": ("DEPARTMENT HANDOVER MODULE API", "This module lets advisers request, accept, decline, or cancel a change in department responsibility."),
    "schedules": ("OFFICE-HOUR SCHEDULE MODULE API", "This module saves an adviser's weekly office hours and date-specific changes. A posted schedule does not automatically open the live enrollment queue."),
    "calendar": ("GOOGLE CALENDAR MODULE API", "This module connects an adviser's Google Calendar and copies office-hour schedules to it. Disconnecting Google Calendar does not erase the schedule saved in ERPSYS."),
    "academic-years": ("ACADEMIC YEAR MODULE API", "This module manages school years and semesters. An administrator can choose which enrollment period is currently active."),
    "requirements": ("ASSESSMENT REQUIREMENT MODULE API", "This module manages the assessment checklist used during student clearance and enrollment."),
    "content": ("FORMS AND INFORMATION MODULE API", "This module manages the profiling form, required social-media links, and information used by the enrollment assistant."),
    "me": ("PERSONAL DASHBOARD MODULE API", "This module loads the signed-in user's dashboard, digital stamp, and notifications. The information shown depends on the user's permitted working area."),
    "reports": ("REPORT MODULE API", "This module supplies student lists, requirement registers, and totals for reports. The website prepares the printable PDF; these endpoints provide the information."),
    "users": ("ACCOUNT MANAGEMENT MODULE API", "This module lets administrators find accounts, change supported permissions, block accounts, and help students replace passwords."),
    "integrations": ("INTEGRATION SETTINGS MODULE API", "This module shows the connected services and their settings. Sensitive changes require additional administrator verification. Better Auth stays enabled because the system needs it for sign-in."),
    "audit-logs": ("ACTIVITY LOG MODULE API", "This module lets administrators review recorded requests that changed application information."),
    "chat": ("ENROLLMENT ASSISTANT MODULE API", "This module provides an assistant that answers enrollment questions. Replies arrive in small parts while the answer is being written."),

    "system": ("SYSTEM HEALTH MODULE API", "This module provides a basic check that the application server is responding."),
}

# Each row contains a title, a simple purpose sentence, and a response description.
_ROWS = """
Send an Email Sign-In or Verification Code|requests an email code for sign-in or email verification|A success confirmation is returned, not the code. For sign-in, an unknown email also receives a general confirmation without an email being sent.
Sign In with an Email Code|signs in an existing account using a fresh emailed code|The session token and account details are returned. A session cookie is set. Read the current session to confirm the account's permissions.
Verify an Account Email Address|confirms account ownership using an emailed verification code|A successful status and verified user are returned. The token is null; this action does not create a new sign-in session.
Sign In with Email and Password|allows a user to sign in using an email address and password|The account details and sign-in information are returned. The browser receives a session cookie to keep the user signed in.
Register a Student Account|creates a student account and saves the student's enrollment placement|The new account details are returned and the student is signed in.
Standard Password Signup Is Disabled|rejects the unused standard registration route|The request is refused. Students must use the student-registration endpoint instead.
Begin Google Sign-In|starts the Google sign-in process|A Google sign-in address is returned. The user must finish the Google steps before sign-in is complete.
Complete Google Sign-In|receives Google's answer after the user signs in|The user is sent back to the website. Sign-in information is set only when the Google checks succeed.
Read the Current Sign-In Session|checks whether a user is signed in|The current user and session details are returned, or an empty result when the user is signed out.
Sign Out|ends the user's sign-in session|The sign-out result is returned and the browser's session cookie is cleared.
Request an Emailed Password-Reset Link|requests an email link for replacing a forgotten password|A general confirmation is returned without revealing whether the email address belongs to an account. This does not prove the email was delivered.
Consume a Password-Reset Token|sets a new password using a valid reset link|A confirmation is returned when the password is changed.
Library Password-Reset Callback|checks a password-reset link before sending the user to the website|The browser is sent to the permitted reset page with the token, or with an invalid-token notice.
Read Sensitive-Action Verification Status|checks the administrator's progress through the security steps|The result shows whether sensitive actions are unlocked, when the unlock ends, the next security step, and whether an authenticator is set up.
Confirm the Administrator PIN|checks the administrator's six-digit security PIN|A confirmation is returned when the PIN is accepted.
Confirm the Administrator Password|checks the administrator's password during security verification|A confirmation is returned when the password is accepted.
Send Administrator Confirmation Email|sends a security code to the administrator's email address|A confirmation is returned when the email-code request succeeds.
Verify the Emailed Administrator Code|checks the six-digit code sent to the administrator|A confirmation is returned when the code is accepted.
Prepare Authenticator Enrollment|prepares an authenticator app for an administrator|Private setup information and backup codes are returned. Do not include these values in screenshots.
Verify the Authenticator Code|checks the current code from the administrator's authenticator app|The verified account and session details are returned. Protected integration actions are unlocked for five minutes.
Use a One-Time Authenticator Backup Code|checks an unused backup code when the authenticator is unavailable|The verified account and session details are returned. The code is used up and protected actions are unlocked for five minutes.
List Academic Years|shows the available school years and semesters|The school-year list is returned with each period's name, semester, active status, and whether it contains records.
Create an Academic Year|adds a school year and semester|The new period's details and active status are returned.
Edit the Current Academic Year|changes the name and semester of the active enrollment period|The updated period's details are returned.
Delete an Empty Academic Year|removes a school year that has no protected enrollment activity|The identifier of the removed period is returned.
Preview Academic-Year Activation|checks the effect of switching the active school year|The current year name, number of students with progress, and number of open queue entries are returned.
Activate an Academic Year|sets a selected school year as the active enrollment period|The selected period's details are returned. Other periods are no longer active.
List Assessment Requirements|shows the assessment checklist|The checklist items, display order, and active status are returned.
Add an Assessment Requirement|adds an item to the assessment checklist|The new checklist item's details are returned.
Reorder Assessment Requirements|changes the order of assessment checklist items|The submitted list of item identifiers is returned.
Update an Assessment Requirement|changes an assessment item's label or active status|The updated checklist item's details are returned.
Delete an Assessment Requirement|removes an assessment checklist item|The identifier of the removed item is returned.
Read User-Directory Report Data|provides account information for a user-directory report|The selected year, matching account rows, total matches, and a notice of any shortened results are returned.
Read Department-Roster Report Data|provides student information for a department roster report|The selected year, student rows, summary totals, total matches, and a notice of shortened results are returned.
Read Uncapped Roster Totals|counts the students matching the roster filters|Totals by course, course and year level, progress group, and unassigned students are returned without the report row limit.
Read Step-Register Report Data|provides submissions for a requirement register report|The year, selected requirement, matching rows, total matches, and a notice of shortened results are returned.
Read Assistant Knowledge|shows the saved information used by the enrollment assistant|The saved text, revision number, and last editor are returned. The result can be empty if nothing has been saved.
Replace Assistant Knowledge|replaces the information used by the enrollment assistant|The new revision number and update time are returned.
Read the Linked Profiling Form|shows the profiling form linked to the current school year|The form title, answer link, edit link, and last update details are returned, or an empty result if no form is linked.
Create and Link the Profiling Form|creates a Google profiling form for the current school year|The new form's details and links are returned.
Unlink the Profiling Form|removes the current school year's link to the profiling form|A confirmation is returned. The Google Form itself is not deleted.
List Required Social-Media Links|shows the social-media pages required for student clearance|The saved links are returned in display order.
Add or Update a Social-Media Link|saves a required social-media page|The new or updated link details are returned.
Reorder Social-Media Links|changes the display order of required social-media links|A confirmation is returned when the order is saved.
Edit a Social-Media Link|changes the name and address of a required social-media page|The updated link details are returned.
Delete a Social-Media Link|removes a required social-media page from the list|A confirmation is returned when the link is removed.
Read Registration Options|shows the school years and departments available for registration|The available school years and departments are returned. Year-level choices are included in the department information.
Load the Landing-Screen Bundle|loads the information needed for the signed-in user's starting page|The dashboard information allowed for the user's working area is returned.
Read the Officer or Administrator Overview|shows the summary for an SBO officer or administrator|The summary for the user's permitted working area is returned.
Read My Digital Stamp|shows the signed-in user's digital stamp|The saved stamp details are returned.
Update My Digital Stamp|changes the signed-in user's digital stamp|The updated stamp details are returned.
Read My Notifications|shows the signed-in user's latest notifications|Up to 50 notifications are returned, with the newest first.
Mark All Notifications Read|marks all of the signed-in user's notifications as read|The number of notifications updated is returned.
List Departments and Assignments|shows departments and their adviser assignments|A page of department details and assignment information is returned.
Read My Student Department|shows the department linked to the student's placement|The department details and current and next office hours are returned, or an empty result when no department applies.
Set My Department Responsibility|saves the adviser's department and year-level responsibility|The saved assignment result is returned.
Create a Department|adds a department to the system|The department's identifier, name, generated code, year levels, active status, and any new assignment are returned.
Rename or Change Department Status|changes a department's name or active status|The changed department details are returned.
Set Offered Department Year Levels|saves the year levels offered by a department|The department identifier and saved year levels are returned.
Delete an Eligible Department|removes a department when its records allow deletion|The department identifier and deletion confirmation are returned.
Read the Department Enrollment Register|shows the students enrolled under a department|Enrollment entries and a total are returned. When more entries are available, the X-Next-Cursor response header provides the next-page marker.
List Adviser Assignments|shows advisers and the departments they handle|The adviser names, emails, departments, and assigned year levels are returned.
Replace an Adviser's Assignments|replaces an adviser's department and year-level assignments|The saved assignment result is returned.
Open or Close My Queue Availability|changes whether an adviser is ready to serve students|The department, the adviser's open status, and the department's combined availability are returned.
Refresh My Availability|keeps the adviser's open availability current|The number of availability records refreshed is returned.
List Incoming and Outgoing Handovers|shows department handover requests involving the adviser|The incoming and outgoing handover requests are returned.
Request Department or Year-Level Handover|asks the current adviser to hand over department responsibility|The request details, involved advisers, and response deadline are returned.
Accept or Decline a Handover|records the current owner's answer to a handover request|The request identifier, final status, and previous adviser's name are returned.
Cancel My Handover Request|withdraws the caller's pending handover request|The request identifier and cancellation confirmation are returned.
Take Over Department Responsibility|takes over department or year-level responsibility under the system's rules|The department details and previous adviser's name are returned.
Read My Department Office Hours|shows an adviser's saved hours for a department|The department identifier, schedule entries, and calendar-copy status are returned.
Replace Department Office Hours|replaces an adviser's office-hour schedule for a department|The saved schedule entries and calendar-copy status are returned.
Read My Calendar Connection|checks the adviser's Google Calendar connection|The service availability, connection status, Google email, last update time, and any last error are returned.
Start Calendar Authorization|starts the adviser's permission request for Google Calendar|A Google permission-page address is returned. The adviser must open it and complete Google's steps.
Complete Calendar Authorization|receives Google's answer to the calendar permission request|The browser returns to the adviser page with a connected or error notice.
Synchronize Calendar Again|requests another copy of the office-hour schedule to Google Calendar|The current calendar connection and update status are returned.
Disconnect Calendar|removes the adviser's Google Calendar connection|The disconnected calendar status is returned. The ERPSYS office-hour schedule remains saved.
Read My Queue Position|shows the student's current place in the enrollment line|The current queue details are returned, or an empty result when the student is not in a queue.
Join My Enrollment Queue|adds an eligible student to the department's enrollment line|The queue-entry identifier, department name, and waiting position are returned.
Leave My Waiting Queue|removes the student from the waiting line|A confirmation is returned. A student currently being served cannot leave through this action.
Monitor My Department Queues|shows the waiting lines handled by the adviser|The department queues and information about students being served are returned.
Serve the Next Eligible Student|starts service for the next eligible student in the line|The queue-entry identifier and service status are returned.
Release the Served Student|ends the adviser's current service for a student|The queue-entry identifier and updated status are returned.
Move the Served Student to the End|returns the served student to the end of the waiting line|The queue-entry identifier and new position are returned.
Remove a Waiting Queue Entry|removes a waiting student from the line|The result states whether removal happened and includes the information needed for Undo. A changed entry may return a reason instead.
Restore a Removed Queue Entry|puts a recently removed student back in the line|The restoration confirmation and queue-entry identifier are returned.
Create a Queue Invitation|creates a shareable link to a department's enrollment queue|The invitation link, token, department, inviter, and school-year details are returned.
Resolve a Queue Invitation|checks an invitation link and shows the related queue|The invitation status and queue details are returned. INVALID means the link is not valid; STALE means it is for a different enrollment period. Neither joins the queue.
Search Recorded Write Requests|shows recorded requests that changed application information|Matching activity entries are returned with the account, action, address, result, and time.
Stream an Enrollment Assistant Reply|sends a question to the enrollment assistant|The answer arrives in parts, followed by a completion or error notice. A reply can start successfully and still report an error later.
Check Basic Application Health|checks whether the application server is responding|A simple running confirmation is returned. This does not check database readiness.
Read My Profile-Completion Status|checks whether the student has completed a profile|The result states whether a profile exists and gives the saved student number when available.
Search Students or Read the Roster|finds students for the user's permitted working area|A page of account, roster, or student-search results is returned, depending on the caller and selected filters.
Read Roster Rows and Summary Together|loads a student roster and its summary in one request|The student rows, paging information, selected year, and summary totals are returned.
Send In-App Requirement Reminders|sends requirement reminders to selected students|The counts of sent and skipped reminders are returned. These are website notifications, not email or text messages.
Read My Enrollment Progress|shows the student's placement and requirement progress|The profile, enrollment periods, requirement states, queue eligibility, progress totals, and queue status are returned.
Claim My Student Number|saves a missing student number for the signed-in student|The saved student number is returned. An existing number is kept unchanged.
Read a Student's Enrollment Detail|shows a selected student's enrollment and requirements|The student's details, selected year, placement, requirements, queue information, and pending items are returned.
Read a Student's Record-Sheet Data|provides information for a student's record sheet|The student's details, school year, placement, requirement progress, enrollment completion time, and queue information are returned.
Capture and Verify a Mugshot|saves a student's photo and approves the mugshot requirement|The requirement-review identifier, verified status, and upload identifier are returned.
Read My Completed Enrollment Record|provides the student's completed enrollment record|The completed record details are returned, or an empty result when enrollment is not yet verified. The website prepares the PDF.
Request Assessment Review|asks an SBO officer to review the student's assessment requirement|The result indicates that review was requested, or that the requirement was already verified.
Attach File Metadata to a Requirement|records the file reference used as requirement evidence|The file identifiers, links, type, and expiry details are returned. This action records file details; it does not prove a file was uploaded.
Delete My Upload Metadata|removes the student's permitted upload record|A deletion confirmation is returned.
Save an External Evidence Link|saves a web link as proof for a requirement|The student's saved external evidence links are returned. Saving the link does not submit the requirement for review.
Remove External Evidence Links|removes external proof links for a selected requirement|The remaining evidence details are returned.
Submit a Requirement for Review|sends the student's requirement to an SBO officer for checking|The submitted status and attached evidence are returned. Profiling checks the Google Form answer and may have no attached file.
Cancel a Submitted Requirement|withdraws a requirement that is still awaiting review|The requirement returns to pending. Eligible files remain as drafts for 24 hours.
Start an Authorized Upload|requests permission and an address for uploading a file|The upload identifier, upload address, and expiry time are returned. The file must then be sent to that address and the upload finalized.
Finalize an Upload|checks a transferred file and completes its upload record|The file identifier, storage reference, type, and expiry details are returned. A private stored file may have no public file link.
Read Upload Session Status|checks the progress of an upload|The result shows whether the upload is pending, complete, or abandoned. Received size and storage details are included when available.
Read Authorized File Content|opens a stored file for a user who is allowed to view it|The file itself, or the requested portion of it, is returned rather than a normal information response.
List My Enrollment Periods|shows the student's saved enrollment periods|The school years, semesters, departments, year levels, and active-period status are returned.
Save My Enrollment Placement|saves the student's selected school year, department, and year level|The placement details and saved student number are returned.
Complete Enrollment from a Queue Entry|marks the student currently being served as enrolled|The queue-entry identifier, student name, and outcome are returned. An already-completed entry is reported as already enrolled.
Revert One Completed Enrollment|corrects an enrollment marked complete by mistake|The reversal confirmation and returned queue-entry identifier are returned. The student goes back to the front of the waiting line.
Revert Multiple Completed Enrollments|corrects several enrollments marked complete by mistake|The number and identifiers of reversed enrollments and returned queue entries are returned.
List Requirement Submissions|shows student requirements waiting for or undergoing review|Matching submission rows and paging information are returned.
Read a Submission in Full|shows the evidence and history for one requirement submission|The student, requirement, review status, evidence, checklist, stamp, and review history are returned.
Verify a Submission|approves a student's requirement submission|The requirement-review identifier and verified status are returned.
Withdraw a Verification|removes a requirement's previous approval|The requirement-review identifier and pending status are returned.
Return a Submission with Feedback|returns a requirement to the student with correction notes|The requirement-review identifier and returned status are returned.
Search the User Directory|finds accounts in the administrator's user directory|A page of account details is returned, including placement, permissions, and blocked status where available.
Change Student or Officer Permissions in Bulk|changes supported student or officer permissions for selected accounts|The number of updated accounts and details of skipped accounts are returned.
Block or Delete Selected Accounts|blocks or deletes selected accounts according to their activity|Lists of deleted, blocked, and skipped accounts are returned. Accounts with activity are blocked rather than immediately erased.
Change One Student or Officer Permission|changes the supported student or officer permission for one account|The account identifier and saved permission are returned.
Permanently Purge a Blocked Account|permanently removes an eligible blocked account and related records|The identifier of the removed account is returned.
Set a Replacement Student Password|lets an administrator set a student's replacement password|A confirmation and message are returned. This changes the password directly rather than sending a reset email.
Read Integration Availability and Configuration|shows which connected services are available and configured|General callers receive service availability. Administrators receive detailed service settings. Secret values are hidden. Better Auth is always on and includes feature-status information.
List Administrator Authenticator Status|shows which administrators have set up an authenticator|The administrator identifiers, names, emails, and setup status are returned.
Reset an Administrator Authenticator|removes an administrator's authenticator setup|The account identifier and not-enrolled status are returned. Fresh setup is needed before the next protected unlock.
Export Effective Integration Credentials|prepares a private copy of the active service credentials|A suggested file name and credential text are returned. The text contains real secrets and must never appear in this paper or screenshots.
Enable or Disable an Integration|turns a supported optional service on or off|The integration key and saved on-or-off status are returned. Better Auth cannot be turned off.
Save Integration Credential Overrides|saves replacement credentials for a connected service|The updated service settings are returned. A restart notice shows whether saved values need a server restart before use.
Restore Configured Credential Defaults|removes saved credential overrides for a connected service|The service settings are returned using the server's configured defaults. This does not restart the server or restore an exported backup.
Check Integration Credentials Before Saving|checks proposed service credentials without saving them|The service key, current revision, and each checked field's saved status and source are returned. Secret values are not returned.

"""
PLAIN = {title: ("This endpoint " + purpose + ".", response) for title, purpose, response in (line.split("|", 2) for line in _ROWS.strip().splitlines())}

PARAMETERS = {
    "Send an Email Sign-In or Verification Code": ["email — Required existing account email in the request body.", "type — Required purpose: sign-in or email-verification.", "cf-turnstile-response — Required header with a fresh bot-check token for sign-in codes when protection is enabled."],
    "Sign In with an Email Code": ["email — Required existing account email in the request body.", "otp — Required fresh code received after requesting type sign-in. The website uses a six-digit code."],
    "Verify an Account Email Address": ["email — Required account email in the request body.", "otp — Required fresh code received after requesting type email-verification. A sign-in code cannot be used instead."],
    "Sign In with Email and Password": ["email and password — Required account details in the request body.", "callbackURL and rememberMe — Optional return address and stay-signed-in choice.", "turnstileToken or cf-turnstile-response — A fresh bot-check token, when the sign-in settings require it."],
    "Register a Student Account": ["name, studentNumber, email, and password — Required account details in the request body. The number must contain digits only. The password must be 8–128 characters.", "academicYearId, departmentId, and yearLevel — Required school-year, department, and year-level choices. Use FIRST, SECOND, THIRD, FOURTH, or FIFTH for yearLevel.", "turnstileToken or cf-turnstile-response — Optional bot-check token, 1–2,048 characters when supplied."],
    "Prepare Authenticator Enrollment": ["password — Include the administrator's password when the account has one.", "issuer — Optional app label. The default is ERPSYS."],
    "Replace Department Office Hours": ["departmentId — Required department identifier in the request body.", "windows — Required list of schedule entries. An empty list clears the schedule. At most 100 entries can be sent; no more than 30 may remain after past dated entries are removed.", "kind — WEEKLY for regular hours, EXTRA for additional hours on a date, or CANCEL for a closed date.", "weekday — Required for WEEKLY; use 1 for Monday through 7 for Sunday.", "date — Required for EXTRA and CANCEL, in YYYY-MM-DD form.", "startMinute and endMinute — Required for WEEKLY and EXTRA. Count minutes from midnight on a 30-minute grid. Start at 0 or later; end at 1440 or earlier. Each period must last at least 30 minutes. Times use Asia/Manila."],
    "Start an Authorized Upload": ["route — Required upload purpose: evidenceImage, mugshotCapture, or stampImage.", "mime — Required file type: image/jpeg, image/png, image/webp, or application/pdf.", "size — Required file size in bytes. Evidence and mugshot files may be up to 10 MiB; stamp files may be up to 5 MiB.", "stepCode — Required for evidenceImage. Do not send studentProfileId for this route.", "studentProfileId — Required for mugshotCapture and stampImage. Use the student's profile identifier."],
    "Save Integration Credential Overrides": ["key — Required service key in the endpoint address. Better Auth is locked and cannot be edited.", "version — Required current revision number, zero or greater, in the request body. Read it from the service settings first.", "values — Required group of permitted credential field names and replacement values. Each value may contain at most 4,096 characters. Leave a field out to keep it; use null to remove an override. Do not send empty strings."],
    "Check Integration Credentials Before Saving": ["key — Required supported service key in the endpoint address. Better Auth is locked.", "version — Required current revision number, zero or greater.", "values — Required group of credential names and proposed values. Each value may contain at most 4,096 characters or be null. The same field and pairing rules apply as when saving."],
    "Replace an Adviser's Assignments": ["adviserId — Required adviser account identifier in the endpoint address.", "assignments — Required list of up to 50 department assignments. This replaces the whole assignment list.", "departmentId — Required for each assignment.", "yearLevels — Optional list for each assignment, using FIRST, SECOND, THIRD, FOURTH, or FIFTH. An empty list means all offered year levels."],
    "Stream an Enrollment Assistant Reply": ["messages — Required list of 1–20 messages in the request body.", "role — Required for each message: user or assistant. The older value model is also accepted as assistant.", "text — Required message text, 1–2,000 characters per message. The whole request may not exceed 100 KB."],

}

NOTES = {
    "Send an Email Sign-In or Verification Code": ["Email delivery must be enabled and configured. Codes last five minutes, allow three incorrect guesses, and work once. Sign-in codes do not create accounts. Hide the code in screenshots."],
    "Sign In with an Email Code": ["Request a sign-in code first for an existing, unblocked account. This also proves email ownership. For staff or administrator permissions, verify the resulting session rather than assuming a typed email grants a role."],
    "Verify an Account Email Address": ["Request an email-verification code first. Initial verification of a privileged staff or administrator email removes unproven password credentials and ends existing sessions. Sign in again using an email code or Google to receive the permitted role."],
    "Read the Officer or Administrator Overview": ["Use an SBO officer or administrator account. A student or adviser session receives access denied even though a sign-in session exists."],
    "Complete Google Sign-In": ["Let Google supply the callback code and state through the actual sign-in flow. Do not invent these values or reuse an already-consumed callback."],
    "Complete Calendar Authorization": ["Start calendar authorization and finish Google's consent flow in the same signed-in browser. A 302 redirect to calendar=error is not a successful connection."],
    "Complete Enrollment from a Queue Entry": ["Use a current-year queue-entry identifier. All five earlier requirements must be verified, and this same assigned adviser must currently be serving the student. Repeating an already-completed entry returns already."],
    "Capture and Verify a Mugshot": ["Use an existing, unverified MUGSHOT requirement-review identifier for the active year, not the student-profile identifier. Save the photo reference first. Revoke an existing approval before recapturing."],
    "Withdraw a Verification": ["Use a currently VERIFIED requirement in the active enrollment year. Revoking a pending or returned requirement is refused."],
    "Return a Submission with Feedback": ["Use an existing requirement in the active year that is not VERIFIED. Revoke an approval before returning the requirement with feedback."],
    "Read My Completed Enrollment Record": ["Capture after enrollment is verified for the active year. Before then, a successful request returns null rather than a completed record."],
    "Read Authorized File Content": ["Use an actual completed private-storage upload identifier and an account allowed to view it. This endpoint returns file bytes, not JSON."],
    "Restore Configured Credential Defaults": ["Requires the administrator security unlock. This removes saved overrides and may disrupt a connected service. Use test settings only. Better Auth cannot be changed."],
    "Sign In with Email and Password": ["A blocked account cannot sign in. Password sign-in and registration share a limit of 20 attempts per five minutes for an internet address."],
    "Register a Student Account": ["University student-email accounts use Google sign-in instead. The selected school year must exist but does not have to be active. A blocked account using the same identity may be replaced. Some placement failures currently appear as a server error."],
    "Sign Out": ["For advisers, signing out also closes their open availability, releases active service, and removes their department assignments."],
    "Request an Emailed Password-Reset Link": ["The reset link lasts one hour. The current forgot-password screen directs students to staff instead of calling this endpoint. A confirmation does not prove delivery, and redirectTo does not change the application's emailed destination."],
    "Consume a Password-Reset Token": ["The token can be used only once. All existing sessions for the account are ended after this reset. Sign in again before capturing protected endpoints."],
    "Confirm the Administrator PIN": ["Security checks run in order: PIN, password when the account has one, email code, then authenticator or backup code. Each completed step must still be fresh. PIN attempts are limited to eight per account and sixty overall per fifteen minutes."],
    "Confirm the Administrator Password": ["Complete the PIN step first. Accounts without a password skip this step. Password attempts are limited to eight per fifteen minutes per account."],
    "Send Administrator Confirmation Email": ["Complete the preceding security steps first. The code lasts ten minutes. Wait sixty seconds before requesting another. A production email failure clears the verification steps."],
    "Verify the Emailed Administrator Code": ["Complete the preceding security steps first. Each sent code allows up to five attempts. Request another code if it is expired or used."],
    "Prepare Authenticator Enrollment": ["Complete the email-code step first. Keep the setup address and backup codes private. Setup alone does not unlock protected settings. An already-enrolled account must use the authorized reset process instead."],
    "Verify the Authenticator Code": ["Complete the email-code step first. The first successful check finishes authenticator setup. A trusted-device request is not accepted. Five failed authenticator or backup-code attempts require starting again from the PIN."],
    "Use a One-Time Authenticator Backup Code": ["Complete the email-code step first. Each backup code works once. It cannot finish an incomplete authenticator setup. Authenticator and backup-code checks share a five-attempt limit."],
    "Read Integration Availability and Configuration": ["Viewing settings does not require the extra security unlock. Secret fields show masks rather than actual values. Turning an optional service on does not prove its credentials are ready. Better Auth is always enabled."],
    "Enable or Disable an Integration": ["Complete the administrator security unlock before changing a switch. Better Auth cannot be changed and returns INTEGRATION_LOCKED."],
    "Save Integration Credential Overrides": ["Complete the administrator security unlock first. Paired fields must be submitted together when changed. Supported services check credentials before saving. Unchanged values do not increase the revision. Credential checks, saves, and resets share a ten-attempt-per-minute limit. Better Auth is locked. Check the restart notice after saving."],
    "Check Integration Credentials Before Saving": ["This check does not save values and does not require the extra security unlock. It checks required fields, matching pairs, formats, and supported provider connections using the draft and existing values. It shares the credential-attempt limit. A successful check is not a saved change."],
    "Read User-Directory Report Data": ["At most 1,000 report rows are returned. Check the matched count and shortened-results notice before presenting the report as complete."],
    "Read Department-Roster Report Data": ["At most 1,000 rows are returned. Summary totals describe the returned rows. The separate total-count endpoint ignores progress-group filters, so its totals can differ. Without a selected year, the result is empty."],
    "Read Uncapped Roster Totals": ["These totals have no report row limit. Progress-group filters are not applied; other supported roster filters still apply."],
    "Read Step-Register Report Data": ["At most 1,000 rows are returned. The website creates the PDF from these rows."],
    "Read Roster Rows and Summary Together": ["The summary does not use progress-group filters. Its totals can therefore differ from a filtered student list."],
    "Search Students or Read the Roster": ["Administrators normally receive the account directory. Advisers receive a roster and use cursor to continue the list; page does not move that roster. Officers receive student-search choices, and an empty q gives no choices. Keep pageSize and limit equal. Repeat a filter name to choose several values; do not join the values with commas. Choosing scope all is a list filter, not a new permission."],
    "Read My Enrollment Progress": ["A missing profile or active year is shown in the result rather than always treated as an error. Without an active year, the year is empty and progress totals are zero."],
    "Read a Student's Enrollment Detail": ["Staff access is required. For advisers, scope mine checks the department when placement exists. The implemented scope all option skips that particular department check; do not describe access as always limited to one department."],
    "Read a Student's Record-Sheet Data": ["Staff can read an incomplete record. Adviser scope checks work as in the student-detail endpoint. The website uses the returned information to prepare a PDF."],

    "Restore a Removed Queue Entry": ["Copy the removal information without changing it. The website offers Undo for five seconds; the server accepts its signed token for up to sixty seconds. The student's original joining time is kept."],
    "Read Upload Session Status": ["Only users allowed to see the upload can check it. Passing the expiry time alone does not change the status to abandoned."],
    "Finalize an Upload": ["Start a session, PUT the actual file bytes to its returned uploadUrl with the matching content type and size, then finalize using that uploadId. Starting a session alone is not an uploaded file. Repeating a completed upload is accepted."],
    "Revert Multiple Completed Enrollments": ["Entries are checked first, then reversed one at a time. A later failure must not be treated as proof that all earlier changes were undone."],
    "Save an External Evidence Link": ["A different address adds another link. This endpoint does not itself reject an already-verified step. Saving a link is separate from submitting the requirement."],

}
