# ERPSYS — API Documentation

## Purpose and Scope

This document describes the API exposed by the current application, including uncommitted changes present during reconciliation. Chapters 1–5 remain in the separate final paper. This is a contract review, not a claim that every example was executed against a deployed service.

**Base address:** `http://localhost:3001` for local development. Replace the address for a hosted system. Endpoint entries show origin-relative paths. Identifiers and secrets in angle brackets are placeholders and must be replaced privately; never include actual credentials or private student information in screenshots.

**Coverage:** Each currently mounted concrete resource method/path appears once. Authentication is delegated to Better Auth 1.6.27; the authentication section documents application-used entry points and custom checks, not every possible library-internal operation.

## Access and Request Conventions

- **Session authentication:** Send the signed-in browser's cookie. Browser requests normally include credentials. A human role label is explanatory, not an authorization token or literal account-role value.
- **Student-facing access:** Students, SBO officers, and administrators may enter that working area. Enrollment advisers do not automatically have student-facing access.
- **Officer access:** SBO officers and administrators. Adviser access means enrollment advisers and administrators, subject to any handler-specific department or year-level checks.
- **Administrator access:** Only administrators. Viewing protected settings does not grant permission to change them; sensitive integration actions require a separate temporary unlock.
- **Role-valued fields:** Internal account-role codes are intentionally omitted. For role updates/filters, use the account-management client to send its permitted value. Do not replace it with a human-readable label or treat the examples as a complete role-enum specification.
- **JSON bodies:** Use Content-Type: application/json, including business bodies on DELETE operations when listed. The main resource parser has a 1 MiB limit; the assistant has its own 100 KB limit. Authentication parsing is library-managed.
- **Unknown input fields:** Most resource object schemas strip unrecognized fields; they do not generally reject them. Only documented fields should be relied on. Authentication schemas have their own behavior.
- **Pagination:** Defaults and caps differ by endpoint. A returned page/pageSize does not guarantee every small-list handler slices its data. Read the endpoint notes.

## Responses, Errors, and Concurrency

Versioned JSON helpers return a single object or a list as follows. The actual data shape is described per endpoint; these are structural examples, not captured results.

```json
{"data":{"id":"example"},"ts":1780000000000}
```

```json
{"data":[],"page":1,"pageSize":50,"total":0,"ts":1780000000000}
```

Authentication responses, basic health, binary files, redirects, and assistant streams do not use this versioned helper envelope. Standard resource errors use a string error and optional data, not an error object containing code/message:

```json
{"error":"Request failed.","data":{"code":"TS_ABORTED","ts":1780000000000}}
```

The optional data object is not present on every error. Server error names are not generally serialized as top-level codes. Production often replaces detailed business messages with generic status text; examples of conditions below do not promise exact production wording. Storage-quota responses and authentication errors have explicitly different shapes.

Versioned business requests use transaction timestamps. A write may include the ts returned with the data being edited; the middleware consumes it before business-body validation. It must be a positive safe integer issued by the running server. Omit it to start a fresh server-anchored operation. A stale read or write can return HTTP 409 with data.code TS_ABORTED. Keep unsaved drafts and reload the affected records before retrying; a batch must not be assumed rolled back. Eligible server-started requests restart up to three times only before writing. Ordering is designed for one application process, not a multi-server transaction service. Advisory editing-presence operations run outside business timestamp ordering and do not advance business read/write stamps; presence is not a record lock.

Shared resource failures include 400 for invalid request input/timestamp; 401 for no session; 403 for permission failure; 404 for missing resources; 409 for conflicting state; 412 for unmet prerequisites; 413 for body/file limits; 429 for request limits; and 500/502/503 for internal/provider/service failures as applicable. Successful authorization does not bypass business-state checks.

Resource requests share a 300-request-per-minute budget keyed by session fingerprint and IP. Credential sign-in/registration has a separate 20-attempt-per-five-minute IP budget. Upload, calendar, credential-editing, and assistant limits are described with their endpoints. Rate-limit responses can include Retry-After; standard 503 errors set Retry-After to five seconds. These limits are per-process controls, not measured capacity claims.

## Retired and Non-API Paths

Only the basic health endpoint is currently mounted for operations. Readiness, metrics, queue live-event streaming, and generated OpenAPI endpoints from the earlier manuscript are not exposed by the current server. Do not use those earlier sections as test instructions. The website documentation page is a frontend route, not a generated API explorer. Queue updates use resource reads; the assistant remains a separate stream.

## 1. Authentication and Administrator Verification

Authentication endpoints return library-owned JSON or redirects rather than data/ts envelopes. Capture actual headers and cookies from the configured version when producing evidence. The administrator confirmation chain is PIN → password, when present → emailed code → authenticator or backup code. Step freshness is ten minutes; final success grants a five-minute sensitive-action unlock. It is not an ordinary sign-in-wide MFA challenge. Other two-factor operations are forbidden by the application's allowlist.

### 1.1. Sign In with Email and Password

**Method:** POST

**Endpoint:** `/api/auth/sign-in/email`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public

**Parameters:** Body: email and password, required. Optional callbackURL and rememberMe. Supply a valid Turnstile token through cf-turnstile-response, turnstileToken, or the matching header when the configured auth check requires it.

**Success:** HTTP 200. Better Auth sign-in result with user/token information and session cookie.

**Behavior:** Credential requests share a 20-attempt IP budget per five minutes. Blocked users cannot create new sessions. This response is not a versioned data/ts envelope.

**Additional failure conditions:** 400 invalid challenge/body; 401 invalid credentials; 403 blocked account; 429 repeated attempts.

**Illustrative request body:**

```json
{
  "email": "student@example.org",
  "password": "<account password>",
  "turnstileToken": "<fresh challenge token>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.2. Register a Student Account

**Method:** POST

**Endpoint:** `/api/auth/sign-up/student`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public

**Parameters:** Body: name (nonempty), studentNumber (trimmed digits only), email (valid email), password (8–128 characters), academicYearId, departmentId, yearLevel (FIRST/SECOND/THIRD/FOURTH/FIFTH), required. Optional cf-turnstile-response or turnstileToken (1–2,048 characters).

**Success:** HTTP 200. { token, user }, with session cookie; HTTP 200.

**Behavior:** Creates profile and placement and signs in. University student-email accounts use Google instead of this password-registration route. A blocked account owning the email/number can be replaced. The year must exist but need not be active. Placement errors currently may surface as generic 500 because of error adaptation, even for unsuitable course/year selections; do not promise every placement failure is a 400.

**Additional failure conditions:** 400 malformed/duplicate identity or university email requiring Google; 429 credential-request budget; 500 possible placement/persistence failure.

**Illustrative request body:**

```json
{
  "name": "Example Student",
  "studentNumber": "202600001",
  "email": "student@example.org",
  "password": "<new password>",
  "academicYearId": "year-example",
  "departmentId": "department-example",
  "yearLevel": "FIRST",
  "turnstileToken": "<fresh challenge token>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.3. Standard Password Signup Is Disabled

**Method:** POST

**Endpoint:** `/api/auth/sign-up/email`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public

**Parameters:** Standard library signup is not the supported student-registration path.

**Expected outcome:** HTTP 400; registration is deliberately disabled. No successful registration through this endpoint.

**Behavior:** Use the custom student signup route. An HTTP request here is deliberately rejected.

**Additional failure conditions:** 400 rejected registration.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.4. Begin Google Sign-In

**Method:** POST

**Endpoint:** `/api/auth/sign-in/social`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public

**Parameters:** Body: provider: google; callbackURL for the permitted return destination. Other optional Better Auth redirect controls remain library-owned.

**Success:** HTTP 200. Better Auth provider authorization URL/redirect result; follow the configured flow.

**Behavior:** Google integration must be enabled. Do not treat this as a completed authenticated session before the provider callback succeeds.

**Additional failure conditions:** 412 Google sign-in disabled; provider errors use the authentication response format.

**Illustrative request body:**

```json
{
  "provider": "google",
  "callbackURL": "/"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.5. Complete Google Sign-In

**Method:** GET

**Endpoint:** `/api/auth/callback/google`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public provider callback

**Parameters:** Google supplies authorization code/state or error query parameters.

**Success:** HTTP 302. Authentication-library redirect and session handling.

**Behavior:** Validate the callback through the configured OAuth flow, not a hand-created code/state example. This callback is different from the optional calendar connection.

**Additional failure conditions:** OAuth state, code, account, or provider errors; redirects and library responses vary by outcome.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.6. Read the Current Sign-In Session

**Method:** GET

**Endpoint:** `/api/auth/get-session`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public; session cookie identifies a signed-in account

**Parameters:** No business body/query fields.

**Success:** HTTP 200. Session and user object, or null when signed out.

**Behavior:** Unwrapped authentication JSON, not data/ts. Session cookies are managed by the auth library.

**Additional failure conditions:** Authentication-library failures may occur.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.7. Sign Out

**Method:** POST

**Endpoint:** `/api/auth/sign-out`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Signed-in session for normal use

**Parameters:** No business body fields.

**Success:** HTTP 200. Authentication-library success; clears session cookie.

**Behavior:** The application hook also closes the adviser's open availability, releases active service, and removes adviser department assignments. Do not describe sign-out as only a browser-local action.

**Additional failure conditions:** Library session/origin errors.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.8. Request an Emailed Password-Reset Link

**Method:** POST

**Endpoint:** `/api/auth/request-password-reset`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public

**Parameters:** Body: email (required valid email), redirectTo (optional, trusted-origin restrictions).

**Success:** HTTP 200. { status: true, message } whether or not an account exists.

**Behavior:** The application sends a direct reset-page link with a one-hour token. A success response does not prove email delivery; production can log a delivery failure while still returning success. The current forgot-password screen directs users to staff rather than requesting this route itself. redirectTo does not alter the application's emailed destination.

**Additional failure conditions:** 400 malformed email or disallowed redirect; normal responses do not disclose account existence.

**Illustrative request body:**

```json
{
  "email": "student@example.org"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.9. Consume a Password-Reset Token

**Method:** POST

**Endpoint:** `/api/auth/reset-password`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public, authorized by reset token

**Parameters:** Body: newPassword (required, 8–128 characters), token (body or query; one required; nonempty body value takes precedence).

**Success:** HTTP 200. { status: true }.

**Behavior:** Consumes the token once. Creates password credentials if absent. The configured application does not revoke existing sessions after this reset.

**Additional failure conditions:** 400 invalid/expired/consumed token or password length.

**Illustrative request body:**

```json
{
  "token": "<token from reset email>",
  "newPassword": "<new password>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.10. Library Password-Reset Callback

**Method:** GET

**Endpoint:** `/api/auth/reset-password/:token`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public token callback

**Parameters:** Path: token. Required query: callbackURL, subject to trusted-origin rules.

**Success:** HTTP 302. 302 redirect carrying token, or error=INVALID_TOKEN.

**Behavior:** The library callback is available, but application reset emails link directly to the website reset page.

**Additional failure conditions:** Invalid callback/token produces a redirect error rather than a JSON success.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.11. Read Sensitive-Action Verification Status

**Method:** GET

**Endpoint:** `/api/auth/admin-gate/status`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session

**Parameters:** No business body/query fields.

**Success:** HTTP 200. { unlocked, unlockedUntil, next, enrolled }.

**Behavior:** next is pin/password/code/totp. Use unlocked to decide whether protected integration operations are available; next alone is not authorization.

**Additional failure conditions:** 401 signed out; 403 not administrator.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.12. Confirm the Administrator PIN

**Method:** POST

**Endpoint:** `/api/auth/admin-gate/pin`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session

**Parameters:** Body: pin, exactly six decimal digits.

**Success:** HTTP 200. { ok: true }.

**Behavior:** Starts/restarts PIN → password → emailed code → authenticator verification. Passwordless accounts automatically satisfy the password step. PIN budgets: eight per user and sixty globally per fifteen minutes.

**Additional failure conditions:** 400 malformed PIN; 403 incorrect; 429 budget exhausted; 503 PIN unconfigured.

**Illustrative request body:**

```json
{
  "pin": "<six-digit administrator PIN>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.13. Confirm the Administrator Password

**Method:** POST

**Endpoint:** `/api/auth/admin-gate/password`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session

**Parameters:** Body: password, 1–128 characters.

**Success:** HTTP 200. { ok: true }.

**Behavior:** Requires fresh PIN. Skip for passwordless accounts rather than sending an empty password. Eight attempts per fifteen minutes per account.

**Additional failure conditions:** 403 STEP_ORDER; 400 invalid password; 429 limit.

**Illustrative request body:**

```json
{
  "password": "<administrator password>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.14. Send Administrator Confirmation Email

**Method:** POST

**Endpoint:** `/api/auth/admin-gate/code/send`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session

**Parameters:** No business body fields.

**Success:** HTTP 200. { ok: true }.

**Behavior:** Requires the fresh password step, including automatic passwordless satisfaction. Code freshness is ten minutes; wait sixty seconds before resending. Production delivery failure clears the chain.

**Additional failure conditions:** 403 STEP_ORDER; 429 resend too soon; 503 production delivery failure.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.15. Verify the Emailed Administrator Code

**Method:** POST

**Endpoint:** `/api/auth/admin-gate/code/verify`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session

**Parameters:** Body: code, exactly six decimal digits.

**Success:** HTTP 200. { ok: true }.

**Behavior:** Five attempts per sent code; expired or consumed codes must be replaced. Auth ordering errors expose a STEP_ORDER code but do not preserve every service-level detail.

**Additional failure conditions:** 403 STEP_ORDER; 400 wrong, expired, absent, consumed, or exhausted code.

**Illustrative request body:**

```json
{
  "code": "<six-digit emailed code>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.16. Prepare Authenticator Enrollment

**Method:** POST

**Endpoint:** `/api/auth/two-factor/enable`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session after email-code verification

**Parameters:** Body: password (schema-optional, required when the account has password credentials); issuer (optional, default ERPSYS).

**Success:** HTTP 200. { totpURI, backupCodes }.

**Behavior:** Returns setup material and normally ten backup codes. Keep both private. Does not unlock integrations until final verification. Already-enrolled users must use authorized reset rather than re-enable.

**Additional failure conditions:** 403 STEP_ORDER/already enrolled; 400 invalid required password.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.17. Verify the Authenticator Code

**Method:** POST

**Endpoint:** `/api/auth/two-factor/verify-totp`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session after email-code verification

**Parameters:** Body: code (required string, six-digit 30-second authenticator code); trustDevice (optional, true rejected).

**Success:** HTTP 200. { token, user }; may rotate the session cookie.

**Behavior:** First successful verification completes enrollment. Success unlocks protected integration actions for five minutes. This is step-up authorization, not a mandatory MFA sign-in redirect.

**Additional failure conditions:** 403 STEP_ORDER; 400 setup absent/trusted device requested; 401 invalid code; 429 after five shared authenticator/backup attempts, requiring restart from PIN.

**Illustrative request body:**

```json
{
  "code": "<current authenticator code>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 1.18. Use a One-Time Authenticator Backup Code

**Method:** POST

**Endpoint:** `/api/auth/two-factor/verify-backup-code`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Administrator session after email-code verification

**Parameters:** Body: code (required); disableSession (optional boolean), trustDevice (optional; true rejected).

**Success:** HTTP 200. { token, user }.

**Behavior:** Consumes one backup code and grants the five-minute unlock. It is not equivalent to completing pending authenticator enrollment. Other two-factor operations are forbidden by the application allowlist.

**Additional failure conditions:** 400 backup setup absent; 401 invalid code; 403 STEP_ORDER; 409 concurrent use; 429 shared five-attempt chain budget.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


# 2. Application Resource API

Each endpoint below is mounted by the current application. Shared envelope, error, and concurrency rules apply unless a specific exception is stated.

## 2.1. Student Profiles and Records

### 2.1.1. Read My Profile-Completion Status

**Method:** GET

**Endpoint:** `/api/v1/me/student/profile`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: { hasProfile, studentNumber }.

**Behavior:** Does not require an active year.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.2. Search Students or Read the Roster

**Method:** GET

**Endpoint:** `/api/v1/students`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Optional query: q (max 100), page (default 1), pageSize and limit (1–100, each default 50), cursor, sort, dir (asc/desc, default desc), role, outside, academicYearId, departmentId, yearLevel. Optional query: academicYearId; scope (mine/all, default mine); sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt); dir (asc/desc); q (up to 100 characters); departmentIds, yearLevels, buckets, steps (repeat array query keys for multiple selections); stepState; enrolled (true/false); unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Success:** HTTP 200. data: role-dependent directory, roster, or student-picker rows, with page/pageSize/total.

**Behavior:** Staff only. Administrators normally receive the user directory; explicitly requesting scope, cursor, plural roster filters, enrolled, or unassigned selects roster mode. Advisers receive a cursor-based roster; page does not offset it. Officers receive a name/number picker, and blank q returns an empty list. Repeated query keys represent arrays; comma-separated strings are not split. Directory paging uses pageSize while metadata reports limit, so keep them equal. Roster scope all is an implemented filter, not a guarantee of department-only listing.

**Additional failure conditions:** 403 for a student account.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.3. Read Roster Rows and Summary Together

**Method:** GET

**Endpoint:** `/api/v1/students/board`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Optional query: academicYearId; scope (mine/all, default mine); sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt); dir (asc/desc); q (up to 100 characters); departmentIds, yearLevels, buckets, steps (repeat array query keys for multiple selections); stepState; enrolled (true/false); unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass. Optional cursor; limit 1–100, default 50.

**Success:** HTTP 200. data: { roster: { data, page: 1, pageSize, total }, stats: { year, stats } }.

**Behavior:** Adviser working area. The summary deliberately ignores bucket filters. Use only the documented step states; invalid states are not normalized consistently across rows and summaries.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.4. Send In-App Requirement Reminders

**Method:** POST

**Endpoint:** `/api/v1/students/reminders`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: studentProfileIds (required array, 1–200 nonempty identifiers); academicYearId (optional).

**Success:** HTTP 200. data: { sent, skipped }.

**Behavior:** Deduplicates IDs. Skips missing users/profiles, completed students, and students placed in a department not assigned to the caller. An unplaced profile may still receive a reminder. This sends in-app notices, not email or SMS.

**Additional failure conditions:** 412 if the year cannot be resolved.

**Illustrative request body:**

```json
{
  "studentProfileIds": [
    "profile-example"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.5. Read My Enrollment Progress

**Method:** GET

**Endpoint:** `/api/v1/me/student`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: { profile: { studentNumber, derivedStudentNumber, isOutsideOrg, enrollment, enrollments }, hasActiveYear, academicYearId, academicYearLabel, semesterLabel, steps, readyForQueue, allComplete, verifiedCount, progressPercent, queueStatus }.

**Behavior:** Each step includes code/name/order/status, hint/chip, appliedAt, evidence, requirements, profilingFormUrl, socialMediaLinks, reply, and stamp. Missing profile/year is represented in the payload rather than automatically returning 412. No active year means null year fields and zero/false progress.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.6. Claim My Student Number

**Method:** PATCH

**Endpoint:** `/api/v1/me/student`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: studentNumber (required trimmed, nonempty digits-only string).

**Success:** HTTP 200. data: { studentNumber }.

**Behavior:** Claims a missing profile; it does not replace an already-saved number. Existing profile numbers are returned unchanged. No fixed nine-digit limit is enforced.

**Additional failure conditions:** 412 without active year; 409 for a number already owned.

**Illustrative request body:**

```json
{
  "studentNumber": "202600001"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.7. Read a Student's Record-Sheet Data

**Method:** GET

**Endpoint:** `/api/v1/students/:id/record`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: id is a student-profile identifier. Optional query: academicYearId, scope (mine/all, default mine).

**Success:** HTTP 200. data: { student: { name, email, studentNumber, isOutsideOrg, createdAt }, year, enrollment, enrolledAt, steps, queue }.

**Behavior:** Staff only, with the same adviser scope behavior as detail. Can return an incomplete record; unlike the student's own download, completion is not required. JSON supports website PDF generation.

**Additional failure conditions:** 403 scope/access failure; 404 missing profile; 412 unresolved year.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.8. Capture and Verify a Mugshot

**Method:** PUT

**Endpoint:** `/api/v1/students/:id/mugshot`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id is a step-verification identifier, despite the students path. Body: fileKey (required string, 1–500 characters), fileUrl (required string, 1–2,000,000 characters).

**Success:** HTTP 200. data: { verificationId, status: VERIFIED, uploadId }.

**Behavior:** Officer working area. The fileUrl field is not URL-validated here. Creates an upload, attaches it, and immediately verifies the mugshot step; do not send a student-profile ID as id.

**Additional failure conditions:** 404 missing verification; 412 no active year; 409 wrong step, archived year, or already verified.

**Illustrative request body:**

```json
{
  "fileKey": "capture-example",
  "fileUrl": "https://example.org/demo-photo.jpg"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.9. Read a Student's Enrollment Detail

**Method:** GET

**Endpoint:** `/api/v1/students/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: id is a student-profile identifier. Optional query: academicYearId, scope (mine/all, default mine).

**Success:** HTTP 200. data: { student, year, enrollment, steps, queue, pendingRequirements }.

**Behavior:** Staff only. For advisers, mine checks assigned department when placement exists; all bypasses that particular scope check in the current implementation. Other staff use all. Do not describe this as unconditional department-only access.

**Additional failure conditions:** 403 for a student or out-of-scope adviser; 404 missing profile; 412 unresolved year.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.10. Read My Completed Enrollment Record

**Method:** GET

**Endpoint:** `/api/v1/me/record`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: { student: { name, email, studentNumber, isOutsideOrg, createdAt }, year, enrollment, enrolledAt, steps, queue }, or null.

**Behavior:** Returns null unless the active year's enrollment step is verified. No profile/year also produces null. JSON is formatted as a PDF by the website.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.1.11. Request Assessment Review

**Method:** POST

**Endpoint:** `/api/v1/me/assessment`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: { status: APPLIED }, or { status: VERIFIED } if already verified.

**Behavior:** No evidence-upload body is required. Internally this creates or reopens pending assessment review; do not infer the saved status from the APPLIED response alone.

**Additional failure conditions:** 412 no active year/profile; 404 assessment step not configured.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.2. Enrollment Placement and Completion

### 2.2.1. List My Enrollment Periods

**Method:** GET

**Endpoint:** `/api/v1/me/enrollments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: [{ academicYearId, academicYearLabel, semesterLabel, departmentId, departmentName, departmentCode, yearLevel, isActiveYear }], page: 1, pageSize: row count, total: row count.

**Behavior:** No consumed paging query. Sorted by enrollment-period creation time. No profile returns an empty list.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.2.2. Save My Enrollment Placement

**Method:** POST

**Endpoint:** `/api/v1/me/enrollments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: academicYearId, departmentId, yearLevel (all required). Optional studentNumber (trimmed digits-only string). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 200. data: { enrollment, studentNumber }.

**Behavior:** Accepts an existing year, not only the active year. Existing number is retained. Changed placement is refused if a queue entry exists, including completed entries. Unchanged placement is accepted without the change checks.

**Additional failure conditions:** 400 invalid year/department/level or missing number; 409 number collision or changed placement with queue activity.

**Illustrative request body:**

```json
{
  "academicYearId": "year-example",
  "departmentId": "department-example",
  "yearLevel": "FIRST",
  "studentNumber": "202600001"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.2.3. Revert Multiple Completed Enrollments

**Method:** DELETE

**Endpoint:** `/api/v1/enrollments/completions`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId and reason (10–500 characters), required. Supply enrollmentIds and/or ids arrays; combine to 1–50 distinct queue-entry identifiers.

**Success:** HTTP 200. data: { revertedCount, revertedIds, returnedEntryIds }.

**Behavior:** Validates entries before sequential reversions. It is not a multi-record all-or-nothing database transaction.

**Additional failure conditions:** 400 empty/over-limit selection; same permission/state errors as individual reversion.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "enrollmentIds": [
    "queue-example"
  ],
  "reason": "Enrollment marked complete in error."
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.2.4. Complete Enrollment from a Queue Entry

**Method:** POST

**Endpoint:** `/api/v1/enrollments/:id/completion`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id is a queue-entry identifier, not a student-profile or placement identifier. Body: departmentId (required).

**Success:** HTTP 200. data: { entryId, studentName, outcome: enrolled|already }.

**Behavior:** Checks current-year department/year-level responsibility and the current serving adviser. Completed entries can return outcome already after permission checks.

**Additional failure conditions:** 403 assignment/current-server failure; 404 missing/wrong department entry; 409 wrong year/status, missing verified prerequisites, or concurrent transition; 412 no active year.

**Illustrative request body:**

```json
{
  "departmentId": "department-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.2.5. Revert One Completed Enrollment

**Method:** DELETE

**Endpoint:** `/api/v1/enrollments/:id/completion`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id is a queue-entry identifier. Body: departmentId and reason (10–500 characters), both required.

**Success:** HTTP 200. data: { enrollmentId, reverted: true, returnedEntryId }.

**Behavior:** Returns the same entry to the front of the waiting line and withdraws enrollment verification.

**Additional failure conditions:** 403 assignment failure; 404 missing entry; 409 wrong year/not completed/racing update; 412 no active year.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "reason": "Enrollment marked complete in error."
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.3. Evidence and Requirement Submission

### 2.3.1. Attach File Metadata to a Requirement

**Method:** POST

**Endpoint:** `/api/v1/evidence`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: stepCode (SOCIAL_MEDIA/PROFILING/MUGSHOT/CONSENT), fileKey (1–500 characters), fileUrl (valid URL, at most 1,000 characters), all required.

**Success:** HTTP 201. data: { evidence: [{ id, fileKey, fileUrl, kind, expiresAt, expired }] }.

**Behavior:** Records the supplied key/URL; this call does not verify stored bytes exist. Without a verification, returns the new draft; with one, returns attached evidence. Adding to a returned verification changes it to submitted.

**Additional failure conditions:** 404 step not configured; 409 if verified, including a concurrent verification.

**Illustrative request body:**

```json
{
  "stepCode": "SOCIAL_MEDIA",
  "fileKey": "demo-file",
  "fileUrl": "https://example.org/demo-evidence.png"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.3.2. Delete My Upload Metadata

**Method:** DELETE

**Endpoint:** `/api/v1/evidence/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Path: id is the upload identifier.

**Success:** HTTP 200. data: { deleted: true }.

**Behavior:** Checks ownership and verified-step restrictions. Removes the upload row; existing verification identifier references are not rewritten by this handler. Object deletion is best-effort.

**Additional failure conditions:** 404 absent/not owned; 409 if protected by verified active-year work.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.3.3. Save an External Evidence Link

**Method:** PUT

**Endpoint:** `/api/v1/me/evidence-link`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: stepCode (SOCIAL_MEDIA/PROFILING/MUGSHOT/CONSENT), url (valid URL, at most 1,000 characters), both required.

**Success:** HTTP 200. data: { evidence: [{ id, fileKey, fileUrl, kind, expiresAt, expired }] }.

**Behavior:** Stores/upserts the link but does not itself create a verification or submit the requirement. Returns all external links for the profile, not only this step. A different URL adds another link. This handler does not itself reject a verified step.

**Illustrative request body:**

```json
{
  "stepCode": "SOCIAL_MEDIA",
  "url": "https://example.org/demo-proof"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.3.4. Remove External Evidence Links

**Method:** DELETE

**Endpoint:** `/api/v1/me/evidence-link`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: stepCode (required upload-capable step code).

**Success:** HTTP 200. data: { evidence: [{ id, fileKey, fileUrl, kind, expiresAt, expired }] }.

**Behavior:** Without a verification, removes links for that step and returns remaining file drafts of that kind. With a verification, removes its referenced external links and may delete an empty verification.

**Additional failure conditions:** 404 if step is not configured; 409 if verified.

**Illustrative request body:**

```json
{
  "stepCode": "SOCIAL_MEDIA"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.3.5. Submit a Requirement for Review

**Method:** POST

**Endpoint:** `/api/v1/me/steps/:code/submission`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Path: code is SOCIAL_MEDIA, PROFILING, MUGSHOT, or CONSENT. No business body fields.

**Success:** HTTP 201. data: { status: SUBMITTED, evidence: [...] }.

**Behavior:** For profiling, checks the latest Google Form response matching the session email; screenshots/links are not the profiling completion check. Other steps collect eligible non-expired uploads and step links. Profiling evidence may be empty.

**Additional failure conditions:** 404 unconfigured step; 409 verified; 412 absent/expired evidence, missing form, or no matching response; 503 Forms disabled.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.3.6. Cancel a Submitted Requirement

**Method:** DELETE

**Endpoint:** `/api/v1/me/steps/:code/submission`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Path: code is an upload-capable step. No business body fields.

**Success:** HTTP 200. data: { status: PENDING }.

**Behavior:** Deletes a submitted verification and retains eligible file evidence as drafts with a fresh 24-hour expiry.

**Additional failure conditions:** 404 step/submission missing; 409 unless status is submitted.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.4. Private Uploads and File Access

### 2.4.1. Start an Authorized Upload

**Method:** POST

**Endpoint:** `/api/v1/storage/session`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Body: route (evidenceImage/mugshotCapture/stampImage), mime (string, max 100), size (positive integer bytes), all required. evidenceImage requires stepCode and forbids studentProfileId. mugshotCapture and stampImage require studentProfileId. Supported MIME: image/jpeg, image/png, image/webp, application/pdf. Effective caps: 10 MiB evidence/mugshot, 5 MiB stamp (even though the generic size schema allows up to 100 MiB).

**Success:** HTTP 201. data: { uploadId, uploadUrl, sessionExpiresAt }.

**Behavior:** Student-facing access for evidenceImage; officer access for capture/stamp. Requires active year and applicable profile/email ownership checks. Student upload email must be the university student domain; officer-target uploads require a student with that domain. Upload directly to the returned URL, then finalize. Sessions last 24 hours. Twenty mint requests per minute per user/IP. Storage outages/quotas return a direct { code: STORAGE_QUOTA_EXCEEDED, message } body, not the standard error wrapper.

**Additional failure conditions:** 400 invalid route fields; 403 role/owner/email; 404 profile/step; 409 verified step; 412 no active year/profile; 413 file too large; 415 MIME unsupported; 429 limit; 502 presign failure; 503 disabled/paused storage or byte/operation quota.

**Illustrative request body:**

```json
{
  "route": "evidenceImage",
  "stepCode": "SOCIAL_MEDIA",
  "mime": "image/png",
  "size": 1024
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.4.2. Finalize an Upload

**Method:** POST

**Endpoint:** `/api/v1/storage/complete`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Body: uploadId (required); stepCode (optional string, 1–64 characters).

**Success:** HTTP 200. data: { id, fileKey, fileUrl, kind, expiresAt, expired: false }.

**Behavior:** Checks visibility and stored object metadata. Normal object-storage completion uses fileKey with a storage reference and fileUrl null. Repeated completion of an already-complete row is accepted. An expired timestamp alone is not an explicit rejection in this handler; do not rely on it as an expiry-enforcement promise.

**Additional failure conditions:** 403 not visible; 404 upload/bytes absent; 400 conflicting step; 409 wrong backend; 422 MIME/size verification failure.

**Illustrative request body:**

```json
{
  "uploadId": "upload-example",
  "stepCode": "SOCIAL_MEDIA"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.4.3. Read Upload Session Status

**Method:** GET

**Endpoint:** `/api/v1/storage/session-status`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Required query: uploadId.

**Success:** HTTP 200. data: { status: pending|complete|abandoned, bytesReceived?, r2Key? }.

**Behavior:** Uploader, profile owner, officer, and administrator have applicable visibility. Advisers have department-related visibility and some unplaced-student access; this is not access to all uploads. bytesReceived is conditional. Time expiry alone does not change status here.

**Additional failure conditions:** 403 not visible; 404 unknown upload.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.4.4. Read Authorized File Content

**Method:** GET

**Endpoint:** `/api/v1/uploads/:id/content`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: id is the upload identifier. Optional HTTP Range header.

**Success:** HTTP 200. 200 or 206 binary file content, not a JSON envelope.

**Behavior:** Uses the upload visibility checks. Content-Disposition is inline; storage MIME and range headers are forwarded when available. Current cache policy is private, immutable for one year. Missing/non-storage rows fall through to not-found handling.

**Additional failure conditions:** 403 unauthorized; 404 missing/unusable upload.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.5. Officer Review

### 2.5.1. List Requirement Submissions

**Method:** GET

**Endpoint:** `/api/v1/submissions`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Optional query: step (ASSESSMENT, SOCIAL_MEDIA, PROFILING, MUGSHOT, CONSENT); page (default 1), pageSize (1–100, default 50); sort (submittedAt, studentName, status; default submittedAt); dir (asc/desc, default asc); q (up to 100 characters); status (ALL, PENDING, SUBMITTED, VERIFIED, RETURNED); evidence (ALL, HAS, NONE); range (ALL, today, 7d, 30d, year).

**Success:** HTTP 200. data: submission rows, with list metadata.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.5.2. Read a Submission in Full

**Method:** GET

**Endpoint:** `/api/v1/submissions/:verificationId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: verificationId is a step-verification identifier.

**Success:** HTTP 200. data: { verificationId, step, student, status, submittedAt, appliedAt, answers, evidence, requirements, stamp, ...review history }.

**Additional failure conditions:** 404 if missing.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.5.3. Verify a Submission

**Method:** POST

**Endpoint:** `/api/v1/submissions/:id/verification`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id is a step-verification identifier. No business body fields.

**Success:** HTTP 200. data: { verificationId, status: VERIFIED }.

**Behavior:** Uses the officer's configured stamp; saved stamp changes use the separate stamp endpoint.

**Additional failure conditions:** 404 missing submission; 409 unsuitable review state or year.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.5.4. Withdraw a Verification

**Method:** DELETE

**Endpoint:** `/api/v1/submissions/:id/verification`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id is a step-verification identifier. No business body fields.

**Success:** HTTP 200. data: { verificationId, status: PENDING }.

**Additional failure conditions:** 404 missing submission; 409 unsuitable review state or year.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.5.5. Return a Submission with Feedback

**Method:** POST

**Endpoint:** `/api/v1/submissions/:id/replies`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id is a step-verification identifier. Body: chips (optional nonempty strings, at most ten, default []), note (optional string, max 500).

**Success:** HTTP 200. data: { verificationId, status: RETURNED }.

**Additional failure conditions:** 404 missing submission; 409 unsuitable review state or year.

**Illustrative request body:**

```json
{
  "chips": [
    "Unreadable evidence"
  ],
  "note": "Please submit a clearer image."
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.6. Queues and Adviser Service

### 2.6.1. Read My Queue Position

**Method:** GET

**Endpoint:** `/api/v1/me/queue`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: current queue state, or null.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.2. Join My Enrollment Queue

**Method:** POST

**Endpoint:** `/api/v1/me/queue`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: departmentId (required).

**Success:** HTTP 201. data: { entryId, departmentName, position }.

**Behavior:** Requires verified pre-enrollment steps, eligible course/year level, and a currently available adviser. Switching queues requires leaving the previous one first; opening a share link does not join automatically.

**Additional failure conditions:** 409 for unmet prerequisites, unsuitable queue state, or unavailable service.

**Illustrative request body:**

```json
{
  "departmentId": "department-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.3. Leave My Waiting Queue

**Method:** DELETE

**Endpoint:** `/api/v1/me/queue`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: { left: true }.

**Behavior:** Repeated exit when no entry exists is accepted. A student being served cannot leave.

**Additional failure conditions:** 409 while being served.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.4. Monitor My Department Queues

**Method:** GET

**Endpoint:** `/api/v1/queues`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: department queues and serving state.

**Behavior:** The current implementation uses resource reads; there is no mounted queue-event stream.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.5. Serve the Next Eligible Student

**Method:** POST

**Endpoint:** `/api/v1/queues/serving`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId and entryId (required nonempty identifiers).

**Success:** HTTP 201. data: { entryId, status }.

**Behavior:** Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

**Additional failure conditions:** 404 if entry is missing; 409 for a changed or unsuitable service state.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "entryId": "queue-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.6. Release the Served Student

**Method:** DELETE

**Endpoint:** `/api/v1/queues/serving`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId and entryId (required nonempty identifiers).

**Success:** HTTP 200. data: { entryId, status }.

**Behavior:** Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

**Additional failure conditions:** 404 if entry is missing; 409 for a changed or unsuitable service state.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "entryId": "queue-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.7. Move the Served Student to the End

**Method:** POST

**Endpoint:** `/api/v1/queues/serving/position`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId and entryId (required nonempty identifiers). Optional to: end.

**Success:** HTTP 200. data: { entryId, position }.

**Behavior:** Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

**Additional failure conditions:** 404 if entry is missing; 409 for a changed or unsuitable service state.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "entryId": "queue-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.8. Remove a Waiting Queue Entry

**Method:** POST

**Endpoint:** `/api/v1/queue-entries/:id/removal`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. No business body fields.

**Success:** HTTP 200. data: { removed, reason, snapshot: { entryId, departmentId, studentProfileId, academicYearId, joinedAt, studentName, token } }.

**Behavior:** Only waiting entries may be removed. Keep the returned snapshot unchanged for Undo. A concurrent change can return removed false with a reason, not a successful deletion.

**Additional failure conditions:** 404 if missing; 409 for served/completed or unsuitable entry state.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.6.9. Restore a Removed Queue Entry

**Method:** POST

**Endpoint:** `/api/v1/queue-entries/:id/restoration`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Body: departmentId, studentProfileId, academicYearId, joinedAt, studentName, token (all required; copy the removal snapshot).

**Success:** HTTP 200. data: { restored: true, entryId }.

**Behavior:** The website offers Undo for five seconds; server token validation allows a 60-second window. The token is signed for the removing adviser and snapshot. Restoration preserves joinedAt, not a client-selected queue number.

**Additional failure conditions:** 403 for invalid/expired token; 409 for a changed year or existing/rejoined entry; 404 for missing related data.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "studentProfileId": "profile-example",
  "academicYearId": "year-example",
  "joinedAt": "2026-08-01T01:00:00.000Z",
  "studentName": "Example Student",
  "token": "<token from removal response>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.7. Queue Invitations

### 2.7.1. Create a Queue Invitation

**Method:** POST

**Endpoint:** `/api/v1/queue-shares`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId (required).

**Success:** HTTP 201. data: { url, token, departmentId, departmentName, inviterName, academicYearId }.

**Behavior:** Requires an assigned adviser, active department/year, and configured public site address. Links are tied to the academic year, not documented as a fixed-duration expiry.

**Additional failure conditions:** 412 for missing or unsuitable public address/active year; 404 for missing/inactive department.

**Illustrative request body:**

```json
{
  "departmentId": "department-example"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.7.2. Resolve a Queue Invitation

**Method:** GET

**Endpoint:** `/api/v1/queue-shares/:token`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Path: token (1–2,000 characters).

**Success:** HTTP 200. data: { status, departmentId, departmentName, departmentCode, inviterName, isOpen, openByName, waitingCount, academicYearId }.

**Behavior:** Invalid tokens return HTTP 200 with status INVALID. A different/no active year returns 200 with status STALE. Valid invitations return status OK even when isOpen is false; resolving never joins the queue.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.8. Departments

### 2.8.1. Read My Student Department

**Method:** GET

**Endpoint:** `/api/v1/me/departments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** None.

**Success:** HTTP 200. data: department information with schedule { current, next }, or null.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.2. Set My Department Responsibility

**Method:** PUT

**Endpoint:** `/api/v1/me/departments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentIds (required array, at most one identifier), yearLevels (optional, at most five; default []). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 200. data: assignment result.

**Behavior:** Checks offered levels and overlapping claims.

**Additional failure conditions:** 409 if an existing holder overlaps; 400 for unsuitable offered levels.

**Illustrative request body:**

```json
{
  "departmentIds": [
    "department-example"
  ],
  "yearLevels": [
    "FIRST"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.3. List Departments and Assignments

**Method:** GET

**Endpoint:** `/api/v1/departments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: department rows with assignment information, with list metadata.

**Behavior:** Administrators see all departments; advisers receive their applicable listing. This list is sliced by page.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.4. Create a Department

**Method:** POST

**Endpoint:** `/api/v1/departments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: name (required trimmed string, 1–120 characters).

**Success:** HTTP 201. data: { id, name, code, yearLevels, isActive, assigned? }.

**Behavior:** Code is derived from the name, not supplied. An adviser holding no department is assigned automatically; administrators do not receive that self-assignment.

**Additional failure conditions:** 409 if the name or derived code already exists.

**Illustrative request body:**

```json
{
  "name": "Information Technology"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.5. Rename or Change Department Status

**Method:** PATCH

**Endpoint:** `/api/v1/departments/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Body: name (optional, 1–120 characters), isActive (optional boolean). At least one field is required.

**Success:** HTTP 200. data: changed department fields.

**Behavior:** isActive is administrator-only. Do not assume every department action uses identical ownership checks.

**Additional failure conditions:** 403 for adviser status changes; 404 if missing; 409 for duplicate identity or deactivation with students in line.

**Illustrative request body:**

```json
{
  "name": "Information Technology"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.6. Set Offered Department Year Levels

**Method:** PUT

**Endpoint:** `/api/v1/departments/:id/year-levels`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Body: yearLevels (required array, at most five). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 200. data: { id, yearLevels }.

**Behavior:** Requires the assigned adviser or an administrator.

**Additional failure conditions:** 403 if not assigned; 404 if missing.

**Illustrative request body:**

```json
{
  "yearLevels": [
    "FIRST",
    "SECOND"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.7. Delete an Eligible Department

**Method:** DELETE

**Endpoint:** `/api/v1/departments/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { id, deleted: true }.

**Behavior:** Requires assignment or administrator permission. Cleans related availability, assignments, and schedules.

**Additional failure conditions:** 403 if not assigned; 404 if missing; 409 if queue entries prevent deletion.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.8.8. Read the Department Enrollment Register

**Method:** GET

**Endpoint:** `/api/v1/departments/:id/enrollments`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Optional query: range (today/ay/all, default ay), q (up to 100 characters), cursor, limit (1–500, default 50).

**Success:** HTTP 200. data: register entries, page: 1, pageSize: limit, total.

**Behavior:** Read the X-Next-Cursor response header for continuation. Uses the current active academic year context.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.9. Adviser Assignments and Availability

### 2.9.1. List Adviser Assignments

**Method:** GET

**Endpoint:** `/api/v1/advisers`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: [{ id, name, email, departments: [{ id, name, code, yearLevels }] }], with list metadata.

**Behavior:** Returns the complete roster with paging metadata.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.9.2. Replace an Adviser's Assignments

**Method:** PATCH

**Endpoint:** `/api/v1/advisers/:adviserId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: adviserId. Body: assignments (required array, at most 50) of { departmentId, yearLevels? }; levels default to []. Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 200. data: assignment result.

**Behavior:** Administrator-only. Replaces the whole mapping, not a partial append.

**Illustrative request body:**

```json
{
  "assignments": [
    {
      "departmentId": "department-example",
      "yearLevels": [
        "FIRST"
      ]
    }
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.9.3. Open or Close My Queue Availability

**Method:** PUT

**Endpoint:** `/api/v1/me/availability`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId (required identifier), isOpen (required boolean).

**Success:** HTTP 200. data: { departmentId, myOpen, isOpen, openBy }.

**Behavior:** Closing releases a student currently served by this adviser. isOpen can remain true if another adviser is open.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "isOpen": true
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.9.4. Refresh My Availability

**Method:** POST

**Endpoint:** `/api/v1/me/availability/heartbeat`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: { touched }.

**Behavior:** Refreshes the caller's open availability; no departmentId business body is required.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.10. Department Handovers

### 2.10.1. List Incoming and Outgoing Handovers

**Method:** GET

**Endpoint:** `/api/v1/transfers`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: transfer list.

**Behavior:** Resolves expired requests first. Automatic response windows are ten minutes for an active holder and one minute for an inactive holder.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.10.2. Request Department or Year-Level Handover

**Method:** POST

**Endpoint:** `/api/v1/transfers`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId (required), yearLevels (optional, default []). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 201. data: serialized transfer including its expiry and parties.

**Behavior:** The caller requests responsibility from the overlapping current holder; do not supply ownerId or accept in this request.

**Additional failure conditions:** 409 if no overlapping holder exists or department is inactive; 412 without an active year.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "yearLevels": [
    "FIRST"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.10.3. Accept or Decline a Handover

**Method:** PATCH

**Endpoint:** `/api/v1/transfers/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Body: accept (required boolean).

**Success:** HTTP 200. data: { id, status, transferredFromName }.

**Behavior:** Only the recorded owner may respond to a pending request.

**Additional failure conditions:** 403 if not owner; 404 if missing; 409 if already resolved or ownership changed.

**Illustrative request body:**

```json
{
  "accept": true
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.10.4. Cancel My Handover Request

**Method:** DELETE

**Endpoint:** `/api/v1/transfers/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { id, cancelled: true }.

**Behavior:** Only the requester may cancel a pending request.

**Additional failure conditions:** 403 if not requester; 404 if missing; 409 if resolved.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.10.5. Take Over Department Responsibility

**Method:** POST

**Endpoint:** `/api/v1/departments/:id/takeover`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Path: id. Body: yearLevels (optional, default []). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Success:** HTTP 200. data: { departmentId, name, code, transferredFromName }.

**Behavior:** Uses the current takeover service and offered-level checks; this is separate from accepting a pending transfer.

**Illustrative request body:**

```json
{
  "yearLevels": [
    "FIRST"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.11. Office-Hour Schedules

### 2.11.1. Read My Department Office Hours

**Method:** GET

**Endpoint:** `/api/v1/me/schedule`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Required query: departmentId.

**Success:** HTTP 200. data: { departmentId, windows, sync }.

**Behavior:** Returns the caller's windows for the current year. Past dated exceptions are filtered out. Does not open or close queue availability.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.11.2. Replace Department Office Hours

**Method:** PUT

**Endpoint:** `/api/v1/me/schedule`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Body: departmentId and windows required. Input parsing allows at most 100 submitted entries; business validation permits at most 30 remaining entries after past dated exceptions are removed. Each item has kind WEEKLY, EXTRA, or CANCEL. WEEKLY requires weekday 1–7 (Monday–Sunday), startMinute, endMinute. EXTRA requires date YYYY-MM-DD and start/end minutes. CANCEL requires date. Timed values use a 30-minute grid, start >= 0, end <= 1440, with at least 30 minutes duration. Times use Asia/Manila.

**Success:** HTTP 200. data: { departmentId, windows, sync }.

**Behavior:** Replaces the complete schedule, including removal when windows is empty. Past dated exceptions are filtered before validation. May trigger optional calendar sync without changing live availability.

**Additional failure conditions:** 400 for invalid windows or more than 30 retained entries; 403 if not assigned; 409 for overlapping windows.

**Illustrative request body:**

```json
{
  "departmentId": "department-example",
  "windows": [
    {
      "kind": "WEEKLY",
      "weekday": 1,
      "startMinute": 540,
      "endMinute": 660
    }
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.12. Google Calendar Connection

### 2.12.1. Read My Calendar Connection

**Method:** GET

**Endpoint:** `/api/v1/me/calendar`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: { available, status, sync, googleEmail, lastSyncAt, lastError }.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.12.2. Start Calendar Authorization

**Method:** GET

**Endpoint:** `/api/v1/me/calendar/connect`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: { url }.

**Behavior:** Open the returned Google consent URL. Limited to ten calendar requests per minute per account for connect/callback/sync.

**Additional failure conditions:** 412 if integration is unavailable; 429 when rate limited.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.12.3. Complete Calendar Authorization

**Method:** GET

**Endpoint:** `/api/v1/calendar/callback`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Query: code and state for successful authorization; error can be supplied by Google.

**Success:** HTTP 302. 302 Location: /instructor?calendar=connected or /instructor?calendar=error.

**Behavior:** This is a redirect, not a JSON resource envelope. Missing/invalid consent data redirects to the error outcome after permission checks.

**Additional failure conditions:** 401/403 for session/permission failure; 429 for the calendar limit.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.12.4. Synchronize Calendar Again

**Method:** POST

**Endpoint:** `/api/v1/me/calendar/sync`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: calendar status.

**Behavior:** Resets the retry count and requests another schedule synchronization.

**Additional failure conditions:** 412 if unavailable; 429 for the calendar limit.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.12.5. Disconnect Calendar

**Method:** DELETE

**Endpoint:** `/api/v1/me/calendar`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** None.

**Success:** HTTP 200. data: calendar status.

**Behavior:** Removes the mirrored calendar and stored connection token; office hours in ERPSYS remain.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.13. Academic Years

### 2.13.1. List Academic Years

**Method:** GET

**Endpoint:** `/api/v1/academic-years`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: [{ id, label, semesterLabel, isActive, createdAt, hasData }], with list metadata.

**Behavior:** Returns the complete year list with paging metadata.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.13.2. Create an Academic Year

**Method:** POST

**Endpoint:** `/api/v1/academic-years`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: label and semesterLabel (required trimmed strings, 1–30 characters); activate (boolean, default false).

**Success:** HTTP 201. data: { id, label, semesterLabel, isActive }.

**Behavior:** Activation is refused while another current year still has waiting or served students.

**Additional failure conditions:** 409 if activation would interrupt an open queue.

**Illustrative request body:**

```json
{
  "label": "2026–2027",
  "semesterLabel": "First Semester",
  "activate": false
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.13.3. Edit the Current Academic Year

**Method:** PATCH

**Endpoint:** `/api/v1/academic-years/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id. Body: label and semesterLabel (both required, 1–30 characters).

**Success:** HTTP 200. data: { id, label, semesterLabel }.

**Behavior:** Only the active year can be edited.

**Additional failure conditions:** 403 for an inactive year; 404 if missing.

**Illustrative request body:**

```json
{
  "label": "2026–2027",
  "semesterLabel": "First Semester"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.13.4. Delete an Empty Academic Year

**Method:** DELETE

**Endpoint:** `/api/v1/academic-years/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { id }.

**Additional failure conditions:** 404 if missing; 409 if verification, queue, or profiling-form records exist.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.13.5. Preview Academic-Year Activation

**Method:** GET

**Endpoint:** `/api/v1/academic-years/:id/activation`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { currentYearLabel, studentsWithProgress, openQueueCount }.

**Additional failure conditions:** 404 if year is missing.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.13.6. Activate an Academic Year

**Method:** POST

**Endpoint:** `/api/v1/academic-years/:id/activation`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id. No business body fields.

**Success:** HTTP 200. data: { id, label, semesterLabel }.

**Behavior:** Activates this year and deactivates the others. Repeating activation of the active year is accepted.

**Additional failure conditions:** 404 if missing; 409 while the current year has an open queue.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.14. Assessment Requirements

### 2.14.1. List Assessment Requirements

**Method:** GET

**Endpoint:** `/api/v1/requirements`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: [{ id, label, order, isActive }], with list metadata.

**Behavior:** Returns the complete requirement list with paging metadata.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.14.2. Add an Assessment Requirement

**Method:** POST

**Endpoint:** `/api/v1/requirements`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: label (required trimmed string, 1–200 characters).

**Success:** HTTP 201. data: { id, label, order, isActive }.

**Illustrative request body:**

```json
{
  "label": "Assessment balance checked"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.14.3. Reorder Assessment Requirements

**Method:** PUT

**Endpoint:** `/api/v1/requirements/order`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: orderedIds (required array of nonempty identifiers, at most 500).

**Success:** HTTP 200. data: { orderedIds }.

**Behavior:** Unlisted existing items are appended. The response is the submitted identifier list, not full requirement rows.

**Additional failure conditions:** 404 for unknown identifiers.

**Illustrative request body:**

```json
{
  "orderedIds": [
    "requirement-example"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.14.4. Update an Assessment Requirement

**Method:** PATCH

**Endpoint:** `/api/v1/requirements/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id. Body: label (optional, 1–200 characters), isActive (optional boolean).

**Success:** HTTP 200. data: { id, label, order, isActive }.

**Additional failure conditions:** 404 if missing.

**Illustrative request body:**

```json
{
  "isActive": false
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.14.5. Delete an Assessment Requirement

**Method:** DELETE

**Endpoint:** `/api/v1/requirements/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { id }.

**Additional failure conditions:** 404 if missing.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.15. Forms, Links, and Assistant Knowledge

### 2.15.1. Read Assistant Knowledge

**Method:** GET

**Endpoint:** `/api/v1/chatbot-knowledge`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** None.

**Success:** HTTP 200. data: { content, version, updatedById, updatedByName, updatedAt }, or null.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.2. Replace Assistant Knowledge

**Method:** PUT

**Endpoint:** `/api/v1/chatbot-knowledge`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: content (required string, up to 200,000 characters).

**Success:** HTTP 200. data: { version, updatedAt }.

**Behavior:** Increments the version and invalidates the assistant's knowledge cache.

**Illustrative request body:**

```json
{
  "content": "Ask an SBO officer when a requirement is unclear."
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.3. Read the Linked Profiling Form

**Method:** GET

**Endpoint:** `/api/v1/profiling-form`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** None.

**Success:** HTTP 200. data: { formId, title, responderUri, editUrl, updatedByName, updatedAt }, or null.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.4. Create and Link the Profiling Form

**Method:** POST

**Endpoint:** `/api/v1/profiling-form`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Body: title (required trimmed string, 1–200 characters).

**Success:** HTTP 201. data: linked form details.

**Behavior:** Creates a verified-email-collection Google Form, publishes it, and shares it with the caller. It does not accept a replacement form URL.

**Additional failure conditions:** 409 if already linked; 412 without an active year; 503 if Forms is off; provider failures can prevent creation.

**Illustrative request body:**

```json
{
  "title": "Student Profiling"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.5. Unlink the Profiling Form

**Method:** DELETE

**Endpoint:** `/api/v1/profiling-form`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** None.

**Success:** HTTP 200. data: { ok: true }.

**Behavior:** Removes the current-year link, not the underlying Google Form.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.6. List Required Social-Media Links

**Method:** GET

**Endpoint:** `/api/v1/social-links`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: ordered social-link rows, with list metadata.

**Behavior:** Returns the complete ordered list with paging metadata.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.7. Add or Update a Social-Media Link

**Method:** POST

**Endpoint:** `/api/v1/social-links`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Body: name (1–120 characters), url (valid URL, at most 1,000 characters); id (optional existing identifier).

**Success:** HTTP 201. data: social-link row.

**Behavior:** 201 when creating; 200 when id selects an existing link.

**Additional failure conditions:** 404 for an unknown supplied id.

**Illustrative request body:**

```json
{
  "name": "College page",
  "url": "https://example.org/college"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.8. Reorder Social-Media Links

**Method:** PUT

**Endpoint:** `/api/v1/social-links/order`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Body: orderedIds (required array of nonempty identifiers).

**Success:** HTTP 200. data: { ok: true }.

**Illustrative request body:**

```json
{
  "orderedIds": [
    "link-example"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.9. Edit a Social-Media Link

**Method:** PATCH

**Endpoint:** `/api/v1/social-links/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id. Body: name and url (both required; same limits as creation).

**Success:** HTTP 200. data: social-link row.

**Additional failure conditions:** 404 if missing.

**Illustrative request body:**

```json
{
  "name": "College page",
  "url": "https://example.org/college"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.10. Delete a Social-Media Link

**Method:** DELETE

**Endpoint:** `/api/v1/social-links/:id`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Path: id.

**Success:** HTTP 200. data: { ok: true }.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.15.11. Read Registration Options

**Method:** GET

**Endpoint:** `/api/v1/signup-options`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Public.

**Parameters:** None.

**Success:** HTTP 200. data: { academicYears: [{ id, label, semesterLabel, isActive }], departments: [...] }.

**Behavior:** Public. Year-level choices are represented by department data; the response is not a top-level yearLevels array.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.16. Launch, Overview, Stamps, and Notifications

### 2.16.1. Load the Landing-Screen Bundle

**Method:** GET

**Endpoint:** `/api/v1/me/launch`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** None.

**Success:** HTTP 200. data: role-appropriate launch bundle.

**Behavior:** All signed-in accounts. Cache-Control: private, no-store; Vary: Cookie. The bundle varies by the caller's working area.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.16.2. Read the Officer or Administrator Overview

**Method:** GET

**Endpoint:** `/api/v1/me/overview`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** None.

**Success:** HTTP 200. data: role-appropriate overview.

**Behavior:** The administrator receives administrator statistics; the officer receives the officer overview. A session alone is insufficient.

**Additional failure conditions:** 403 for users without officer or administrator overview permission.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.16.3. Read My Digital Stamp

**Method:** GET

**Endpoint:** `/api/v1/me/stamp`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** None.

**Success:** HTTP 200. data: stamp details.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.16.4. Update My Digital Stamp

**Method:** PATCH

**Endpoint:** `/api/v1/me/stamp`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Body: name (optional, at most 80 characters); graphicUrl and signatureUrl (optional URL up to 1,000 characters, or null).

**Success:** HTTP 200. data: stamp details.

**Additional failure conditions:** 404 if account cannot be updated.

**Illustrative request body:**

```json
{
  "name": "Reviewing Officer",
  "graphicUrl": null
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.16.5. Read My Notifications

**Method:** GET

**Endpoint:** `/api/v1/me/notifications`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** None.

**Success:** HTTP 200. data: notification rows, page: 1, pageSize: 50, total: returned-row count.

**Behavior:** Newest first, capped at 50. This handler does not expose arbitrary notification pagination. New read markers live in account-scoped browser storage, capped at 1,000 IDs; they do not synchronize across devices and clearing browser storage resets them. Existing server read markers remain honored. There is no mark-read write endpoint.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.17. Report Data

### 2.17.1. Read User-Directory Report Data

**Method:** GET

**Endpoint:** `/api/v1/reports/user-directory`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: q (up to 100 characters), role (permitted account category; omit for all), outside (ALL/INSIDE/OUTSIDE), academicYearId, departmentId, yearLevel; sort (joined/studentNumber/name, default joined), dir (asc/desc, default desc). Account-category labels in this document are descriptive, not wire values; use the account-management client for role-filtered requests.

**Success:** HTTP 200. data: { year, rows, matchedCount, truncated }.

**Behavior:** At most 1,000 rows. The API returns JSON; PDF layout, preview, and download happen in the website.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.17.2. Read Department-Roster Report Data

**Method:** GET

**Endpoint:** `/api/v1/reports/roster`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Optional query: academicYearId; scope (mine/all, default mine); sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt); dir (asc/desc); q (up to 100 characters); departmentIds, yearLevels, buckets, steps (repeat array query keys for multiple selections); stepState; enrolled (true/false); unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Success:** HTTP 200. data: { year, rows, stats, matchedCount, truncated }.

**Behavior:** At most 1,000 rows. Embedded stats summarize the returned rows. The separate roster-stats endpoint is uncapped but deliberately ignores bucket filters, so its totals may differ from a bucket-filtered report. Without a year, returns empty rows and year null.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.17.3. Read Uncapped Roster Totals

**Method:** GET

**Endpoint:** `/api/v1/reports/roster-stats`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Enrollment adviser or administrator, with any additional assignment checks described below.

**Parameters:** Optional query: academicYearId; scope (mine/all, default mine); sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt); dir (asc/desc); q (up to 100 characters); departmentIds, yearLevels, buckets, steps (repeat array query keys for multiple selections); stepState; enrolled (true/false); unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Success:** HTTP 200. data: { year, stats: { byCourse, byCourseYearLevel, distribution, unassignedTotal, total } }.

**Behavior:** Aggregates without the PDF row cap and deliberately ignores buckets. Other applicable roster filters remain; totals are not necessarily the count of a bucket-filtered report.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.17.4. Read Step-Register Report Data

**Method:** GET

**Endpoint:** `/api/v1/reports/step-register`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** SBO officer or administrator.

**Parameters:** Query: step is required. Other submission filters apply, except page and pageSize. Optional query: step (ASSESSMENT, SOCIAL_MEDIA, PROFILING, MUGSHOT, CONSENT); page (default 1), pageSize (1–100, default 50); sort (submittedAt, studentName, status; default submittedAt); dir (asc/desc, default asc); q (up to 100 characters); status (ALL, PENDING, SUBMITTED, VERIFIED, RETURNED); evidence (ALL, HAS, NONE); range (ALL, today, 7d, 30d, year).

**Success:** HTTP 200. data: { year, step: { code, name }, rows, matchedCount, truncated }.

**Behavior:** At most 1,000 rows. No PDF bytes are returned.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.18. Account Administration

### 2.18.1. Search the User Directory

**Method:** GET

**Endpoint:** `/api/v1/users`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: q (up to 100 characters), role (permitted account category; omit for all), outside (ALL/INSIDE/OUTSIDE), academicYearId, departmentId, yearLevel; sort (joined/studentNumber/name, default joined), dir (asc/desc, default desc). Account-category labels in this document are descriptive, not wire values; use the account-management client for role-filtered requests. Optional page (>=1, default 1), pageSize (1–100, default 50).

**Success:** HTTP 200. data: [{ id, name, email, image, role, isOutsideOrg, blocked, studentNumber, studentProfileId, department, yearLevel, joinedAt }], with list metadata.

**Behavior:** The year defaults to active, otherwise newest. Academic year alone does not restrict account membership. Name/student-number sorting occurs within the page already selected by joined date, not globally. These endpoints do not require the integration step-up.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.18.2. Change Student or Officer Permissions in Bulk

**Method:** PATCH

**Endpoint:** `/api/v1/users`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: userIds (required array, 0–500 nonempty identifiers), role (required permitted student/officer wire value).

**Success:** HTTP 200. data: { updated, skipped: [...] }.

**Behavior:** Only student-to-officer or officer-to-student changes are allowed. Human role labels are not accepted wire values; use the administrative account client for this request. Already-matching/unsupported targets are skipped; missing IDs are absent from the result. Empty selection succeeds with zero updates.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.18.3. Block or Delete Selected Accounts

**Method:** DELETE

**Endpoint:** `/api/v1/users`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Body: userIds (required array, 0–500 nonempty identifiers).

**Success:** HTTP 200. data: { hardDeleted: [...], blocked: [...], skipped: [{ userId, reason }] }.

**Behavior:** Accounts with activity are blocked, their sessions revoked, and queue/availability state cleaned. Inactive accounts take the narrower delete path. Administrators, already-blocked accounts, and missing accounts are skipped. This is not the separate permanent-purge operation.

**Illustrative request body:**

```json
{
  "userIds": [
    "user-example"
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.18.4. Change One Student or Officer Permission

**Method:** PATCH

**Endpoint:** `/api/v1/users/:userId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: userId. Body: role (required permitted student/officer wire value).

**Success:** HTTP 200. data: { userId, role }.

**Behavior:** Use the account-management client rather than substituting a human label. Other email-derived account categories cannot be changed through this action. Repeating the same allowed value is a no-op success.

**Additional failure conditions:** 404 missing user; 409 unsupported current category; 403 attempted self-demotion.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.18.5. Permanently Purge a Blocked Account

**Method:** DELETE

**Endpoint:** `/api/v1/users/:userId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: userId.

**Success:** HTTP 200. data: { userId }.

**Behavior:** Permanent removal and related-record cleanup require an already-blocked non-administrator account.

**Additional failure conditions:** 404 missing user; 403 administrator target; 409 target not blocked.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.18.6. Set a Replacement Student Password

**Method:** POST

**Endpoint:** `/api/v1/users/:userId/password-reset`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: userId. Body: newPassword (required string, 8–128 characters).

**Success:** HTTP 200. data: { success: true, message }.

**Behavior:** Immediately sets credentials, not an emailed link. Only a student target other than the caller is allowed. This handler does not revoke existing target sessions or exclude blocked targets.

**Additional failure conditions:** 404 missing user; 403 self/other account category; 400 invalid password.

**Illustrative request body:**

```json
{
  "newPassword": "<new password chosen securely>"
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.19. Integration Administration

### 2.19.1. List Administrator Authenticator Status

**Method:** GET

**Endpoint:** `/api/v1/integrations/authenticators`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** None.

**Success:** HTTP 200. data: [{ userId, name, email, enrolled }].

**Behavior:** Administrator session required; no step-up required merely to view status.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.2. Reset an Administrator Authenticator

**Method:** DELETE

**Endpoint:** `/api/v1/integrations/authenticators/:userId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session with current sensitive-action unlock.

**Parameters:** Path: userId.

**Success:** HTTP 200. data: { userId, enrolled: false }.

**Behavior:** Requires a current administrator step-up unlock. Deletes the target's authenticator and temporary unlock and requires fresh setup. Self-reset is allowed.

**Additional failure conditions:** 403 with data.code STEP_UP_REQUIRED while locked; 404 target absent/not administrator.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.3. Export Effective Integration Credentials

**Method:** GET

**Endpoint:** `/api/v1/integrations/credentials/export`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** None.

**Success:** HTTP 200. data: { filename, content }.

**Behavior:** Requires a current step-up unlock. Cache-Control: no-store. Content contains actual effective secrets, not masks. Store privately and never paste the export into the manuscript, screenshots, or source control. Unreadable overrides can fall back to configured environment values.

**Additional failure conditions:** 403 with data.code STEP_UP_REQUIRED while locked.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.4. Read Integration Availability and Configuration

**Method:** GET

**Endpoint:** `/api/v1/integrations`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Public; an administrator session changes the integration-list response shape.

**Parameters:** None.

**Success:** HTTP 200. data: { flags, turnstileSiteKey, overridesLoaded } for public/non-administrator callers; data: integration rows for an administrator.

**Behavior:** Administrator rows include key, label, description, enabled, configured, consequence, updatedByName/updatedAt, credentials, version, pendingRestart, overridesLoaded. Secret credential entries have value null and a mask; plain entries may expose values. Viewing does not require a step-up unlock. Enabling a service does not itself prove it is configured.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.5. Enable or Disable an Integration

**Method:** PATCH

**Endpoint:** `/api/v1/integrations/:key`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session with current sensitive-action unlock.

**Parameters:** Path: key is turnstile, r2, googleAuth, cloudflareChat, email, googleForms, or googleCalendar. Body: enabled (required boolean).

**Success:** HTTP 200. data: { key, enabled }.

**Behavior:** Requires current step-up. Does not verify that credentials exist merely to enable a switch.

**Additional failure conditions:** 404 unknown integration; 403 STEP_UP_REQUIRED.

**Illustrative request body:**

```json
{
  "enabled": true
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.6. Validate Draft Integration Credentials

**Method:** POST

**Endpoint:** `/api/v1/integrations/:key/credentials/validate`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Path: key is a supported integration key. Body: version (required integer >=0), values (required object mapping allowed credential field names to strings up to 4,096 characters or null).

**Success:** HTTP 200. data: { key, version, fields: [{ envKey, set, source }] }, where source is draft, stored, or env.

**Behavior:** Administrator session required; no step-up unlock required. Merges drafts over stored overrides and configured fallbacks, checks required values, pairs and formats, and runs supported provider probes without saving credentials or incrementing their version. An all-null nonempty reset skips required-value and provider probes but still checks pairing. Shares the ten-request-per-minute per-administrator credential budget with saves and resets. No secret values are returned. The Better Auth integration is locked and cannot be validated this way.

**Additional failure conditions:** 400 invalid body or unknown credential field; 401 no session; 403 not administrator; 404 unknown integration; 409 stale version or locked integration; 422 with data.failures [{ key, reason }] for group/provider failure; 429 credential limit.

**Illustrative request body:**

```json
{
  "version": 0,
  "values": {
    "MAIL_FROM": "ERPSYS <no-reply@example.org>",
    "BREVO_API_KEY": "<draft provider credential>"
  }
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.7. Save Integration Credential Overrides

**Method:** PUT

**Endpoint:** `/api/v1/integrations/:key/credentials`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session with current sensitive-action unlock.

**Parameters:** Path: key is a supported integration key. Body: version (required integer >=0), values (required object mapping allowed credential field names to strings up to 4,096 characters or null).

**Success:** HTTP 200. data: updated integration row.

**Behavior:** Requires current step-up. Omitted fields retain current overrides/fallbacks; null removes an override; empty strings are rejected. Required effective values, paired submissions, and supported provider probes are checked before saving. An all-null nonempty reset bypasses provider/required-value checks but still follows pairing rules. Unchanged saves do not increment version. Ten credential PUT/DELETE attempts per minute per administrator. Some saved values require restart; inspect pendingRestart.

**Additional failure conditions:** 400 unknown credential name/invalid body; 404 unknown integration; 403 STEP_UP_REQUIRED; 409 stale version or concurrent save; 422 with data.failures [{ key, reason }] for group/provider failure; 429 credential limit.

**Illustrative request body:**

```json
{
  "version": 0,
  "values": {
    "MAIL_FROM": "ERPSYS <no-reply@example.org>",
    "BREVO_API_KEY": "<new provider credential>"
  }
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.19.8. Restore Configured Credential Defaults

**Method:** DELETE

**Endpoint:** `/api/v1/integrations/:key/credentials`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session with current sensitive-action unlock.

**Parameters:** Path: key is a supported integration key. No version business field.

**Success:** HTTP 200. data: integration row.

**Behavior:** Clears the group's saved overrides and falls back to configured environment values. It does not import a backup, restart the server, or change the service switch. Requires current step-up and shares the credential-write limit.

**Additional failure conditions:** 403 STEP_UP_REQUIRED; 404 unknown key; 429 limit.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.20. Request Audit

### 2.20.1. Search Recorded Write Requests

**Method:** GET

**Endpoint:** `/api/v1/audit-logs`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: role (account category filter, at most 40 characters), method (POST/PUT/PATCH/DELETE), q (actor name, email, or path; at most 200 characters). Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with paging metadata rather than slicing; see endpoint notes.

**Success:** HTTP 200. data: [{ id, actorId, actorName, actorEmail, role, method, path, status, ip, at }], with list metadata.

**Behavior:** Records signed-in versioned write requests, newest first. This request audit is separate from administrator action summaries.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.21. Enrollment Assistant Stream

### 2.21.1. Stream an Enrollment Assistant Reply

**Method:** POST

**Endpoint:** `/api/chat/stream`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access.

**Parameters:** Body: messages (1–20 items), each { role, text }; role is user, assistant, or legacy model; text is 1–2,000 characters. JSON body limit 100 KB.

**Success:** HTTP 200. 200 text/event-stream: data frames containing start, token, done, or error objects.

**Behavior:** Uses the signed-in student working area. Legacy model messages normalize to assistant. Ten requests per minute per account/IP; daily allowances and provider limits also apply. Errors after the stream starts are event objects, not a new HTTP status.

**Additional failure conditions:** 400 invalid messages; 401/403 access; 429 request limit; 503 when assistant is disabled. Provider/budget failures may instead arrive as streamed error frames.

**Illustrative request body:**

```json
{
  "messages": [
    {
      "role": "user",
      "text": "What should I do after my requirement is returned?"
    }
  ]
}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.22. Application Health

### 2.22.1. Check Basic Application Health

**Method:** GET

**Endpoint:** `/api/health`

**Version:** Configured application/authentication version

**Capture date:** Not yet supplied.

**Access:** Public.

**Parameters:** None.

**Success:** HTTP 200. { ok: true }.

**Behavior:** Public, non-versioned JSON. It is a basic liveness response, not a database-readiness probe.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


## 2.23. Advisory Editor Presence

### 2.23.1. List Active Editing Records

**Method:** GET

**Endpoint:** `/api/v1/editing-presence`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Administrator session.

**Parameters:** Optional query: page (positive integer, default 1), pageSize or limit (default 50, maximum 100).

**Success:** HTTP 200. data: [{ resource, recordId, editors: [{ userId, editorId, name, lastSeenAt, expiresAt }] }], with list metadata.

**Behavior:** Administrator-only overview of records with active editors, newest update first. Private, no-store; outside business timestamp ordering.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.23.2. Read Active Editors

**Method:** GET

**Endpoint:** `/api/v1/editing-presence/:resource/:recordId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: resource is academic-year, department, requirement, adviser, user, stamp, chatbot-knowledge, profiling-form, social-link, schedule, student-profile, student-enrollment, submission, queue-entry, or integration; recordId is 1–200 characters.

**Success:** HTTP 200. data: { resource, recordId, editors: [{ userId, editorId, name, lastSeenAt, expiresAt }] }.

**Behavior:** Advisory presence is not a lock and does not prevent concurrent edits. It runs outside business timestamp ordering, never advances business read/write stamps, and is excluded from audit logging. Responses are private, no-store. Expired editors are filtered immediately; the minute sweep removes expired leases and empty records. Every record operation requires resource write access: administrator-only for academic-year, requirement, adviser, user, chatbot-knowledge and integration; officer access for social-link, profiling-form and the caller's own stamp; instructor access for department and the caller's assigned schedule. Profiles require ownership or officer access; enrollment is owner-only. Submissions require officer access or student ownership. Queue entries require instructor assignment and year-level scope. Use default for assistant knowledge or the active year's profiling form; me~departmentId for the caller's current-year schedule; me for the caller's stamp, profile or active-year enrollment; and me~STEP_CODE for the caller's submission. Existing submission identifiers are also accepted. Responses return canonical record identifiers. Integration recordId is an integration key. Other resources use existing record identifiers.

**Additional failure conditions:** 400 invalid resource, recordId or editorId; 401 no session; 403 resource access denied; 404 missing record or active-year context.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.23.3. Join or Renew an Editing Lease

**Method:** PUT

**Endpoint:** `/api/v1/editing-presence/:resource/:recordId/:editorId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: resource is academic-year, department, requirement, adviser, user, stamp, chatbot-knowledge, profiling-form, social-link, schedule, student-profile, student-enrollment, submission, queue-entry, or integration; recordId is 1–200 characters. editorId identifies one tab: 1–100 letters, digits, underscores or hyphens. Body: empty object; unknown business fields are rejected.

**Success:** HTTP 200. data: { resource, recordId, editors: [{ userId, editorId, name, lastSeenAt, expiresAt }] }.

**Behavior:** Each tab renews every 20 seconds; its lease expires after 60 seconds. Identity, name and dates come from the server. Atomic revision comparisons preserve other users and independent tabs. Advisory presence is not a lock and does not prevent concurrent edits. It runs outside business timestamp ordering, never advances business read/write stamps, and is excluded from audit logging. Responses are private, no-store. Expired editors are filtered immediately; the minute sweep removes expired leases and empty records. Every record operation requires resource write access: administrator-only for academic-year, requirement, adviser, user, chatbot-knowledge and integration; officer access for social-link, profiling-form and the caller's own stamp; instructor access for department and the caller's assigned schedule. Profiles require ownership or officer access; enrollment is owner-only. Submissions require officer access or student ownership. Queue entries require instructor assignment and year-level scope. Use default for assistant knowledge or the active year's profiling form; me~departmentId for the caller's current-year schedule; me for the caller's stamp, profile or active-year enrollment; and me~STEP_CODE for the caller's submission. Existing submission identifiers are also accepted. Responses return canonical record identifiers. Integration recordId is an integration key. Other resources use existing record identifiers.

**Additional failure conditions:** 400 invalid resource, recordId or editorId; 401 no session; 403 resource access denied; 404 missing record or active-year context. 400 for unexpected body fields; 409 when revision retries are exhausted.

**Illustrative request body:**

```json
{}
```

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.

### 2.23.4. Leave an Editing Lease

**Method:** DELETE

**Endpoint:** `/api/v1/editing-presence/:resource/:recordId/:editorId`

**Version:** Application API v1

**Capture date:** Not yet supplied.

**Access:** Signed-in session; the operation may impose additional business visibility checks.

**Parameters:** Path: resource is academic-year, department, requirement, adviser, user, stamp, chatbot-knowledge, profiling-form, social-link, schedule, student-profile, student-enrollment, submission, queue-entry, or integration; recordId is 1–200 characters. editorId identifies one tab: 1–100 letters, digits, underscores or hyphens. No business body fields.

**Success:** HTTP 200. data: { resource, recordId, editors: [{ userId, editorId, name, lastSeenAt, expiresAt }] }.

**Behavior:** Removes only the signed-in user's matching tab, preserving other editors. Leaving an absent lease succeeds; missed heartbeats also expire it. Advisory presence is not a lock and does not prevent concurrent edits. It runs outside business timestamp ordering, never advances business read/write stamps, and is excluded from audit logging. Responses are private, no-store. Expired editors are filtered immediately; the minute sweep removes expired leases and empty records. Every record operation requires resource write access: administrator-only for academic-year, requirement, adviser, user, chatbot-knowledge and integration; officer access for social-link, profiling-form and the caller's own stamp; instructor access for department and the caller's assigned schedule. Profiles require ownership or officer access; enrollment is owner-only. Submissions require officer access or student ownership. Queue entries require instructor assignment and year-level scope. Use default for assistant knowledge or the active year's profiling form; me~departmentId for the caller's current-year schedule; me for the caller's stamp, profile or active-year enrollment; and me~STEP_CODE for the caller's submission. Existing submission identifiers are also accepted. Responses return canonical record identifiers. Integration recordId is an integration key. Other resources use existing record identifiers.

**Additional failure conditions:** 400 invalid resource, recordId or editorId; 401 no session; 403 resource access denied; 404 missing record or active-year context. 409 when revision retries are exhausted.

**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.


# Credential Fields and Service Configuration

Credential edits use integration key plus version and values. Omitted fields retain existing values, null removes an override, and empty strings are rejected. Required fields refer to the effective saved/configured group. Send both members when changing a paired group.

- **Google sign-in — googleAuth:** GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET form a required pair.
- **Bot protection — turnstile:** TURNSTILE_SECRET_KEY and VITE_TURNSTILE_SITE_KEY form a required pair; TURNSTILE_HOSTNAMES is optional.
- **Private storage — r2:** R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY; access ID and secret form a pair.
- **Assistant — cloudflareChat:** CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
- **Email — email:** BREVO_API_KEY and MAIL_FROM. A successful account probe does not prove message delivery.
- **Profiling — googleForms:** GOOGLE_FORMS_REFRESH_TOKEN, with the configured Google sign-in client also needed for validation.
- **Calendar — googleCalendar:** CALENDAR_TOKEN_KEY, at least 32 trimmed characters, and the configured Google client. Calendar credential checks are local rather than a full connected-user synchronization test.

Saved credential overrides are encrypted. Ordinary reads mask secret fields; export returns real effective values. A pendingRestart flag distinguishes saving from applying a change to the running service. Clearing overrides restores configured defaults, not an imported backup. MongoDB Atlas is required infrastructure rather than one of these optional integration switches. Report generation is performed by the website using API data, not an external report-delivery endpoint.

# Request and Response Capture Checklist

The examples in this manuscript are illustrative request bodies or response-shape descriptions. They do not certify deployed behavior or replace executed evidence.

For each endpoint, capture the version being tested, capture date, permitted account category, sanitized request parameters, actual HTTP status and headers, and actual response. Include a permitted operation, invalid input where relevant, permission refusal, and meaningful state conflicts. Use only demo data. Never capture live session cookies, reset tokens, provider keys, authenticator setup material, backup codes, or credential-export contents.

Authentication tests require the library's origin/session behavior. Upload tests require direct file transfer and completion. Calendar tests require a real authorized consent flow. A 200 response containing INVALID or STALE invitation status is not a successful queue join. A reset-request success does not prove an email was delivered. A stream can start with HTTP 200 and subsequently report an error event. Report truncation must be shown through matchedCount/truncated rather than assumed from the first page.

> **TODO (author):** Supply dated sanitized captures and results from the tested application version. No request screenshots or capture dates are fabricated in this revision.

# External Service Documentation

- **Google sign-in:** [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2).
- **Bot protection:** [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/).
- **Private files:** [Cloudflare R2 API](https://developers.cloudflare.com/r2/api/s3/).
- **Assistant:** [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/).
- **Profiling:** [Google Forms API](https://developers.google.com/workspace/forms/api).
- **Calendar:** [Google Calendar API](https://developers.google.com/workspace/calendar/api).
- **Email:** [Brevo transactional email](https://developers.brevo.com/docs/send-a-transactional-email).
- **Authentication and authenticator:** [Better Auth](https://www.better-auth.com/docs).
- **Database:** [MongoDB Atlas](https://www.mongodb.com/docs/atlas/).
