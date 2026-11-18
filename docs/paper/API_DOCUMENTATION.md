# API Documentation

This document explains how ERPSYS exchanges information for sign-in, student requirements, enrollment, queues, and system settings. Each module lists its endpoints and explains what they do.

**Base address:** [http://localhost:3001](http://localhost:3001). This is the local API server. Use the website's permitted origin for authentication; do not change the server's sign-in or Google callback settings just for a screenshot.

**Screenshots:** Insert your own request-and-response screenshots in the marked spaces. Use sample data and hide secrets and personal information. Dates are assigned documentation dates; screenshots and actual testing results must be supplied separately.

**Shared Request Rules:**

- Use an API client or the website's Network panel. Clicking an address sends GET only; POST, PUT, PATCH, and DELETE must use the stated method and fields.
- Replace address placeholders such as :id, :userId, :code, :key, and :token with actual test values. Query options are added to the address, not the request body.
- A signed-in browser sends its session cookie. A separate API client needs its own authenticated cookie session and permitted Origin for authentication requests. Do not screenshot cookies or tokens.
- Most application responses put the result inside data and may include ts. Authentication returns its own response; redirects, files, and assistant streams are different.
- Prepare an active school year, department, adviser assignment, and student placement before dependent operations. Use separate test records for approval, cancellation, deletion, and reversal; these actions change later results.
- Send request-body fields as JSON using the application/json content type. The fields are listed below without JSON examples.
- A 409 response with TS_ABORTED means a record needs refreshing before retrying. Keep the returned ts value for edits. Earlier changes in a batch are not automatically undone.
- Lists may include page, pageSize, and total. Follow the endpoint's list options.
- Tables show only the main status codes, not every possible error. A successful response does not prove an email was delivered or a connected service finished its work.
- For a complete enrollment capture: save placement, supply evidence or the profiling-form answer, submit requirements, have an officer verify all five requirements, open the adviser's queue, join it, serve the student, then complete enrollment.
- Google sign-in and Calendar callbacks require real provider consent flows. Uploads require actual bytes in storage. Forms, mail, storage, and the assistant need their own enabled, working service configuration.
- The disabled standard signup route is expected to return 400. An invalid-request screenshot should show the intended refusal; it is not an application failure. Only screenshot redacted status information for credential exports and authenticator setup.

## 1.1 AUTHENTICATION AND ADMINISTRATOR VERIFICATION MODULE API

### 1.1.1 Module Description

This module lets users sign in, sign out, and recover their accounts. It also checks an administrator's identity before sensitive settings can be changed.

This module has the following endpoints:

- POST [http://localhost:3001/api/auth/email-otp/send-verification-otp](http://localhost:3001/api/auth/email-otp/send-verification-otp)
- POST [http://localhost:3001/api/auth/sign-in/email-otp](http://localhost:3001/api/auth/sign-in/email-otp)
- POST [http://localhost:3001/api/auth/email-otp/verify-email](http://localhost:3001/api/auth/email-otp/verify-email)
- POST [http://localhost:3001/api/auth/sign-in/email](http://localhost:3001/api/auth/sign-in/email)
- POST [http://localhost:3001/api/auth/sign-up/student](http://localhost:3001/api/auth/sign-up/student)
- POST [http://localhost:3001/api/auth/sign-up/email](http://localhost:3001/api/auth/sign-up/email)
- POST [http://localhost:3001/api/auth/sign-in/social](http://localhost:3001/api/auth/sign-in/social)
- GET [http://localhost:3001/api/auth/callback/google](http://localhost:3001/api/auth/callback/google)
- GET [http://localhost:3001/api/auth/get-session](http://localhost:3001/api/auth/get-session)
- POST [http://localhost:3001/api/auth/sign-out](http://localhost:3001/api/auth/sign-out)
- POST [http://localhost:3001/api/auth/request-password-reset](http://localhost:3001/api/auth/request-password-reset)
- POST [http://localhost:3001/api/auth/reset-password](http://localhost:3001/api/auth/reset-password)
- GET [http://localhost:3001/api/auth/reset-password/:token](http://localhost:3001/api/auth/reset-password/:token)
- GET [http://localhost:3001/api/auth/admin-gate/status](http://localhost:3001/api/auth/admin-gate/status)
- POST [http://localhost:3001/api/auth/admin-gate/pin](http://localhost:3001/api/auth/admin-gate/pin)
- POST [http://localhost:3001/api/auth/admin-gate/password](http://localhost:3001/api/auth/admin-gate/password)
- POST [http://localhost:3001/api/auth/admin-gate/code/send](http://localhost:3001/api/auth/admin-gate/code/send)
- POST [http://localhost:3001/api/auth/admin-gate/code/verify](http://localhost:3001/api/auth/admin-gate/code/verify)
- POST [http://localhost:3001/api/auth/two-factor/enable](http://localhost:3001/api/auth/two-factor/enable)
- POST [http://localhost:3001/api/auth/two-factor/verify-totp](http://localhost:3001/api/auth/two-factor/verify-totp)
- POST [http://localhost:3001/api/auth/two-factor/verify-backup-code](http://localhost:3001/api/auth/two-factor/verify-backup-code)

### 1.1.2 Send an Email Sign-In or Verification Code

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint requests an email code for sign-in or email verification.

**Endpoint:** [http://localhost:3001/api/auth/email-otp/send-verification-otp](http://localhost:3001/api/auth/email-otp/send-verification-otp)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- email — Required existing account email in the request body.
- type — Required purpose: sign-in or email-verification.
- cf-turnstile-response — Required header with a fresh bot-check token for sign-in codes when protection is enabled.

**Important Notes:**

- Email delivery must be enabled and configured. Codes last five minutes, allow three incorrect guesses, and work once. Sign-in codes do not create accounts. Hide the code in screenshots.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 503 | Service Unavailable | The required service is unavailable. |

**Response (JSON):** A success confirmation is returned, not the code. For sign-in, an unknown email also receives a general confirmation without an email being sent.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 1.** Send an Email Sign-In or Verification Code — Valid Request and Response

This figure illustrates the request and returned response for “Send an Email Sign-In or Verification Code.”

[SCREENSHOT: Invalid request and response.]

**Figure 2.** Send an Email Sign-In or Verification Code — Invalid Request and Response

This figure shows a rejected request for “Send an Email Sign-In or Verification Code” and the error message returned by the system.

### 1.1.3 Sign In with an Email Code

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint signs in an existing account using a fresh emailed code.

**Endpoint:** [http://localhost:3001/api/auth/sign-in/email-otp](http://localhost:3001/api/auth/sign-in/email-otp)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- email — Required existing account email in the request body.
- otp — Required fresh code received after requesting type sign-in. The website uses a six-digit code.

**Important Notes:**

- Request a sign-in code first for an existing, unblocked account. This also proves email ownership. For staff or administrator permissions, verify the resulting session rather than assuming a typed email grants a role.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The session token and account details are returned. A session cookie is set. Read the current session to confirm the account's permissions.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 3.** Sign In with an Email Code — Valid Request and Response

This figure depicts the request and returned response for “Sign In with an Email Code.”

[SCREENSHOT: Invalid request and response.]

**Figure 4.** Sign In with an Email Code — Invalid Request and Response

This figure shows a rejected request for “Sign In with an Email Code” and the error message returned by the system.

### 1.1.4 Verify an Account Email Address

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint confirms account ownership using an emailed verification code.

**Endpoint:** [http://localhost:3001/api/auth/email-otp/verify-email](http://localhost:3001/api/auth/email-otp/verify-email)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- email — Required account email in the request body.
- otp — Required fresh code received after requesting type email-verification. A sign-in code cannot be used instead.

**Important Notes:**

- Request an email-verification code first. Initial verification of a privileged staff or administrator email removes unproven password credentials and ends existing sessions. Sign in again using an email code or Google to receive the permitted role.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A successful status and verified user are returned. The token is null; this action does not create a new sign-in session.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 5.** Verify an Account Email Address — Valid Request and Response

This figure illustrates the request and returned response for “Verify an Account Email Address.”

[SCREENSHOT: Invalid request and response.]

**Figure 6.** Verify an Account Email Address — Invalid Request and Response

This figure shows a rejected request for “Verify an Account Email Address” and the error message returned by the system.

### 1.1.5 Sign In with Email and Password

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint allows a user to sign in using an email address and password.

**Endpoint:** [http://localhost:3001/api/auth/sign-in/email](http://localhost:3001/api/auth/sign-in/email)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- email and password — Required account details in the request body.
- callbackURL and rememberMe — Optional return address and stay-signed-in choice.
- turnstileToken or cf-turnstile-response — A fresh bot-check token, when the sign-in settings require it.

**Important Notes:**

- A blocked account cannot sign in. Password sign-in and registration share a limit of 20 attempts per five minutes for an internet address.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 401 | Sign-In Required | Sign in or check your sign-in details. |

**Response (JSON):** The account details and sign-in information are returned. The browser receives a session cookie to keep the user signed in.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 7.** Sign In with Email and Password — Valid Request and Response

This figure depicts the request and returned response for “Sign In with Email and Password.”

[SCREENSHOT: Invalid request and response.]

**Figure 8.** Sign In with Email and Password — Invalid Request and Response

This figure shows a rejected request for “Sign In with Email and Password” and the error message returned by the system.

### 1.1.6 Register a Student Account

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint creates a student account and saves the student's enrollment placement.

**Endpoint:** [http://localhost:3001/api/auth/sign-up/student](http://localhost:3001/api/auth/sign-up/student)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- name, studentNumber, email, and password — Required account details in the request body. The number must contain digits only. The password must be 8–128 characters.
- academicYearId, departmentId, and yearLevel — Required school-year, department, and year-level choices. Use FIRST, SECOND, THIRD, FOURTH, or FIFTH for yearLevel.
- turnstileToken or cf-turnstile-response — Optional bot-check token, 1–2,048 characters when supplied.

**Important Notes:**

- University student-email accounts use Google sign-in instead. The selected school year must exist but does not have to be active. A blocked account using the same identity may be replaced. Some placement failures currently appear as a server error.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |

**Response (JSON):** The new account details are returned and the student is signed in.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 9.** Register a Student Account — Valid Request and Response

This figure illustrates the request and returned response for “Register a Student Account.”

[SCREENSHOT: Invalid request and response.]

**Figure 10.** Register a Student Account — Invalid Request and Response

This figure shows a rejected request for “Register a Student Account” and the error message returned by the system.

### 1.1.7 Standard Password Signup Is Disabled

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint rejects the unused standard registration route.

**Endpoint:** [http://localhost:3001/api/auth/sign-up/email](http://localhost:3001/api/auth/sign-up/email)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Standard library signup is not the supported student-registration path.

**Important Notes:**

- Use the custom student signup route. An HTTP request here is deliberately rejected.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 400 | Registration Disabled | Use the student-registration endpoint instead. |

**Response (JSON):** The request is refused. Students must use the student-registration endpoint instead.

[SCREENSHOT: Expected Rejected Request; include the request and response.]

**Figure 11.** Standard Password Signup Is Disabled — Expected Rejected Request and Response

This figure shows the rejected standard signup request and the message directing students to the student-registration route.

### 1.1.8 Begin Google Sign-In

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint starts the Google sign-in process.

**Endpoint:** [http://localhost:3001/api/auth/sign-in/social](http://localhost:3001/api/auth/sign-in/social)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Request body: connected service: google
- callbackURL for the permitted return destination.
- Other optional Better Auth redirect controls remain library-owned.

**Important Notes:**

- Google integration must be enabled. Do not treat this as a completed authenticated session before the connected service callback succeeds.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** A Google sign-in address is returned. The user must finish the Google steps before sign-in is complete.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 12.** Begin Google Sign-In — Valid Request and Response

This figure shows the request and returned response for “Begin Google Sign-In.”

[SCREENSHOT: Invalid request and response.]

**Figure 13.** Begin Google Sign-In — Invalid Request and Response

This figure shows a rejected request for “Begin Google Sign-In” and the error message returned by the system.

### 1.1.9 Complete Google Sign-In

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint receives Google's answer after the user signs in.

**Endpoint:** [http://localhost:3001/api/auth/callback/google](http://localhost:3001/api/auth/callback/google)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Google supplies authorization code/state or error address filter parameters.

**Important Notes:**

- Let Google supply the callback code and state through the actual sign-in flow. Do not invent these values or reuse an already-consumed callback.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 302 | Redirect | Continue on the next page. |

**Response (Redirect):** The user is sent back to the website. Sign-in information is set only when the Google checks succeed.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 14.** Complete Google Sign-In — Valid Request and Response

This figure demonstrates the request and returned response for “Complete Google Sign-In.”

[SCREENSHOT: Invalid request and response.]

**Figure 15.** Complete Google Sign-In — Invalid Request and Response

This figure shows a rejected request for “Complete Google Sign-In” and the error message returned by the system.

### 1.1.10 Read the Current Sign-In Session

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks whether a user is signed in.

**Endpoint:** [http://localhost:3001/api/auth/get-session](http://localhost:3001/api/auth/get-session)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Unwrapped authentication JSON, not data/ts. Session cookies are managed by the auth library.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |

**Response (JSON):** The current user and session details are returned, or an empty result when the user is signed out.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 16.** Read the Current Sign-In Session — Valid Request and Response

This figure shows the request and returned response for “Read the Current Sign-In Session.”

[SCREENSHOT: Invalid request and response.]

**Figure 17.** Read the Current Sign-In Session — Invalid Request and Response

This figure shows a rejected request for “Read the Current Sign-In Session” and the error message returned by the system.

### 1.1.11 Sign Out

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint ends the user's sign-in session.

**Endpoint:** [http://localhost:3001/api/auth/sign-out](http://localhost:3001/api/auth/sign-out)

**Method:** POST

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- For advisers, signing out also closes their open availability, releases active service, and removes their department assignments.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |

**Response (JSON):** The sign-out result is returned and the browser's session cookie is cleared.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 18.** Sign Out — Valid Request and Response

This figure demonstrates the request and returned response for “Sign Out.”

[SCREENSHOT: Invalid request and response.]

**Figure 19.** Sign Out — Invalid Request and Response

This figure shows a rejected request for “Sign Out” and the error message returned by the system.

### 1.1.12 Request an Emailed Password-Reset Link

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint requests an email link for replacing a forgotten password.

**Endpoint:** [http://localhost:3001/api/auth/request-password-reset](http://localhost:3001/api/auth/request-password-reset)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Request body: email (required valid email), redirectTo (optional, trusted-origin restrictions).

**Important Notes:**

- The reset link lasts one hour. The current forgot-password screen directs students to staff instead of calling this endpoint. A confirmation does not prove delivery, and redirectTo does not change the application's emailed destination.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |

**Response (JSON):** A general confirmation is returned without revealing whether the email address belongs to an account. This does not prove the email was delivered.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 20.** Request an Emailed Password-Reset Link — Valid Request and Response

This figure shows the request and returned response for “Request an Emailed Password-Reset Link.”

[SCREENSHOT: Invalid request and response.]

**Figure 21.** Request an Emailed Password-Reset Link — Invalid Request and Response

This figure shows a rejected request for “Request an Emailed Password-Reset Link” and the error message returned by the system.

### 1.1.13 Consume a Password-Reset Token

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint sets a new password using a valid reset link.

**Endpoint:** [http://localhost:3001/api/auth/reset-password](http://localhost:3001/api/auth/reset-password)

**Method:** POST

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Request body: newPassword (required, 8–128 characters), token (body or address filter
- one required
- not empty body value takes precedence).

**Important Notes:**

- The token can be used only once. All existing sessions for the account are ended after this reset. Sign in again before capturing protected endpoints.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |

**Response (JSON):** A confirmation is returned when the password is changed.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 22.** Consume a Password-Reset Token — Valid Request and Response

This figure demonstrates the request and returned response for “Consume a Password-Reset Token.”

[SCREENSHOT: Invalid request and response.]

**Figure 23.** Consume a Password-Reset Token — Invalid Request and Response

This figure shows a rejected request for “Consume a Password-Reset Token” and the error message returned by the system.

### 1.1.14 Library Password-Reset Callback

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks a password-reset link before sending the user to the website.

**Endpoint:** [http://localhost:3001/api/auth/reset-password/:token](http://localhost:3001/api/auth/reset-password/:token)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- Path: token.
- Required address filter: callbackURL, subject to trusted-origin rules.

**Important Notes:**

- The library callback is available, but application reset emails link directly to the website reset page.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 302 | Redirect | Continue on the next page. |

**Response (Redirect):** The browser is sent to the permitted reset page with the token, or with an invalid-token notice.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 24.** Library Password-Reset Callback — Valid Request and Response

This figure shows the request and returned response for “Library Password-Reset Callback.”

[SCREENSHOT: Invalid request and response.]

**Figure 25.** Library Password-Reset Callback — Invalid Request and Response

This figure shows a rejected request for “Library Password-Reset Callback” and the error message returned by the system.

### 1.1.15 Read Sensitive-Action Verification Status

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks the administrator's progress through the security steps.

**Endpoint:** [http://localhost:3001/api/auth/admin-gate/status](http://localhost:3001/api/auth/admin-gate/status)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- next is pin/password/code/totp. Use unlocked to decide whether protected integration operations are available; next alone is not authorization.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 401 | Sign-In Required | Sign in or check your sign-in details. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The result shows whether sensitive actions are unlocked, when the unlock ends, the next security step, and whether an authenticator is set up.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 26.** Read Sensitive-Action Verification Status — Valid Request and Response

This figure demonstrates the request and returned response for “Read Sensitive-Action Verification Status.”

[SCREENSHOT: Invalid request and response.]

**Figure 27.** Read Sensitive-Action Verification Status — Invalid Request and Response

This figure shows a rejected request for “Read Sensitive-Action Verification Status” and the error message returned by the system.

### 1.1.16 Confirm the Administrator PIN

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks the administrator's six-digit security PIN.

**Endpoint:** [http://localhost:3001/api/auth/admin-gate/pin](http://localhost:3001/api/auth/admin-gate/pin)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: pin, exactly six decimal digits.

**Important Notes:**

- Security checks run in order: PIN, password when the account has one, email code, then authenticator or backup code. Each completed step must still be fresh. PIN attempts are limited to eight per account and sixty overall per fifteen minutes.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned when the PIN is accepted.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 28.** Confirm the Administrator PIN — Valid Request and Response

This figure shows the request and returned response for “Confirm the Administrator PIN.”

[SCREENSHOT: Invalid request and response.]

**Figure 29.** Confirm the Administrator PIN — Invalid Request and Response

This figure shows a rejected request for “Confirm the Administrator PIN” and the error message returned by the system.

### 1.1.17 Confirm the Administrator Password

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks the administrator's password during security verification.

**Endpoint:** [http://localhost:3001/api/auth/admin-gate/password](http://localhost:3001/api/auth/admin-gate/password)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: password, 1–128 characters.

**Important Notes:**

- Complete the PIN step first. Accounts without a password skip this step. Password attempts are limited to eight per fifteen minutes per account.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned when the password is accepted.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 30.** Confirm the Administrator Password — Valid Request and Response

This figure demonstrates the request and returned response for “Confirm the Administrator Password.”

[SCREENSHOT: Invalid request and response.]

**Figure 31.** Confirm the Administrator Password — Invalid Request and Response

This figure shows a rejected request for “Confirm the Administrator Password” and the error message returned by the system.

### 1.1.18 Send Administrator Confirmation Email

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint sends a security code to the administrator's email address.

**Endpoint:** [http://localhost:3001/api/auth/admin-gate/code/send](http://localhost:3001/api/auth/admin-gate/code/send)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Complete the preceding security steps first. The code lasts ten minutes. Wait sixty seconds before requesting another. A production email failure clears the verification steps.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 429 | Too Many Attempts | Wait before trying again. |

**Response (JSON):** A confirmation is returned when the email-code request succeeds.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 32.** Send Administrator Confirmation Email — Valid Request and Response

This figure shows the request and returned response for “Send Administrator Confirmation Email.”

[SCREENSHOT: Invalid request and response.]

**Figure 33.** Send Administrator Confirmation Email — Invalid Request and Response

This figure shows a rejected request for “Send Administrator Confirmation Email” and the error message returned by the system.

### 1.1.19 Verify the Emailed Administrator Code

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks the six-digit code sent to the administrator.

**Endpoint:** [http://localhost:3001/api/auth/admin-gate/code/verify](http://localhost:3001/api/auth/admin-gate/code/verify)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: code, exactly six decimal digits.

**Important Notes:**

- Complete the preceding security steps first. Each sent code allows up to five attempts. Request another code if it is expired or used.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned when the code is accepted.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 34.** Verify the Emailed Administrator Code — Valid Request and Response

This figure demonstrates the request and returned response for “Verify the Emailed Administrator Code.”

[SCREENSHOT: Invalid request and response.]

**Figure 35.** Verify the Emailed Administrator Code — Invalid Request and Response

This figure shows a rejected request for “Verify the Emailed Administrator Code” and the error message returned by the system.

### 1.1.20 Prepare Authenticator Enrollment

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint prepares an authenticator app for an administrator.

**Endpoint:** [http://localhost:3001/api/auth/two-factor/enable](http://localhost:3001/api/auth/two-factor/enable)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- password — Include the administrator's password when the account has one.
- issuer — Optional app label. The default is ERPSYS.

**Important Notes:**

- Complete the email-code step first. Keep the setup address and backup codes private. Setup alone does not unlock protected settings. An already-enrolled account must use the authorized reset process instead.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Private setup information and backup codes are returned. Do not include these values in screenshots.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 36.** Prepare Authenticator Enrollment — Valid Request and Response

This figure shows the request and returned response for “Prepare Authenticator Enrollment.”

[SCREENSHOT: Invalid request and response.]

**Figure 37.** Prepare Authenticator Enrollment — Invalid Request and Response

This figure shows a rejected request for “Prepare Authenticator Enrollment” and the error message returned by the system.

### 1.1.21 Verify the Authenticator Code

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks the current code from the administrator's authenticator app.

**Endpoint:** [http://localhost:3001/api/auth/two-factor/verify-totp](http://localhost:3001/api/auth/two-factor/verify-totp)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: code (required string, six-digit 30-second authenticator code)
- trustDevice (optional, true rejected).

**Important Notes:**

- Complete the email-code step first. The first successful check finishes authenticator setup. A trusted-device request is not accepted. Five failed authenticator or backup-code attempts require starting again from the PIN.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 401 | Sign-In Required | Sign in or check your sign-in details. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The verified account and session details are returned. Protected integration actions are unlocked for five minutes.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 38.** Verify the Authenticator Code — Valid Request and Response

This figure demonstrates the request and returned response for “Verify the Authenticator Code.”

[SCREENSHOT: Invalid request and response.]

**Figure 39.** Verify the Authenticator Code — Invalid Request and Response

This figure shows a rejected request for “Verify the Authenticator Code” and the error message returned by the system.

### 1.1.22 Use a One-Time Authenticator Backup Code

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks an unused backup code when the authenticator is unavailable.

**Endpoint:** [http://localhost:3001/api/auth/two-factor/verify-backup-code](http://localhost:3001/api/auth/two-factor/verify-backup-code)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: code (required)
- disableSession (optional true or false), trustDevice (optional
- true rejected).

**Important Notes:**

- Complete the email-code step first. Each backup code works once. It cannot finish an incomplete authenticator setup. Authenticator and backup-code checks share a five-attempt limit.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 401 | Sign-In Required | Sign in or check your sign-in details. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The verified account and session details are returned. The code is used up and protected actions are unlocked for five minutes.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 40.** Use a One-Time Authenticator Backup Code — Valid Request and Response

This figure shows the request and returned response for “Use a One-Time Authenticator Backup Code.”

[SCREENSHOT: Invalid request and response.]

**Figure 41.** Use a One-Time Authenticator Backup Code — Invalid Request and Response

This figure shows a rejected request for “Use a One-Time Authenticator Backup Code” and the error message returned by the system.

## 1.2 STUDENT RECORDS MODULE API

### 1.2.1 Module Description

This module helps students view their enrollment progress. Authorized staff can search student records, review requirements, and send reminders.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/student/profile](http://localhost:3001/api/v1/me/student/profile)
- GET [http://localhost:3001/api/v1/students](http://localhost:3001/api/v1/students)
- GET [http://localhost:3001/api/v1/students/board](http://localhost:3001/api/v1/students/board)
- POST [http://localhost:3001/api/v1/students/reminders](http://localhost:3001/api/v1/students/reminders)
- GET [http://localhost:3001/api/v1/me/student](http://localhost:3001/api/v1/me/student)
- PATCH [http://localhost:3001/api/v1/me/student](http://localhost:3001/api/v1/me/student)
- GET [http://localhost:3001/api/v1/students/:id/record](http://localhost:3001/api/v1/students/:id/record)
- PUT [http://localhost:3001/api/v1/students/:id/mugshot](http://localhost:3001/api/v1/students/:id/mugshot)
- GET [http://localhost:3001/api/v1/students/:id](http://localhost:3001/api/v1/students/:id)
- GET [http://localhost:3001/api/v1/me/record](http://localhost:3001/api/v1/me/record)
- POST [http://localhost:3001/api/v1/me/assessment](http://localhost:3001/api/v1/me/assessment)

### 1.2.2 Read My Profile-Completion Status

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint checks whether the student has completed a profile.

**Endpoint:** [http://localhost:3001/api/v1/me/student/profile](http://localhost:3001/api/v1/me/student/profile)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Does not require an active year.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The result states whether a profile exists and gives the saved student number when available.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 42.** Read My Profile-Completion Status — Valid Request and Response

This figure demonstrates the request and returned response for “Read My Profile-Completion Status.”

[SCREENSHOT: Invalid request and response.]

**Figure 43.** Read My Profile-Completion Status — Invalid Request and Response

This figure shows a rejected request for “Read My Profile-Completion Status” and the error message returned by the system.

### 1.2.3 Search Students or Read the Roster

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint finds students for the user's permitted working area.

**Endpoint:** [http://localhost:3001/api/v1/students](http://localhost:3001/api/v1/students)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Optional address filter: q (up to 100), page (default 1), pageSize and limit (1–100, each default 50), cursor, sort, dir (asc/desc, default desc), role, outside, academicYearId, departmentId, yearLevel.
- Optional address filter: academicYearId
- scope (mine/all, default mine)
- sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt)
- dir (asc/desc)
- q (up to 100 characters)
- departmentIds, yearLevels, buckets, steps (repeat array address filter keys for multiple selections)
- stepState
- enrolled (true/false)
- unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Important Notes:**

- Administrators normally receive the account directory. Advisers receive a roster and use cursor to continue the list; page does not move that roster. Officers receive student-search choices, and an empty q gives no choices. Keep pageSize and limit equal. Repeat a filter name to choose several values; do not join the values with commas. Choosing scope all is a list filter, not a new permission.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A page of account, roster, or student-search results is returned, depending on the caller and selected filters.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 44.** Search Students or Read the Roster — Valid Request and Response

This figure shows the request and returned response for “Search Students or Read the Roster.”

[SCREENSHOT: Invalid request and response.]

**Figure 45.** Search Students or Read the Roster — Invalid Request and Response

This figure shows a rejected request for “Search Students or Read the Roster” and the error message returned by the system.

### 1.2.4 Read Roster Rows and Summary Together

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint loads a student roster and its summary in one request.

**Endpoint:** [http://localhost:3001/api/v1/students/board](http://localhost:3001/api/v1/students/board)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Optional address filter: academicYearId
- scope (mine/all, default mine)
- sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt)
- dir (asc/desc)
- q (up to 100 characters)
- departmentIds, yearLevels, buckets, steps (repeat array address filter keys for multiple selections)
- stepState
- enrolled (true/false)
- unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.
- Optional cursor
- limit 1–100, default 50.

**Important Notes:**

- The summary does not use progress-group filters. Its totals can therefore differ from a filtered student list.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The student rows, paging information, selected year, and summary totals are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 46.** Read Roster Rows and Summary Together — Valid Request and Response

This figure demonstrates the request and returned response for “Read Roster Rows and Summary Together.”

[SCREENSHOT: Invalid request and response.]

**Figure 47.** Read Roster Rows and Summary Together — Invalid Request and Response

This figure shows a rejected request for “Read Roster Rows and Summary Together” and the error message returned by the system.

### 1.2.5 Send In-App Requirement Reminders

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint sends requirement reminders to selected students.

**Endpoint:** [http://localhost:3001/api/v1/students/reminders](http://localhost:3001/api/v1/students/reminders)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: studentProfileIds (required array, 1–200 not empty identifiers)
- academicYearId (optional).

**Important Notes:**

- Deduplicates IDs. Skips missing users/profiles, completed students, and students placed in a department not assigned to the person making the request. An unplaced profile may still receive a reminder. This sends in-app notices, not email or SMS.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The counts of sent and skipped reminders are returned. These are website notifications, not email or text messages.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 48.** Send In-App Requirement Reminders — Valid Request and Response

This figure shows the request and returned response for “Send In-App Requirement Reminders.”

[SCREENSHOT: Invalid request and response.]

**Figure 49.** Send In-App Requirement Reminders — Invalid Request and Response

This figure shows a rejected request for “Send In-App Requirement Reminders” and the error message returned by the system.

### 1.2.6 Read My Enrollment Progress

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint shows the student's placement and requirement progress.

**Endpoint:** [http://localhost:3001/api/v1/me/student](http://localhost:3001/api/v1/me/student)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- A missing profile or active year is shown in the result rather than always treated as an error. Without an active year, the year is empty and progress totals are zero.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The profile, enrollment periods, requirement states, queue eligibility, progress totals, and queue status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 50.** Read My Enrollment Progress — Valid Request and Response

This figure demonstrates the request and returned response for “Read My Enrollment Progress.”

[SCREENSHOT: Invalid request and response.]

**Figure 51.** Read My Enrollment Progress — Invalid Request and Response

This figure shows a rejected request for “Read My Enrollment Progress” and the error message returned by the system.

### 1.2.7 Claim My Student Number

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint saves a missing student number for the signed-in student.

**Endpoint:** [http://localhost:3001/api/v1/me/student](http://localhost:3001/api/v1/me/student)

**Method:** PATCH

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: studentNumber (required with extra outside spaces removed, not empty digits-only string).

**Important Notes:**

- Claims a missing profile; it does not replace an already-saved number. Existing profile numbers are returned unchanged. No fixed nine-digit limit is enforced.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The saved student number is returned. An existing number is kept unchanged.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 52.** Claim My Student Number — Valid Request and Response

This figure shows the request and returned response for “Claim My Student Number.”

[SCREENSHOT: Invalid request and response.]

**Figure 53.** Claim My Student Number — Invalid Request and Response

This figure shows a rejected request for “Claim My Student Number” and the error message returned by the system.

### 1.2.8 Read a Student's Record-Sheet Data

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint provides information for a student's record sheet.

**Endpoint:** [http://localhost:3001/api/v1/students/:id/record](http://localhost:3001/api/v1/students/:id/record)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Path: id is a student-profile identifier.
- Optional address filter: academicYearId, scope (mine/all, default mine).

**Important Notes:**

- Staff can read an incomplete record. Adviser scope checks work as in the student-detail endpoint. The website uses the returned information to prepare a PDF.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The student's details, school year, placement, requirement progress, enrollment completion time, and queue information are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 54.** Read a Student's Record-Sheet Data — Valid Request and Response

This figure demonstrates the request and returned response for “Read a Student's Record-Sheet Data.”

[SCREENSHOT: Invalid request and response.]

**Figure 55.** Read a Student's Record-Sheet Data — Invalid Request and Response

This figure shows a rejected request for “Read a Student's Record-Sheet Data” and the error message returned by the system.

### 1.2.9 Capture and Verify a Mugshot

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint saves a student's photo and approves the mugshot requirement.

**Endpoint:** [http://localhost:3001/api/v1/students/:id/mugshot](http://localhost:3001/api/v1/students/:id/mugshot)

**Method:** PUT

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id is a step-verification identifier, despite the students path.
- Request body: fileKey (required string, 1–500 characters), fileUrl (required string, 1–2,000,000 characters).

**Important Notes:**

- Use an existing, unverified MUGSHOT requirement-review identifier for the active year, not the student-profile identifier. Save the photo reference first. Revoke an existing approval before recapturing.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The requirement-review identifier, verified status, and upload identifier are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 56.** Capture and Verify a Mugshot — Valid Request and Response

This figure shows the request and returned response for “Capture and Verify a Mugshot.”

[SCREENSHOT: Invalid request and response.]

**Figure 57.** Capture and Verify a Mugshot — Invalid Request and Response

This figure shows a rejected request for “Capture and Verify a Mugshot” and the error message returned by the system.

### 1.2.10 Read a Student's Enrollment Detail

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint shows a selected student's enrollment and requirements.

**Endpoint:** [http://localhost:3001/api/v1/students/:id](http://localhost:3001/api/v1/students/:id)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Path: id is a student-profile identifier.
- Optional address filter: academicYearId, scope (mine/all, default mine).

**Important Notes:**

- Staff access is required. For advisers, scope mine checks the department when placement exists. The implemented scope all option skips that particular department check; do not describe access as always limited to one department.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The student's details, selected year, placement, requirements, queue information, and pending items are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 58.** Read a Student's Enrollment Detail — Valid Request and Response

This figure demonstrates the request and returned response for “Read a Student's Enrollment Detail.”

[SCREENSHOT: Invalid request and response.]

**Figure 59.** Read a Student's Enrollment Detail — Invalid Request and Response

This figure shows a rejected request for “Read a Student's Enrollment Detail” and the error message returned by the system.

### 1.2.11 Read My Completed Enrollment Record

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint provides the student's completed enrollment record.

**Endpoint:** [http://localhost:3001/api/v1/me/record](http://localhost:3001/api/v1/me/record)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Capture after enrollment is verified for the active year. Before then, a successful request returns null rather than a completed record.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The completed record details are returned, or an empty result when enrollment is not yet verified. The website prepares the PDF.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 60.** Read My Completed Enrollment Record — Valid Request and Response

This figure shows the request and returned response for “Read My Completed Enrollment Record.”

[SCREENSHOT: Invalid request and response.]

**Figure 61.** Read My Completed Enrollment Record — Invalid Request and Response

This figure shows a rejected request for “Read My Completed Enrollment Record” and the error message returned by the system.

### 1.2.12 Request Assessment Review

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint asks an SBO officer to review the student's assessment requirement.

**Endpoint:** [http://localhost:3001/api/v1/me/assessment](http://localhost:3001/api/v1/me/assessment)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- No evidence-upload body is required. Internally this creates or reopens pending assessment review; do not infer the saved status from the APPLIED response alone.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The result indicates that review was requested, or that the requirement was already verified.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 62.** Request Assessment Review — Valid Request and Response

This figure demonstrates the request and returned response for “Request Assessment Review.”

[SCREENSHOT: Invalid request and response.]

**Figure 63.** Request Assessment Review — Invalid Request and Response

This figure shows a rejected request for “Request Assessment Review” and the error message returned by the system.

## 1.3 ENROLLMENT MODULE API

### 1.3.1 Module Description

This module saves a student's course and year level. It also lets assigned advisers finish enrollment or correct an enrollment marked complete by mistake.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/enrollments](http://localhost:3001/api/v1/me/enrollments)
- POST [http://localhost:3001/api/v1/me/enrollments](http://localhost:3001/api/v1/me/enrollments)
- DELETE [http://localhost:3001/api/v1/enrollments/completions](http://localhost:3001/api/v1/enrollments/completions)
- POST [http://localhost:3001/api/v1/enrollments/:id/completion](http://localhost:3001/api/v1/enrollments/:id/completion)
- DELETE [http://localhost:3001/api/v1/enrollments/:id/completion](http://localhost:3001/api/v1/enrollments/:id/completion)

### 1.3.2 List My Enrollment Periods

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint shows the student's saved enrollment periods.

**Endpoint:** [http://localhost:3001/api/v1/me/enrollments](http://localhost:3001/api/v1/me/enrollments)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- No consumed paging address filter. Sorted by enrollment-period creation time. No profile returns an empty list.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The school years, semesters, departments, year levels, and active-period status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 64.** List My Enrollment Periods — Valid Request and Response

This figure shows the request and returned response for “List My Enrollment Periods.”

[SCREENSHOT: Invalid request and response.]

**Figure 65.** List My Enrollment Periods — Invalid Request and Response

This figure shows a rejected request for “List My Enrollment Periods” and the error message returned by the system.

### 1.3.3 Save My Enrollment Placement

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint saves the student's selected school year, department, and year level.

**Endpoint:** [http://localhost:3001/api/v1/me/enrollments](http://localhost:3001/api/v1/me/enrollments)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: academicYearId, departmentId, yearLevel (all required).
- Optional studentNumber (with extra outside spaces removed digits-only string). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Important Notes:**

- Accepts an existing year, not only the active year. Existing number is remaining. Changed course and year-level selection is refused if a queue entry exists, including completed entries. Unchanged course and year-level selection is accepted without the change checks.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The placement details and saved student number are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 66.** Save My Enrollment Placement — Valid Request and Response

This figure demonstrates the request and returned response for “Save My Enrollment Placement.”

[SCREENSHOT: Invalid request and response.]

**Figure 67.** Save My Enrollment Placement — Invalid Request and Response

This figure shows a rejected request for “Save My Enrollment Placement” and the error message returned by the system.

### 1.3.4 Revert Multiple Completed Enrollments

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint corrects several enrollments marked complete by mistake.

**Endpoint:** [http://localhost:3001/api/v1/enrollments/completions](http://localhost:3001/api/v1/enrollments/completions)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId and reason (10–500 characters), required.
- Supply enrollmentIds and/or ids arrays
- combine to 1–50 distinct queue-entry identifiers.

**Important Notes:**

- Entries are checked first, then reversed one at a time. A later failure must not be treated as proof that all earlier changes were undone.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |

**Response (JSON):** The number and identifiers of reversed enrollments and returned queue entries are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 68.** Revert Multiple Completed Enrollments — Valid Request and Response

This figure shows the request and returned response for “Revert Multiple Completed Enrollments.”

[SCREENSHOT: Invalid request and response.]

**Figure 69.** Revert Multiple Completed Enrollments — Invalid Request and Response

This figure shows a rejected request for “Revert Multiple Completed Enrollments” and the error message returned by the system.

### 1.3.5 Complete Enrollment from a Queue Entry

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint marks the student currently being served as enrolled.

**Endpoint:** [http://localhost:3001/api/v1/enrollments/:id/completion](http://localhost:3001/api/v1/enrollments/:id/completion)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id is a queue-entry identifier, not a student-profile or course and year-level selection identifier.
- Request body: departmentId (required).

**Important Notes:**

- Use a current-year queue-entry identifier. All five earlier requirements must be verified, and this same assigned adviser must currently be serving the student. Repeating an already-completed entry returns already.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The queue-entry identifier, student name, and outcome are returned. An already-completed entry is reported as already enrolled.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 70.** Complete Enrollment from a Queue Entry — Valid Request and Response

This figure demonstrates the request and returned response for “Complete Enrollment from a Queue Entry.”

[SCREENSHOT: Invalid request and response.]

**Figure 71.** Complete Enrollment from a Queue Entry — Invalid Request and Response

This figure shows a rejected request for “Complete Enrollment from a Queue Entry” and the error message returned by the system.

### 1.3.6 Revert One Completed Enrollment

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint corrects an enrollment marked complete by mistake.

**Endpoint:** [http://localhost:3001/api/v1/enrollments/:id/completion](http://localhost:3001/api/v1/enrollments/:id/completion)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id is a queue-entry identifier.
- Request body: departmentId and reason (10–500 characters), both required.

**Important Notes:**

- Returns the same entry to the front of the waiting line and withdraws enrollment verification.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The reversal confirmation and returned queue-entry identifier are returned. The student goes back to the front of the waiting line.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 72.** Revert One Completed Enrollment — Valid Request and Response

This figure shows the request and returned response for “Revert One Completed Enrollment.”

[SCREENSHOT: Invalid request and response.]

**Figure 73.** Revert One Completed Enrollment — Invalid Request and Response

This figure shows a rejected request for “Revert One Completed Enrollment” and the error message returned by the system.

## 1.4 REQUIREMENT EVIDENCE MODULE API

### 1.4.1 Module Description

This module manages the files and links that students use as proof of completing a requirement. Students can submit or withdraw eligible requirements for review.

This module has the following endpoints:

- POST [http://localhost:3001/api/v1/evidence](http://localhost:3001/api/v1/evidence)
- DELETE [http://localhost:3001/api/v1/evidence/:id](http://localhost:3001/api/v1/evidence/:id)
- PUT [http://localhost:3001/api/v1/me/evidence-link](http://localhost:3001/api/v1/me/evidence-link)
- DELETE [http://localhost:3001/api/v1/me/evidence-link](http://localhost:3001/api/v1/me/evidence-link)
- POST [http://localhost:3001/api/v1/me/steps/:code/submission](http://localhost:3001/api/v1/me/steps/:code/submission)
- DELETE [http://localhost:3001/api/v1/me/steps/:code/submission](http://localhost:3001/api/v1/me/steps/:code/submission)

### 1.4.2 Attach File Metadata to a Requirement

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint records the file reference used as requirement evidence.

**Endpoint:** [http://localhost:3001/api/v1/evidence](http://localhost:3001/api/v1/evidence)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: stepCode (SOCIAL_MEDIA/PROFILING/MUGSHOT/CONSENT), fileKey (1–500 characters), fileUrl (valid URL, at most 1,000 characters), all required.

**Important Notes:**

- Records the supplied key/URL; this call does not verify stored bytes exist. Without a verification, returns the new draft; with one, returns attached evidence. Adding to a returned verification changes it to submitted.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The file identifiers, links, type, and expiry details are returned. This action records file details; it does not prove a file was uploaded.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 74.** Attach File Metadata to a Requirement — Valid Request and Response

This figure demonstrates the request and returned response for “Attach File Metadata to a Requirement.”

[SCREENSHOT: Invalid request and response.]

**Figure 75.** Attach File Metadata to a Requirement — Invalid Request and Response

This figure shows a rejected request for “Attach File Metadata to a Requirement” and the error message returned by the system.

### 1.4.3 Delete My Upload Metadata

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint removes the student's permitted upload record.

**Endpoint:** [http://localhost:3001/api/v1/evidence/:id](http://localhost:3001/api/v1/evidence/:id)

**Method:** DELETE

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Path: id is the upload identifier.

**Important Notes:**

- Checks ownership and verified-step restrictions. Removes the upload row; existing verification identifier references are not rewritten by this handler. Object deletion is best-effort.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** A deletion confirmation is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 76.** Delete My Upload Metadata — Valid Request and Response

This figure shows the request and returned response for “Delete My Upload Metadata.”

[SCREENSHOT: Invalid request and response.]

**Figure 77.** Delete My Upload Metadata — Invalid Request and Response

This figure shows a rejected request for “Delete My Upload Metadata” and the error message returned by the system.

### 1.4.4 Save an External Evidence Link

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint saves a web link as proof for a requirement.

**Endpoint:** [http://localhost:3001/api/v1/me/evidence-link](http://localhost:3001/api/v1/me/evidence-link)

**Method:** PUT

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: stepCode (SOCIAL_MEDIA/PROFILING/MUGSHOT/CONSENT), url (valid URL, at most 1,000 characters), both required.

**Important Notes:**

- A different address adds another link. This endpoint does not itself reject an already-verified step. Saving a link is separate from submitting the requirement.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The student's saved external evidence links are returned. Saving the link does not submit the requirement for review.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 78.** Save an External Evidence Link — Valid Request and Response

This figure demonstrates the request and returned response for “Save an External Evidence Link.”

[SCREENSHOT: Invalid request and response.]

**Figure 79.** Save an External Evidence Link — Invalid Request and Response

This figure shows a rejected request for “Save an External Evidence Link” and the error message returned by the system.

### 1.4.5 Remove External Evidence Links

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint removes external proof links for a selected requirement.

**Endpoint:** [http://localhost:3001/api/v1/me/evidence-link](http://localhost:3001/api/v1/me/evidence-link)

**Method:** DELETE

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: stepCode (required upload-capable step code).

**Important Notes:**

- Without a verification, removes links for that step and returns remaining file drafts of that kind. With a verification, removes its referenced external links and may delete an empty verification.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The remaining evidence details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 80.** Remove External Evidence Links — Valid Request and Response

This figure shows the request and returned response for “Remove External Evidence Links.”

[SCREENSHOT: Invalid request and response.]

**Figure 81.** Remove External Evidence Links — Invalid Request and Response

This figure shows a rejected request for “Remove External Evidence Links” and the error message returned by the system.

### 1.4.6 Submit a Requirement for Review

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint sends the student's requirement to an SBO officer for checking.

**Endpoint:** [http://localhost:3001/api/v1/me/steps/:code/submission](http://localhost:3001/api/v1/me/steps/:code/submission)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Path: code is SOCIAL_MEDIA, PROFILING, MUGSHOT, or CONSENT. No business body fields.

**Important Notes:**

- For profiling, checks the latest Google Form response matching the session email; screenshots/links are not the profiling completion check. Other steps collect eligible non-expired uploads and step links. Profiling evidence may be empty.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The submitted status and attached evidence are returned. Profiling checks the Google Form answer and may have no attached file.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 82.** Submit a Requirement for Review — Valid Request and Response

This figure demonstrates the request and returned response for “Submit a Requirement for Review.”

[SCREENSHOT: Invalid request and response.]

**Figure 83.** Submit a Requirement for Review — Invalid Request and Response

This figure shows a rejected request for “Submit a Requirement for Review” and the error message returned by the system.

### 1.4.7 Cancel a Submitted Requirement

**Version:** 1.0

**Date:** November 14, 2026

**Description:** This endpoint withdraws a requirement that is still awaiting review.

**Endpoint:** [http://localhost:3001/api/v1/me/steps/:code/submission](http://localhost:3001/api/v1/me/steps/:code/submission)

**Method:** DELETE

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Path: code is an upload-capable step. No business body fields.

**Important Notes:**

- Deletes a submitted verification and retains eligible file evidence as drafts with a fresh 24-hour expiry.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The requirement returns to pending. Eligible files remain as drafts for 24 hours.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 84.** Cancel a Submitted Requirement — Valid Request and Response

This figure shows the request and returned response for “Cancel a Submitted Requirement.”

[SCREENSHOT: Invalid request and response.]

**Figure 85.** Cancel a Submitted Requirement — Invalid Request and Response

This figure shows a rejected request for “Cancel a Submitted Requirement” and the error message returned by the system.

## 1.5 FILE UPLOAD MODULE API

### 1.5.1 Module Description

This module gives permitted users a secure way to upload files and view stored evidence. Starting an upload and finishing an upload are separate steps.

This module has the following endpoints:

- POST [http://localhost:3001/api/v1/storage/session](http://localhost:3001/api/v1/storage/session)
- POST [http://localhost:3001/api/v1/storage/complete](http://localhost:3001/api/v1/storage/complete)
- GET [http://localhost:3001/api/v1/storage/session-status](http://localhost:3001/api/v1/storage/session-status)
- GET [http://localhost:3001/api/v1/uploads/:id/content](http://localhost:3001/api/v1/uploads/:id/content)

### 1.5.2 Start an Authorized Upload

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint requests permission and an address for uploading a file.

**Endpoint:** [http://localhost:3001/api/v1/storage/session](http://localhost:3001/api/v1/storage/session)

**Method:** POST

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- route — Required upload purpose: evidenceImage, mugshotCapture, or stampImage.
- mime — Required file type: image/jpeg, image/png, image/webp, or application/pdf.
- size — Required file size in bytes. Evidence and mugshot files may be up to 10 MiB; stamp files may be up to 5 MiB.
- stepCode — Required for evidenceImage. Do not send studentProfileId for this route.
- studentProfileId — Required for mugshotCapture and stampImage. Use the student's profile identifier.

**Important Notes:**

- Student-facing access for evidenceImage; officer access for capture/stamp. Requires active year and applicable profile/email ownership checks. Student upload email must be the university student domain; officer-target uploads require a student with that domain. Upload directly to the returned URL, then finalize. Sessions last 24 hours. Twenty mint requests per minute per user/IP. Storage outages/quotas return a direct the fields code: STORAGE_QUOTA_EXCEEDED, message body, not the standard error wrapper.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The upload identifier, upload address, and expiry time are returned. The file must then be sent to that address and the upload finalized.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 86.** Start an Authorized Upload — Valid Request and Response

This figure demonstrates the request and returned response for “Start an Authorized Upload.”

[SCREENSHOT: Invalid request and response.]

**Figure 87.** Start an Authorized Upload — Invalid Request and Response

This figure shows a rejected request for “Start an Authorized Upload” and the error message returned by the system.

### 1.5.3 Finalize an Upload

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint checks a transferred file and completes its upload record.

**Endpoint:** [http://localhost:3001/api/v1/storage/complete](http://localhost:3001/api/v1/storage/complete)

**Method:** POST

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Request body: uploadId (required)
- stepCode (optional string, 1–64 characters).

**Important Notes:**

- Start a session, PUT the actual file bytes to its returned uploadUrl with the matching content type and size, then finalize using that uploadId. Starting a session alone is not an uploaded file. Repeating a completed upload is accepted.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The file identifier, storage reference, type, and expiry details are returned. A private stored file may have no public file link.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 88.** Finalize an Upload — Valid Request and Response

This figure shows the request and returned response for “Finalize an Upload.”

[SCREENSHOT: Invalid request and response.]

**Figure 89.** Finalize an Upload — Invalid Request and Response

This figure shows a rejected request for “Finalize an Upload” and the error message returned by the system.

### 1.5.4 Read Upload Session Status

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint checks the progress of an upload.

**Endpoint:** [http://localhost:3001/api/v1/storage/session-status](http://localhost:3001/api/v1/storage/session-status)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Required address filter: uploadId.

**Important Notes:**

- Only users allowed to see the upload can check it. Passing the expiry time alone does not change the status to abandoned.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The result shows whether the upload is pending, complete, or abandoned. Received size and storage details are included when available.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 90.** Read Upload Session Status — Valid Request and Response

This figure demonstrates the request and returned response for “Read Upload Session Status.”

[SCREENSHOT: Invalid request and response.]

**Figure 91.** Read Upload Session Status — Invalid Request and Response

This figure shows a rejected request for “Read Upload Session Status” and the error message returned by the system.

### 1.5.5 Read Authorized File Content

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint opens a stored file for a user who is allowed to view it.

**Endpoint:** [http://localhost:3001/api/v1/uploads/:id/content](http://localhost:3001/api/v1/uploads/:id/content)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- Path: id is the upload identifier.
- Optional HTTP Range header.

**Important Notes:**

- Use an actual completed private-storage upload identifier and an account allowed to view it. This endpoint returns file bytes, not JSON.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | OK / Partial Content (206) | The file or requested part is returned. |
| 403 | Access Denied | You cannot view this file. |
| 404 | Not Found | The file cannot be found. |

**Response (File content):** The file itself, or the requested portion of it, is returned rather than a normal information response.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 92.** Read Authorized File Content — Valid Request and Response

This figure shows the request and returned response for “Read Authorized File Content.”

[SCREENSHOT: Invalid request and response.]

**Figure 93.** Read Authorized File Content — Invalid Request and Response

This figure shows a rejected request for “Read Authorized File Content” and the error message returned by the system.

## 1.6 REQUIREMENT REVIEW MODULE API

### 1.6.1 Module Description

This module lets SBO officers review student submissions, approve requirements, and return unclear or incomplete evidence with feedback.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/submissions](http://localhost:3001/api/v1/submissions)
- GET [http://localhost:3001/api/v1/submissions/:verificationId](http://localhost:3001/api/v1/submissions/:verificationId)
- POST [http://localhost:3001/api/v1/submissions/:id/verification](http://localhost:3001/api/v1/submissions/:id/verification)
- DELETE [http://localhost:3001/api/v1/submissions/:id/verification](http://localhost:3001/api/v1/submissions/:id/verification)
- POST [http://localhost:3001/api/v1/submissions/:id/replies](http://localhost:3001/api/v1/submissions/:id/replies)

### 1.6.2 List Requirement Submissions

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint shows student requirements waiting for or undergoing review.

**Endpoint:** [http://localhost:3001/api/v1/submissions](http://localhost:3001/api/v1/submissions)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Optional address filter: step (ASSESSMENT, SOCIAL_MEDIA, PROFILING, MUGSHOT, CONSENT)
- page (default 1), pageSize (1–100, default 50)
- sort (submittedAt, studentName, status
- default submittedAt)
- dir (asc/desc, default asc)
- q (up to 100 characters)
- status (ALL, PENDING, SUBMITTED, VERIFIED, RETURNED)
- evidence (ALL, HAS, NONE)
- range (ALL, today, 7d, 30d, year).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Matching submission rows and paging information are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 94.** List Requirement Submissions — Valid Request and Response

This figure demonstrates the request and returned response for “List Requirement Submissions.”

[SCREENSHOT: Invalid request and response.]

**Figure 95.** List Requirement Submissions — Invalid Request and Response

This figure shows a rejected request for “List Requirement Submissions” and the error message returned by the system.

### 1.6.3 Read a Submission in Full

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint shows the evidence and history for one requirement submission.

**Endpoint:** [http://localhost:3001/api/v1/submissions/:verificationId](http://localhost:3001/api/v1/submissions/:verificationId)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: verificationId is a step-verification identifier.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The student, requirement, review status, evidence, checklist, stamp, and review history are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 96.** Read a Submission in Full — Valid Request and Response

This figure shows the request and returned response for “Read a Submission in Full.”

[SCREENSHOT: Invalid request and response.]

**Figure 97.** Read a Submission in Full — Invalid Request and Response

This figure shows a rejected request for “Read a Submission in Full” and the error message returned by the system.

### 1.6.4 Verify a Submission

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint approves a student's requirement submission.

**Endpoint:** [http://localhost:3001/api/v1/submissions/:id/verification](http://localhost:3001/api/v1/submissions/:id/verification)

**Method:** POST

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id is a step-verification identifier. No business body fields.

**Important Notes:**

- Uses the officer's configured stamp; saved stamp changes use the separate stamp endpoint.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The requirement-review identifier and verified status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 98.** Verify a Submission — Valid Request and Response

This figure demonstrates the request and returned response for “Verify a Submission.”

[SCREENSHOT: Invalid request and response.]

**Figure 99.** Verify a Submission — Invalid Request and Response

This figure shows a rejected request for “Verify a Submission” and the error message returned by the system.

### 1.6.5 Withdraw a Verification

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint removes a requirement's previous approval.

**Endpoint:** [http://localhost:3001/api/v1/submissions/:id/verification](http://localhost:3001/api/v1/submissions/:id/verification)

**Method:** DELETE

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id is a step-verification identifier. No business body fields.

**Important Notes:**

- Use a currently VERIFIED requirement in the active enrollment year. Revoking a pending or returned requirement is refused.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The requirement-review identifier and pending status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 100.** Withdraw a Verification — Valid Request and Response

This figure shows the request and returned response for “Withdraw a Verification.”

[SCREENSHOT: Invalid request and response.]

**Figure 101.** Withdraw a Verification — Invalid Request and Response

This figure shows a rejected request for “Withdraw a Verification” and the error message returned by the system.

### 1.6.6 Return a Submission with Feedback

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint returns a requirement to the student with correction notes.

**Endpoint:** [http://localhost:3001/api/v1/submissions/:id/replies](http://localhost:3001/api/v1/submissions/:id/replies)

**Method:** POST

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id is a step-verification identifier.
- Request body: chips (optional not empty strings, at most ten, default an empty list), note (optional string, up to 500).

**Important Notes:**

- Use an existing requirement in the active year that is not VERIFIED. Revoke an approval before returning the requirement with feedback.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The requirement-review identifier and returned status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 102.** Return a Submission with Feedback — Valid Request and Response

This figure demonstrates the request and returned response for “Return a Submission with Feedback.”

[SCREENSHOT: Invalid request and response.]

**Figure 103.** Return a Submission with Feedback — Invalid Request and Response

This figure shows a rejected request for “Return a Submission with Feedback” and the error message returned by the system.

## 1.7 ENROLLMENT QUEUE MODULE API

### 1.7.1 Module Description

This module manages the waiting line for enrollment. Students can join or leave the line, while assigned advisers serve eligible students.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)
- POST [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)
- DELETE [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)
- GET [http://localhost:3001/api/v1/queues](http://localhost:3001/api/v1/queues)
- POST [http://localhost:3001/api/v1/queues/serving](http://localhost:3001/api/v1/queues/serving)
- DELETE [http://localhost:3001/api/v1/queues/serving](http://localhost:3001/api/v1/queues/serving)
- POST [http://localhost:3001/api/v1/queues/serving/position](http://localhost:3001/api/v1/queues/serving/position)
- POST [http://localhost:3001/api/v1/queue-entries/:id/removal](http://localhost:3001/api/v1/queue-entries/:id/removal)
- POST [http://localhost:3001/api/v1/queue-entries/:id/restoration](http://localhost:3001/api/v1/queue-entries/:id/restoration)

### 1.7.2 Read My Queue Position

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint shows the student's current place in the enrollment line.

**Endpoint:** [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The current queue details are returned, or an empty result when the student is not in a queue.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 104.** Read My Queue Position — Valid Request and Response

This figure shows the request and returned response for “Read My Queue Position.”

[SCREENSHOT: Invalid request and response.]

**Figure 105.** Read My Queue Position — Invalid Request and Response

This figure shows a rejected request for “Read My Queue Position” and the error message returned by the system.

### 1.7.3 Join My Enrollment Queue

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint adds an eligible student to the department's enrollment line.

**Endpoint:** [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Request body: departmentId (required).

**Important Notes:**

- Requires verified pre-enrollment steps, eligible course/year level, and a currently available adviser. Switching queues requires leaving the previous one first; opening a share link does not join automatically.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The queue-entry identifier, department name, and waiting position are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 106.** Join My Enrollment Queue — Valid Request and Response

This figure demonstrates the request and returned response for “Join My Enrollment Queue.”

[SCREENSHOT: Invalid request and response.]

**Figure 107.** Join My Enrollment Queue — Invalid Request and Response

This figure shows a rejected request for “Join My Enrollment Queue” and the error message returned by the system.

### 1.7.4 Leave My Waiting Queue

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint removes the student from the waiting line.

**Endpoint:** [http://localhost:3001/api/v1/me/queue](http://localhost:3001/api/v1/me/queue)

**Method:** DELETE

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Repeated exit when no entry exists is accepted. A student being served cannot leave.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** A confirmation is returned. A student currently being served cannot leave through this action.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 108.** Leave My Waiting Queue — Valid Request and Response

This figure shows the request and returned response for “Leave My Waiting Queue.”

[SCREENSHOT: Invalid request and response.]

**Figure 109.** Leave My Waiting Queue — Invalid Request and Response

This figure shows a rejected request for “Leave My Waiting Queue” and the error message returned by the system.

### 1.7.5 Monitor My Department Queues

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint shows the waiting lines handled by the adviser.

**Endpoint:** [http://localhost:3001/api/v1/queues](http://localhost:3001/api/v1/queues)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- The current implementation uses resource reads; there is no mounted queue-event stream.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The department queues and information about students being served are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 110.** Monitor My Department Queues — Valid Request and Response

This figure demonstrates the request and returned response for “Monitor My Department Queues.”

[SCREENSHOT: Invalid request and response.]

**Figure 111.** Monitor My Department Queues — Invalid Request and Response

This figure shows a rejected request for “Monitor My Department Queues” and the error message returned by the system.

### 1.7.6 Serve the Next Eligible Student

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint starts service for the next eligible student in the line.

**Endpoint:** [http://localhost:3001/api/v1/queues/serving](http://localhost:3001/api/v1/queues/serving)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId and entryId (required not empty identifiers).

**Important Notes:**

- Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The queue-entry identifier and service status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 112.** Serve the Next Eligible Student — Valid Request and Response

This figure shows the request and returned response for “Serve the Next Eligible Student.”

[SCREENSHOT: Invalid request and response.]

**Figure 113.** Serve the Next Eligible Student — Invalid Request and Response

This figure shows a rejected request for “Serve the Next Eligible Student” and the error message returned by the system.

### 1.7.7 Release the Served Student

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint ends the adviser's current service for a student.

**Endpoint:** [http://localhost:3001/api/v1/queues/serving](http://localhost:3001/api/v1/queues/serving)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId and entryId (required not empty identifiers).

**Important Notes:**

- Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The queue-entry identifier and updated status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 114.** Release the Served Student — Valid Request and Response

This figure demonstrates the request and returned response for “Release the Served Student.”

[SCREENSHOT: Invalid request and response.]

**Figure 115.** Release the Served Student — Invalid Request and Response

This figure shows a rejected request for “Release the Served Student” and the error message returned by the system.

### 1.7.8 Move the Served Student to the End

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint returns the served student to the end of the waiting line.

**Endpoint:** [http://localhost:3001/api/v1/queues/serving/position](http://localhost:3001/api/v1/queues/serving/position)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId and entryId (required not empty identifiers).
- Optional to: end.

**Important Notes:**

- Assignment, current service, and queue order are checked. Sending an arbitrary waiting entry does not bypass first-in-first-out service.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The queue-entry identifier and new position are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 116.** Move the Served Student to the End — Valid Request and Response

This figure shows the request and returned response for “Move the Served Student to the End.”

[SCREENSHOT: Invalid request and response.]

**Figure 117.** Move the Served Student to the End — Invalid Request and Response

This figure shows a rejected request for “Move the Served Student to the End” and the error message returned by the system.

### 1.7.9 Remove a Waiting Queue Entry

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint removes a waiting student from the line.

**Endpoint:** [http://localhost:3001/api/v1/queue-entries/:id/removal](http://localhost:3001/api/v1/queue-entries/:id/removal)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id. No business body fields.

**Important Notes:**

- Only waiting entries may be removed. Keep the returned snapshot unchanged for Undo. A simultaneous change can return removed false with a reason, not a successful deletion.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The result states whether removal happened and includes the information needed for Undo. A changed entry may return a reason instead.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 118.** Remove a Waiting Queue Entry — Valid Request and Response

This figure demonstrates the request and returned response for “Remove a Waiting Queue Entry.”

[SCREENSHOT: Invalid request and response.]

**Figure 119.** Remove a Waiting Queue Entry — Invalid Request and Response

This figure shows a rejected request for “Remove a Waiting Queue Entry” and the error message returned by the system.

### 1.7.10 Restore a Removed Queue Entry

**Version:** 1.0

**Date:** November 15, 2026

**Description:** This endpoint puts a recently removed student back in the line.

**Endpoint:** [http://localhost:3001/api/v1/queue-entries/:id/restoration](http://localhost:3001/api/v1/queue-entries/:id/restoration)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Request body: departmentId, studentProfileId, academicYearId, joinedAt, studentName, token (all required
- copy the removal snapshot).

**Important Notes:**

- Copy the removal information without changing it. The website offers Undo for five seconds; the server accepts its signed token for up to sixty seconds. The student's original joining time is kept.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The restoration confirmation and queue-entry identifier are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 120.** Restore a Removed Queue Entry — Valid Request and Response

This figure shows the request and returned response for “Restore a Removed Queue Entry.”

[SCREENSHOT: Invalid request and response.]

**Figure 121.** Restore a Removed Queue Entry — Invalid Request and Response

This figure shows a rejected request for “Restore a Removed Queue Entry” and the error message returned by the system.

## 1.8 QUEUE INVITATION MODULE API

### 1.8.1 Module Description

This module creates and checks invitation links to a department's enrollment queue. Opening a link does not automatically add a student to the line.

This module has the following endpoints:

- POST [http://localhost:3001/api/v1/queue-shares](http://localhost:3001/api/v1/queue-shares)
- GET [http://localhost:3001/api/v1/queue-shares/:token](http://localhost:3001/api/v1/queue-shares/:token)

### 1.8.2 Create a Queue Invitation

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint creates a shareable link to a department's enrollment queue.

**Endpoint:** [http://localhost:3001/api/v1/queue-shares](http://localhost:3001/api/v1/queue-shares)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId (required).

**Important Notes:**

- Requires an assigned adviser, active department/year, and configured public site address. Links are tied to the academic year, not documented as a fixed-duration expiry.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 404 | Not Found | The requested record cannot be found. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The invitation link, token, department, inviter, and school-year details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 122.** Create a Queue Invitation — Valid Request and Response

This figure demonstrates the request and returned response for “Create a Queue Invitation.”

[SCREENSHOT: Invalid request and response.]

**Figure 123.** Create a Queue Invitation — Invalid Request and Response

This figure shows a rejected request for “Create a Queue Invitation” and the error message returned by the system.

### 1.8.3 Resolve a Queue Invitation

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint checks an invitation link and shows the related queue.

**Endpoint:** [http://localhost:3001/api/v1/queue-shares/:token](http://localhost:3001/api/v1/queue-shares/:token)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- Path: token (1–2,000 characters).

**Important Notes:**

- Invalid tokens return HTTP 200 with status INVALID. A different/no active year returns 200 with status STALE. Valid invitations return status OK even when isOpen is false; resolving never joins the queue.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The invitation status and queue details are returned. INVALID means the link is not valid; STALE means it is for a different enrollment period. Neither joins the queue.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 124.** Resolve a Queue Invitation — Valid Request and Response

This figure shows the request and returned response for “Resolve a Queue Invitation.”

[SCREENSHOT: Invalid request and response.]

**Figure 125.** Resolve a Queue Invitation — Invalid Request and Response

This figure shows a rejected request for “Resolve a Queue Invitation” and the error message returned by the system.

## 1.9 DEPARTMENT MODULE API

### 1.9.1 Module Description

This module manages departments, their offered year levels, and related enrollment records.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/departments](http://localhost:3001/api/v1/me/departments)
- PUT [http://localhost:3001/api/v1/me/departments](http://localhost:3001/api/v1/me/departments)
- GET [http://localhost:3001/api/v1/departments](http://localhost:3001/api/v1/departments)
- POST [http://localhost:3001/api/v1/departments](http://localhost:3001/api/v1/departments)
- PATCH [http://localhost:3001/api/v1/departments/:id](http://localhost:3001/api/v1/departments/:id)
- PUT [http://localhost:3001/api/v1/departments/:id/year-levels](http://localhost:3001/api/v1/departments/:id/year-levels)
- DELETE [http://localhost:3001/api/v1/departments/:id](http://localhost:3001/api/v1/departments/:id)
- GET [http://localhost:3001/api/v1/departments/:id/enrollments](http://localhost:3001/api/v1/departments/:id/enrollments)

### 1.9.2 Read My Student Department

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint shows the department linked to the student's placement.

**Endpoint:** [http://localhost:3001/api/v1/me/departments](http://localhost:3001/api/v1/me/departments)

**Method:** GET

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The department details and current and next office hours are returned, or an empty result when no department applies.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 126.** Read My Student Department — Valid Request and Response

This figure demonstrates the request and returned response for “Read My Student Department.”

[SCREENSHOT: Invalid request and response.]

**Figure 127.** Read My Student Department — Invalid Request and Response

This figure shows a rejected request for “Read My Student Department” and the error message returned by the system.

### 1.9.3 Set My Department Responsibility

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint saves the adviser's department and year-level responsibility.

**Endpoint:** [http://localhost:3001/api/v1/me/departments](http://localhost:3001/api/v1/me/departments)

**Method:** PUT

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentIds (required array, at most one identifier), yearLevels (optional, at most five
- default an empty list). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Important Notes:**

- Checks offered levels and overlapping claims.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The saved assignment result is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 128.** Set My Department Responsibility — Valid Request and Response

This figure shows the request and returned response for “Set My Department Responsibility.”

[SCREENSHOT: Invalid request and response.]

**Figure 129.** Set My Department Responsibility — Invalid Request and Response

This figure shows a rejected request for “Set My Department Responsibility” and the error message returned by the system.

### 1.9.4 List Departments and Assignments

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint shows departments and their adviser assignments.

**Endpoint:** [http://localhost:3001/api/v1/departments](http://localhost:3001/api/v1/departments)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Administrators see all departments; advisers receive their applicable listing. This list is sliced by page.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A page of department details and assignment information is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 130.** List Departments and Assignments — Valid Request and Response

This figure demonstrates the request and returned response for “List Departments and Assignments.”

[SCREENSHOT: Invalid request and response.]

**Figure 131.** List Departments and Assignments — Invalid Request and Response

This figure shows a rejected request for “List Departments and Assignments” and the error message returned by the system.

### 1.9.5 Create a Department

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint adds a department to the system.

**Endpoint:** [http://localhost:3001/api/v1/departments](http://localhost:3001/api/v1/departments)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: name (required with extra outside spaces removed string, 1–120 characters).

**Important Notes:**

- Code is derived from the name, not supplied. An adviser holding no department is assigned automatically; administrators do not receive that self-assignment.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The department's identifier, name, generated code, year levels, active status, and any new assignment are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 132.** Create a Department — Valid Request and Response

This figure shows the request and returned response for “Create a Department.”

[SCREENSHOT: Invalid request and response.]

**Figure 133.** Create a Department — Invalid Request and Response

This figure shows a rejected request for “Create a Department” and the error message returned by the system.

### 1.9.6 Rename or Change Department Status

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint changes a department's name or active status.

**Endpoint:** [http://localhost:3001/api/v1/departments/:id](http://localhost:3001/api/v1/departments/:id)

**Method:** PATCH

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Request body: name (optional, 1–120 characters), isActive (optional true or false). At least one field is required.

**Important Notes:**

- isActive is administrator-only. Do not assume every department action uses identical ownership checks.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The changed department details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 134.** Rename or Change Department Status — Valid Request and Response

This figure demonstrates the request and returned response for “Rename or Change Department Status.”

[SCREENSHOT: Invalid request and response.]

**Figure 135.** Rename or Change Department Status — Invalid Request and Response

This figure shows a rejected request for “Rename or Change Department Status” and the error message returned by the system.

### 1.9.7 Set Offered Department Year Levels

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint saves the year levels offered by a department.

**Endpoint:** [http://localhost:3001/api/v1/departments/:id/year-levels](http://localhost:3001/api/v1/departments/:id/year-levels)

**Method:** PUT

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Request body: yearLevels (required array, at most five). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Important Notes:**

- Requires the assigned adviser or an administrator.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The department identifier and saved year levels are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 136.** Set Offered Department Year Levels — Valid Request and Response

This figure shows the request and returned response for “Set Offered Department Year Levels.”

[SCREENSHOT: Invalid request and response.]

**Figure 137.** Set Offered Department Year Levels — Invalid Request and Response

This figure shows a rejected request for “Set Offered Department Year Levels” and the error message returned by the system.

### 1.9.8 Delete an Eligible Department

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint removes a department when its records allow deletion.

**Endpoint:** [http://localhost:3001/api/v1/departments/:id](http://localhost:3001/api/v1/departments/:id)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.

**Important Notes:**

- Requires assignment or administrator permission. Cleans related availability, assignments, and schedules.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The department identifier and deletion confirmation are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 138.** Delete an Eligible Department — Valid Request and Response

This figure demonstrates the request and returned response for “Delete an Eligible Department.”

[SCREENSHOT: Invalid request and response.]

**Figure 139.** Delete an Eligible Department — Invalid Request and Response

This figure shows a rejected request for “Delete an Eligible Department” and the error message returned by the system.

### 1.9.9 Read the Department Enrollment Register

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint shows the students enrolled under a department.

**Endpoint:** [http://localhost:3001/api/v1/departments/:id/enrollments](http://localhost:3001/api/v1/departments/:id/enrollments)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Optional address filter: range (today/ay/all, default ay), q (up to 100 characters), cursor, limit (1–500, default 50).

**Important Notes:**

- Read the X-Next-Cursor response header for continuation. Uses the current active academic year context.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Enrollment entries and a total are returned. When more entries are available, the X-Next-Cursor response header provides the next-page marker.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 140.** Read the Department Enrollment Register — Valid Request and Response

This figure shows the request and returned response for “Read the Department Enrollment Register.”

[SCREENSHOT: Invalid request and response.]

**Figure 141.** Read the Department Enrollment Register — Invalid Request and Response

This figure shows a rejected request for “Read the Department Enrollment Register” and the error message returned by the system.

## 1.10 ADVISER ASSIGNMENT MODULE API

### 1.10.1 Module Description

This module manages adviser assignments and live queue availability. An adviser must be available before eligible students can join the queue.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/advisers](http://localhost:3001/api/v1/advisers)
- PATCH [http://localhost:3001/api/v1/advisers/:adviserId](http://localhost:3001/api/v1/advisers/:adviserId)
- PUT [http://localhost:3001/api/v1/me/availability](http://localhost:3001/api/v1/me/availability)
- POST [http://localhost:3001/api/v1/me/availability/heartbeat](http://localhost:3001/api/v1/me/availability/heartbeat)

### 1.10.2 List Adviser Assignments

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint shows advisers and the departments they handle.

**Endpoint:** [http://localhost:3001/api/v1/advisers](http://localhost:3001/api/v1/advisers)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Returns the complete roster with page details.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The adviser names, emails, departments, and assigned year levels are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 142.** List Adviser Assignments — Valid Request and Response

This figure demonstrates the request and returned response for “List Adviser Assignments.”

[SCREENSHOT: Invalid request and response.]

**Figure 143.** List Adviser Assignments — Invalid Request and Response

This figure shows a rejected request for “List Adviser Assignments” and the error message returned by the system.

### 1.10.3 Replace an Adviser's Assignments

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint replaces an adviser's department and year-level assignments.

**Endpoint:** [http://localhost:3001/api/v1/advisers/:adviserId](http://localhost:3001/api/v1/advisers/:adviserId)

**Method:** PATCH

**Configurations:** An administrator must be signed in.

**Parameters:**

- adviserId — Required adviser account identifier in the endpoint address.
- assignments — Required list of up to 50 department assignments. This replaces the whole assignment list.
- departmentId — Required for each assignment.
- yearLevels — Optional list for each assignment, using FIRST, SECOND, THIRD, FOURTH, or FIFTH. An empty list means all offered year levels.

**Important Notes:**

- Administrator-only. Replaces the whole mapping, not a partial append.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The saved assignment result is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 144.** Replace an Adviser's Assignments — Valid Request and Response

This figure shows the request and returned response for “Replace an Adviser's Assignments.”

[SCREENSHOT: Invalid request and response.]

**Figure 145.** Replace an Adviser's Assignments — Invalid Request and Response

This figure shows a rejected request for “Replace an Adviser's Assignments” and the error message returned by the system.

### 1.10.4 Open or Close My Queue Availability

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint changes whether an adviser is ready to serve students.

**Endpoint:** [http://localhost:3001/api/v1/me/availability](http://localhost:3001/api/v1/me/availability)

**Method:** PUT

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId (required identifier), isOpen (required true or false).

**Important Notes:**

- Closing releases a student currently served by this adviser. isOpen can remain true if another adviser is open.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The department, the adviser's open status, and the department's combined availability are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 146.** Open or Close My Queue Availability — Valid Request and Response

This figure demonstrates the request and returned response for “Open or Close My Queue Availability.”

[SCREENSHOT: Invalid request and response.]

**Figure 147.** Open or Close My Queue Availability — Invalid Request and Response

This figure shows a rejected request for “Open or Close My Queue Availability” and the error message returned by the system.

### 1.10.5 Refresh My Availability

**Version:** 1.0

**Date:** November 16, 2026

**Description:** This endpoint keeps the adviser's open availability current.

**Endpoint:** [http://localhost:3001/api/v1/me/availability/heartbeat](http://localhost:3001/api/v1/me/availability/heartbeat)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Refreshes the person making the request's open availability; no departmentId business body is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The number of availability records refreshed is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 148.** Refresh My Availability — Valid Request and Response

This figure shows the request and returned response for “Refresh My Availability.”

[SCREENSHOT: Invalid request and response.]

**Figure 149.** Refresh My Availability — Invalid Request and Response

This figure shows a rejected request for “Refresh My Availability” and the error message returned by the system.

## 1.11 DEPARTMENT HANDOVER MODULE API

### 1.11.1 Module Description

This module lets advisers request, accept, decline, or cancel a change in department responsibility.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/transfers](http://localhost:3001/api/v1/transfers)
- POST [http://localhost:3001/api/v1/transfers](http://localhost:3001/api/v1/transfers)
- PATCH [http://localhost:3001/api/v1/transfers/:id](http://localhost:3001/api/v1/transfers/:id)
- DELETE [http://localhost:3001/api/v1/transfers/:id](http://localhost:3001/api/v1/transfers/:id)
- POST [http://localhost:3001/api/v1/departments/:id/takeover](http://localhost:3001/api/v1/departments/:id/takeover)

### 1.11.2 List Incoming and Outgoing Handovers

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint shows department handover requests involving the adviser.

**Endpoint:** [http://localhost:3001/api/v1/transfers](http://localhost:3001/api/v1/transfers)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Resolves expired requests first. Automatic response windows are ten minutes for an active holder and one minute for an inactive holder.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The incoming and outgoing handover requests are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 150.** List Incoming and Outgoing Handovers — Valid Request and Response

This figure demonstrates the request and returned response for “List Incoming and Outgoing Handovers.”

[SCREENSHOT: Invalid request and response.]

**Figure 151.** List Incoming and Outgoing Handovers — Invalid Request and Response

This figure shows a rejected request for “List Incoming and Outgoing Handovers” and the error message returned by the system.

### 1.11.3 Request Department or Year-Level Handover

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint asks the current adviser to hand over department responsibility.

**Endpoint:** [http://localhost:3001/api/v1/transfers](http://localhost:3001/api/v1/transfers)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Request body: departmentId (required), yearLevels (optional, default an empty list). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Important Notes:**

- The person making the request requests responsibility from the overlapping current holder; do not supply ownerId or accept in this request.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The request details, involved advisers, and response deadline are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 152.** Request Department or Year-Level Handover — Valid Request and Response

This figure shows the request and returned response for “Request Department or Year-Level Handover.”

[SCREENSHOT: Invalid request and response.]

**Figure 153.** Request Department or Year-Level Handover — Invalid Request and Response

This figure shows a rejected request for “Request Department or Year-Level Handover” and the error message returned by the system.

### 1.11.4 Accept or Decline a Handover

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint records the current owner's answer to a handover request.

**Endpoint:** [http://localhost:3001/api/v1/transfers/:id](http://localhost:3001/api/v1/transfers/:id)

**Method:** PATCH

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Request body: accept (required true or false).

**Important Notes:**

- Only the recorded owner may respond to a pending request.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The request identifier, final status, and previous adviser's name are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 154.** Accept or Decline a Handover — Valid Request and Response

This figure demonstrates the request and returned response for “Accept or Decline a Handover.”

[SCREENSHOT: Invalid request and response.]

**Figure 155.** Accept or Decline a Handover — Invalid Request and Response

This figure shows a rejected request for “Accept or Decline a Handover” and the error message returned by the system.

### 1.11.5 Cancel My Handover Request

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint withdraws the caller's pending handover request.

**Endpoint:** [http://localhost:3001/api/v1/transfers/:id](http://localhost:3001/api/v1/transfers/:id)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.

**Important Notes:**

- Only the requester may cancel a pending request.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The request identifier and cancellation confirmation are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 156.** Cancel My Handover Request — Valid Request and Response

This figure shows the request and returned response for “Cancel My Handover Request.”

[SCREENSHOT: Invalid request and response.]

**Figure 157.** Cancel My Handover Request — Invalid Request and Response

This figure shows a rejected request for “Cancel My Handover Request” and the error message returned by the system.

### 1.11.6 Take Over Department Responsibility

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint takes over department or year-level responsibility under the system's rules.

**Endpoint:** [http://localhost:3001/api/v1/departments/:id/takeover](http://localhost:3001/api/v1/departments/:id/takeover)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Path: id.
- Request body: yearLevels (optional, default an empty list). Year levels use FIRST, SECOND, THIRD, FOURTH, FIFTH. An empty year-level list means unrestricted responsibility within the department's offered levels.

**Important Notes:**

- Uses the current takeover service and offered-level checks; this is separate from accepting a pending transfer.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The department details and previous adviser's name are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 158.** Take Over Department Responsibility — Valid Request and Response

This figure demonstrates the request and returned response for “Take Over Department Responsibility.”

[SCREENSHOT: Invalid request and response.]

**Figure 159.** Take Over Department Responsibility — Invalid Request and Response

This figure shows a rejected request for “Take Over Department Responsibility” and the error message returned by the system.

## 1.12 OFFICE-HOUR SCHEDULE MODULE API

### 1.12.1 Module Description

This module saves an adviser's weekly office hours and date-specific changes. A posted schedule does not automatically open the live enrollment queue.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/schedule](http://localhost:3001/api/v1/me/schedule)
- PUT [http://localhost:3001/api/v1/me/schedule](http://localhost:3001/api/v1/me/schedule)

### 1.12.2 Read My Department Office Hours

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint shows an adviser's saved hours for a department.

**Endpoint:** [http://localhost:3001/api/v1/me/schedule](http://localhost:3001/api/v1/me/schedule)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Required address filter: departmentId.

**Important Notes:**

- Returns the person making the request's windows for the current year. Past dated exceptions are filtered out. Does not open or close queue availability.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The department identifier, schedule entries, and calendar-copy status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 160.** Read My Department Office Hours — Valid Request and Response

This figure shows the request and returned response for “Read My Department Office Hours.”

[SCREENSHOT: Invalid request and response.]

**Figure 161.** Read My Department Office Hours — Invalid Request and Response

This figure shows a rejected request for “Read My Department Office Hours” and the error message returned by the system.

### 1.12.3 Replace Department Office Hours

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint replaces an adviser's office-hour schedule for a department.

**Endpoint:** [http://localhost:3001/api/v1/me/schedule](http://localhost:3001/api/v1/me/schedule)

**Method:** PUT

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- departmentId — Required department identifier in the request body.
- windows — Required list of schedule entries. An empty list clears the schedule. At most 100 entries can be sent; no more than 30 may remain after past dated entries are removed.
- kind — WEEKLY for regular hours, EXTRA for additional hours on a date, or CANCEL for a closed date.
- weekday — Required for WEEKLY; use 1 for Monday through 7 for Sunday.
- date — Required for EXTRA and CANCEL, in YYYY-MM-DD form.
- startMinute and endMinute — Required for WEEKLY and EXTRA. Count minutes from midnight on a 30-minute grid. Start at 0 or later; end at 1440 or earlier. Each period must last at least 30 minutes. Times use Asia/Manila.

**Important Notes:**

- Replaces the complete schedule, including removal when windows is empty. Past dated exceptions are filtered before validation. May trigger optional calendar sync without changing live availability.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The saved schedule entries and calendar-copy status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 162.** Replace Department Office Hours — Valid Request and Response

This figure demonstrates the request and returned response for “Replace Department Office Hours.”

[SCREENSHOT: Invalid request and response.]

**Figure 163.** Replace Department Office Hours — Invalid Request and Response

This figure shows a rejected request for “Replace Department Office Hours” and the error message returned by the system.

## 1.13 GOOGLE CALENDAR MODULE API

### 1.13.1 Module Description

This module connects an adviser's Google Calendar and copies office-hour schedules to it. Disconnecting Google Calendar does not erase the schedule saved in ERPSYS.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/calendar](http://localhost:3001/api/v1/me/calendar)
- GET [http://localhost:3001/api/v1/me/calendar/connect](http://localhost:3001/api/v1/me/calendar/connect)
- GET [http://localhost:3001/api/v1/calendar/callback](http://localhost:3001/api/v1/calendar/callback)
- POST [http://localhost:3001/api/v1/me/calendar/sync](http://localhost:3001/api/v1/me/calendar/sync)
- DELETE [http://localhost:3001/api/v1/me/calendar](http://localhost:3001/api/v1/me/calendar)

### 1.13.2 Read My Calendar Connection

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint checks the adviser's Google Calendar connection.

**Endpoint:** [http://localhost:3001/api/v1/me/calendar](http://localhost:3001/api/v1/me/calendar)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The service availability, connection status, Google email, last update time, and any last error are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 164.** Read My Calendar Connection — Valid Request and Response

This figure shows the request and returned response for “Read My Calendar Connection.”

[SCREENSHOT: Invalid request and response.]

**Figure 165.** Read My Calendar Connection — Invalid Request and Response

This figure shows a rejected request for “Read My Calendar Connection” and the error message returned by the system.

### 1.13.3 Start Calendar Authorization

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint starts the adviser's permission request for Google Calendar.

**Endpoint:** [http://localhost:3001/api/v1/me/calendar/connect](http://localhost:3001/api/v1/me/calendar/connect)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Open the returned Google consent URL. Limited to ten calendar requests per minute per account for connect/callback/sync.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** A Google permission-page address is returned. The adviser must open it and complete Google's steps.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 166.** Start Calendar Authorization — Valid Request and Response

This figure demonstrates the request and returned response for “Start Calendar Authorization.”

[SCREENSHOT: Invalid request and response.]

**Figure 167.** Start Calendar Authorization — Invalid Request and Response

This figure shows a rejected request for “Start Calendar Authorization” and the error message returned by the system.

### 1.13.4 Complete Calendar Authorization

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint receives Google's answer to the calendar permission request.

**Endpoint:** [http://localhost:3001/api/v1/calendar/callback](http://localhost:3001/api/v1/calendar/callback)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Query: code and state for successful authorization
- error can be supplied by Google.

**Important Notes:**

- Start calendar authorization and finish Google's consent flow in the same signed-in browser. A 302 redirect to calendar=error is not a successful connection.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 302 | Redirect | Continue on the next page. |
| 401 | Sign-In Required | Sign in or check your sign-in details. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (Redirect):** The browser returns to the adviser page with a connected or error notice.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 168.** Complete Calendar Authorization — Valid Request and Response

This figure shows the request and returned response for “Complete Calendar Authorization.”

[SCREENSHOT: Invalid request and response.]

**Figure 169.** Complete Calendar Authorization — Invalid Request and Response

This figure shows a rejected request for “Complete Calendar Authorization” and the error message returned by the system.

### 1.13.5 Synchronize Calendar Again

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint requests another copy of the office-hour schedule to Google Calendar.

**Endpoint:** [http://localhost:3001/api/v1/me/calendar/sync](http://localhost:3001/api/v1/me/calendar/sync)

**Method:** POST

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Resets the retry count and requests another schedule synchronization.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The current calendar connection and update status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 170.** Synchronize Calendar Again — Valid Request and Response

This figure demonstrates the request and returned response for “Synchronize Calendar Again.”

[SCREENSHOT: Invalid request and response.]

**Figure 171.** Synchronize Calendar Again — Invalid Request and Response

This figure shows a rejected request for “Synchronize Calendar Again” and the error message returned by the system.

### 1.13.6 Disconnect Calendar

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint removes the adviser's Google Calendar connection.

**Endpoint:** [http://localhost:3001/api/v1/me/calendar](http://localhost:3001/api/v1/me/calendar)

**Method:** DELETE

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Removes the mirrored calendar and stored connection token; office hours in ERPSYS remain.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The disconnected calendar status is returned. The ERPSYS office-hour schedule remains saved.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 172.** Disconnect Calendar — Valid Request and Response

This figure shows the request and returned response for “Disconnect Calendar.”

[SCREENSHOT: Invalid request and response.]

**Figure 173.** Disconnect Calendar — Invalid Request and Response

This figure shows a rejected request for “Disconnect Calendar” and the error message returned by the system.

## 1.14 ACADEMIC YEAR MODULE API

### 1.14.1 Module Description

This module manages school years and semesters. An administrator can choose which enrollment period is currently active.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/academic-years](http://localhost:3001/api/v1/academic-years)
- POST [http://localhost:3001/api/v1/academic-years](http://localhost:3001/api/v1/academic-years)
- PATCH [http://localhost:3001/api/v1/academic-years/:id](http://localhost:3001/api/v1/academic-years/:id)
- DELETE [http://localhost:3001/api/v1/academic-years/:id](http://localhost:3001/api/v1/academic-years/:id)
- GET [http://localhost:3001/api/v1/academic-years/:id/activation](http://localhost:3001/api/v1/academic-years/:id/activation)
- POST [http://localhost:3001/api/v1/academic-years/:id/activation](http://localhost:3001/api/v1/academic-years/:id/activation)

### 1.14.2 List Academic Years

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint shows the available school years and semesters.

**Endpoint:** [http://localhost:3001/api/v1/academic-years](http://localhost:3001/api/v1/academic-years)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Returns the complete year list with page details.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The school-year list is returned with each period's name, semester, active status, and whether it contains records.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 174.** List Academic Years — Valid Request and Response

This figure demonstrates the request and returned response for “List Academic Years.”

[SCREENSHOT: Invalid request and response.]

**Figure 175.** List Academic Years — Invalid Request and Response

This figure shows a rejected request for “List Academic Years” and the error message returned by the system.

### 1.14.3 Create an Academic Year

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint adds a school year and semester.

**Endpoint:** [http://localhost:3001/api/v1/academic-years](http://localhost:3001/api/v1/academic-years)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: label and semesterLabel (required with extra outside spaces removed strings, 1–30 characters)
- activate (true or false, default false).

**Important Notes:**

- Activation is refused while another current year still has waiting or served students.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The new period's details and active status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 176.** Create an Academic Year — Valid Request and Response

This figure shows the request and returned response for “Create an Academic Year.”

[SCREENSHOT: Invalid request and response.]

**Figure 177.** Create an Academic Year — Invalid Request and Response

This figure shows a rejected request for “Create an Academic Year” and the error message returned by the system.

### 1.14.4 Edit the Current Academic Year

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint changes the name and semester of the active enrollment period.

**Endpoint:** [http://localhost:3001/api/v1/academic-years/:id](http://localhost:3001/api/v1/academic-years/:id)

**Method:** PATCH

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id.
- Request body: label and semesterLabel (both required, 1–30 characters).

**Important Notes:**

- Only the active year can be edited.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The updated period's details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 178.** Edit the Current Academic Year — Valid Request and Response

This figure demonstrates the request and returned response for “Edit the Current Academic Year.”

[SCREENSHOT: Invalid request and response.]

**Figure 179.** Edit the Current Academic Year — Invalid Request and Response

This figure shows a rejected request for “Edit the Current Academic Year” and the error message returned by the system.

### 1.14.5 Delete an Empty Academic Year

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint removes a school year that has no protected enrollment activity.

**Endpoint:** [http://localhost:3001/api/v1/academic-years/:id](http://localhost:3001/api/v1/academic-years/:id)

**Method:** DELETE

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The identifier of the removed period is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 180.** Delete an Empty Academic Year — Valid Request and Response

This figure shows the request and returned response for “Delete an Empty Academic Year.”

[SCREENSHOT: Invalid request and response.]

**Figure 181.** Delete an Empty Academic Year — Invalid Request and Response

This figure shows a rejected request for “Delete an Empty Academic Year” and the error message returned by the system.

### 1.14.6 Preview Academic-Year Activation

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint checks the effect of switching the active school year.

**Endpoint:** [http://localhost:3001/api/v1/academic-years/:id/activation](http://localhost:3001/api/v1/academic-years/:id/activation)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The current year name, number of students with progress, and number of open queue entries are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 182.** Preview Academic-Year Activation — Valid Request and Response

This figure demonstrates the request and returned response for “Preview Academic-Year Activation.”

[SCREENSHOT: Invalid request and response.]

**Figure 183.** Preview Academic-Year Activation — Invalid Request and Response

This figure shows a rejected request for “Preview Academic-Year Activation” and the error message returned by the system.

### 1.14.7 Activate an Academic Year

**Version:** 1.0

**Date:** November 17, 2026

**Description:** This endpoint sets a selected school year as the active enrollment period.

**Endpoint:** [http://localhost:3001/api/v1/academic-years/:id/activation](http://localhost:3001/api/v1/academic-years/:id/activation)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id. No business body fields.

**Important Notes:**

- Activates this year and deactivates the others. Repeating activation of the active year is accepted.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The selected period's details are returned. Other periods are no longer active.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 184.** Activate an Academic Year — Valid Request and Response

This figure shows the request and returned response for “Activate an Academic Year.”

[SCREENSHOT: Invalid request and response.]

**Figure 185.** Activate an Academic Year — Invalid Request and Response

This figure shows a rejected request for “Activate an Academic Year” and the error message returned by the system.

## 1.15 ASSESSMENT REQUIREMENT MODULE API

### 1.15.1 Module Description

This module manages the assessment checklist used during student clearance and enrollment.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/requirements](http://localhost:3001/api/v1/requirements)
- POST [http://localhost:3001/api/v1/requirements](http://localhost:3001/api/v1/requirements)
- PUT [http://localhost:3001/api/v1/requirements/order](http://localhost:3001/api/v1/requirements/order)
- PATCH [http://localhost:3001/api/v1/requirements/:id](http://localhost:3001/api/v1/requirements/:id)
- DELETE [http://localhost:3001/api/v1/requirements/:id](http://localhost:3001/api/v1/requirements/:id)

### 1.15.2 List Assessment Requirements

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the assessment checklist.

**Endpoint:** [http://localhost:3001/api/v1/requirements](http://localhost:3001/api/v1/requirements)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Returns the complete requirement list with page details.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The checklist items, display order, and active status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 186.** List Assessment Requirements — Valid Request and Response

This figure demonstrates the request and returned response for “List Assessment Requirements.”

[SCREENSHOT: Invalid request and response.]

**Figure 187.** List Assessment Requirements — Invalid Request and Response

This figure shows a rejected request for “List Assessment Requirements” and the error message returned by the system.

### 1.15.3 Add an Assessment Requirement

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint adds an item to the assessment checklist.

**Endpoint:** [http://localhost:3001/api/v1/requirements](http://localhost:3001/api/v1/requirements)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: label (required with extra outside spaces removed string, 1–200 characters).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The new checklist item's details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 188.** Add an Assessment Requirement — Valid Request and Response

This figure shows the request and returned response for “Add an Assessment Requirement.”

[SCREENSHOT: Invalid request and response.]

**Figure 189.** Add an Assessment Requirement — Invalid Request and Response

This figure shows a rejected request for “Add an Assessment Requirement” and the error message returned by the system.

### 1.15.4 Reorder Assessment Requirements

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint changes the order of assessment checklist items.

**Endpoint:** [http://localhost:3001/api/v1/requirements/order](http://localhost:3001/api/v1/requirements/order)

**Method:** PUT

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: orderedIds (required array of not empty identifiers, at most 500).

**Important Notes:**

- Unlisted existing items are appended. The response is the submitted identifier list, not full requirement rows.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The submitted list of item identifiers is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 190.** Reorder Assessment Requirements — Valid Request and Response

This figure demonstrates the request and returned response for “Reorder Assessment Requirements.”

[SCREENSHOT: Invalid request and response.]

**Figure 191.** Reorder Assessment Requirements — Invalid Request and Response

This figure shows a rejected request for “Reorder Assessment Requirements” and the error message returned by the system.

### 1.15.5 Update an Assessment Requirement

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint changes an assessment item's label or active status.

**Endpoint:** [http://localhost:3001/api/v1/requirements/:id](http://localhost:3001/api/v1/requirements/:id)

**Method:** PATCH

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id.
- Request body: label (optional, 1–200 characters), isActive (optional true or false).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The updated checklist item's details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 192.** Update an Assessment Requirement — Valid Request and Response

This figure shows the request and returned response for “Update an Assessment Requirement.”

[SCREENSHOT: Invalid request and response.]

**Figure 193.** Update an Assessment Requirement — Invalid Request and Response

This figure shows a rejected request for “Update an Assessment Requirement” and the error message returned by the system.

### 1.15.6 Delete an Assessment Requirement

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint removes an assessment checklist item.

**Endpoint:** [http://localhost:3001/api/v1/requirements/:id](http://localhost:3001/api/v1/requirements/:id)

**Method:** DELETE

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: id.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The identifier of the removed item is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 194.** Delete an Assessment Requirement — Valid Request and Response

This figure demonstrates the request and returned response for “Delete an Assessment Requirement.”

[SCREENSHOT: Invalid request and response.]

**Figure 195.** Delete an Assessment Requirement — Invalid Request and Response

This figure shows a rejected request for “Delete an Assessment Requirement” and the error message returned by the system.

## 1.16 FORMS AND INFORMATION MODULE API

### 1.16.1 Module Description

This module manages the profiling form, required social-media links, and information used by the enrollment assistant.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/chatbot-knowledge](http://localhost:3001/api/v1/chatbot-knowledge)
- PUT [http://localhost:3001/api/v1/chatbot-knowledge](http://localhost:3001/api/v1/chatbot-knowledge)
- GET [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)
- POST [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)
- DELETE [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)
- GET [http://localhost:3001/api/v1/social-links](http://localhost:3001/api/v1/social-links)
- POST [http://localhost:3001/api/v1/social-links](http://localhost:3001/api/v1/social-links)
- PUT [http://localhost:3001/api/v1/social-links/order](http://localhost:3001/api/v1/social-links/order)
- PATCH [http://localhost:3001/api/v1/social-links/:id](http://localhost:3001/api/v1/social-links/:id)
- DELETE [http://localhost:3001/api/v1/social-links/:id](http://localhost:3001/api/v1/social-links/:id)
- GET [http://localhost:3001/api/v1/signup-options](http://localhost:3001/api/v1/signup-options)

### 1.16.2 Read Assistant Knowledge

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the saved information used by the enrollment assistant.

**Endpoint:** [http://localhost:3001/api/v1/chatbot-knowledge](http://localhost:3001/api/v1/chatbot-knowledge)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The saved text, revision number, and last editor are returned. The result can be empty if nothing has been saved.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 196.** Read Assistant Knowledge — Valid Request and Response

This figure shows the request and returned response for “Read Assistant Knowledge.”

[SCREENSHOT: Invalid request and response.]

**Figure 197.** Read Assistant Knowledge — Invalid Request and Response

This figure shows a rejected request for “Read Assistant Knowledge” and the error message returned by the system.

### 1.16.3 Replace Assistant Knowledge

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint replaces the information used by the enrollment assistant.

**Endpoint:** [http://localhost:3001/api/v1/chatbot-knowledge](http://localhost:3001/api/v1/chatbot-knowledge)

**Method:** PUT

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: content (required string, up to 200,000 characters).

**Important Notes:**

- Increments the version and invalidates the assistant's knowledge cache.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The new revision number and update time are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 198.** Replace Assistant Knowledge — Valid Request and Response

This figure demonstrates the request and returned response for “Replace Assistant Knowledge.”

[SCREENSHOT: Invalid request and response.]

**Figure 199.** Replace Assistant Knowledge — Invalid Request and Response

This figure shows a rejected request for “Replace Assistant Knowledge” and the error message returned by the system.

### 1.16.4 Read the Linked Profiling Form

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the profiling form linked to the current school year.

**Endpoint:** [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The form title, answer link, edit link, and last update details are returned, or an empty result if no form is linked.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 200.** Read the Linked Profiling Form — Valid Request and Response

This figure shows the request and returned response for “Read the Linked Profiling Form.”

[SCREENSHOT: Invalid request and response.]

**Figure 201.** Read the Linked Profiling Form — Invalid Request and Response

This figure shows a rejected request for “Read the Linked Profiling Form” and the error message returned by the system.

### 1.16.5 Create and Link the Profiling Form

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint creates a Google profiling form for the current school year.

**Endpoint:** [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)

**Method:** POST

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Request body: title (required with extra outside spaces removed string, 1–200 characters).

**Important Notes:**

- Creates a verified-email-collection Google Form, publishes it, and shares it with the person making the request. It does not accept a recourse and year-level selection form URL.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 201 | Created | The new record was created. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 412 | Required Step Not Completed | Complete the required setup or earlier step. |

**Response (JSON):** The new form's details and links are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 202.** Create and Link the Profiling Form — Valid Request and Response

This figure demonstrates the request and returned response for “Create and Link the Profiling Form.”

[SCREENSHOT: Invalid request and response.]

**Figure 203.** Create and Link the Profiling Form — Invalid Request and Response

This figure shows a rejected request for “Create and Link the Profiling Form” and the error message returned by the system.

### 1.16.6 Unlink the Profiling Form

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint removes the current school year's link to the profiling form.

**Endpoint:** [http://localhost:3001/api/v1/profiling-form](http://localhost:3001/api/v1/profiling-form)

**Method:** DELETE

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Removes the current-year link, not the underlying Google Form.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned. The Google Form itself is not deleted.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 204.** Unlink the Profiling Form — Valid Request and Response

This figure shows the request and returned response for “Unlink the Profiling Form.”

[SCREENSHOT: Invalid request and response.]

**Figure 205.** Unlink the Profiling Form — Invalid Request and Response

This figure shows a rejected request for “Unlink the Profiling Form” and the error message returned by the system.

### 1.16.7 List Required Social-Media Links

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the social-media pages required for student clearance.

**Endpoint:** [http://localhost:3001/api/v1/social-links](http://localhost:3001/api/v1/social-links)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Returns the complete ordered list with page details.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The saved links are returned in display order.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 206.** List Required Social-Media Links — Valid Request and Response

This figure demonstrates the request and returned response for “List Required Social-Media Links.”

[SCREENSHOT: Invalid request and response.]

**Figure 207.** List Required Social-Media Links — Invalid Request and Response

This figure shows a rejected request for “List Required Social-Media Links” and the error message returned by the system.

### 1.16.8 Add or Update a Social-Media Link

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint saves a required social-media page.

**Endpoint:** [http://localhost:3001/api/v1/social-links](http://localhost:3001/api/v1/social-links)

**Method:** POST

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Request body: name (1–120 characters), url (valid URL, at most 1,000 characters)
- id (optional existing identifier).

**Important Notes:**

- 201 when creating; 200 when id selects an existing link.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Updated / Created (201) | The link was updated or created. |
| 400 | Invalid Request | Check the link name and address. |
| 404 | Not Found | The selected existing link cannot be found. |

**Response (JSON):** The new or updated link details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 208.** Add or Update a Social-Media Link — Valid Request and Response

This figure shows the request and returned response for “Add or Update a Social-Media Link.”

[SCREENSHOT: Invalid request and response.]

**Figure 209.** Add or Update a Social-Media Link — Invalid Request and Response

This figure shows a rejected request for “Add or Update a Social-Media Link” and the error message returned by the system.

### 1.16.9 Reorder Social-Media Links

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint changes the display order of required social-media links.

**Endpoint:** [http://localhost:3001/api/v1/social-links/order](http://localhost:3001/api/v1/social-links/order)

**Method:** PUT

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Request body: orderedIds (required array of not empty identifiers).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned when the order is saved.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 210.** Reorder Social-Media Links — Valid Request and Response

This figure demonstrates the request and returned response for “Reorder Social-Media Links.”

[SCREENSHOT: Invalid request and response.]

**Figure 211.** Reorder Social-Media Links — Invalid Request and Response

This figure shows a rejected request for “Reorder Social-Media Links” and the error message returned by the system.

### 1.16.10 Edit a Social-Media Link

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint changes the name and address of a required social-media page.

**Endpoint:** [http://localhost:3001/api/v1/social-links/:id](http://localhost:3001/api/v1/social-links/:id)

**Method:** PATCH

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id.
- Request body: name and url (both required
- same limits as creation).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The updated link details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 212.** Edit a Social-Media Link — Valid Request and Response

This figure shows the request and returned response for “Edit a Social-Media Link.”

[SCREENSHOT: Invalid request and response.]

**Figure 213.** Edit a Social-Media Link — Invalid Request and Response

This figure shows a rejected request for “Edit a Social-Media Link” and the error message returned by the system.

### 1.16.11 Delete a Social-Media Link

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint removes a required social-media page from the list.

**Endpoint:** [http://localhost:3001/api/v1/social-links/:id](http://localhost:3001/api/v1/social-links/:id)

**Method:** DELETE

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Path: id.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation is returned when the link is removed.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 214.** Delete a Social-Media Link — Valid Request and Response

This figure demonstrates the request and returned response for “Delete a Social-Media Link.”

[SCREENSHOT: Invalid request and response.]

**Figure 215.** Delete a Social-Media Link — Invalid Request and Response

This figure shows a rejected request for “Delete a Social-Media Link” and the error message returned by the system.

### 1.16.12 Read Registration Options

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the school years and departments available for registration.

**Endpoint:** [http://localhost:3001/api/v1/signup-options](http://localhost:3001/api/v1/signup-options)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Public. Year-level choices are represented by department data; the response is not a top-level yearLevels array.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |

**Response (JSON):** The available school years and departments are returned. Year-level choices are included in the department information.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 216.** Read Registration Options — Valid Request and Response

This figure shows the request and returned response for “Read Registration Options.”

[SCREENSHOT: Invalid request and response.]

**Figure 217.** Read Registration Options — Invalid Request and Response

This figure shows a rejected request for “Read Registration Options” and the error message returned by the system.

## 1.17 PERSONAL DASHBOARD MODULE API

### 1.17.1 Module Description

This module loads the signed-in user's dashboard, digital stamp, and notifications. The information shown depends on the user's permitted working area.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/me/launch](http://localhost:3001/api/v1/me/launch)
- GET [http://localhost:3001/api/v1/me/overview](http://localhost:3001/api/v1/me/overview)
- GET [http://localhost:3001/api/v1/me/stamp](http://localhost:3001/api/v1/me/stamp)
- PATCH [http://localhost:3001/api/v1/me/stamp](http://localhost:3001/api/v1/me/stamp)
- GET [http://localhost:3001/api/v1/me/notifications](http://localhost:3001/api/v1/me/notifications)

### 1.17.2 Load the Landing-Screen Bundle

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint loads the information needed for the signed-in user's starting page.

**Endpoint:** [http://localhost:3001/api/v1/me/launch](http://localhost:3001/api/v1/me/launch)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- All signed-in accounts. Cache-Control: private, no-store; Vary: Cookie. The bundle varies by the person making the request's working area.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The dashboard information allowed for the user's working area is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 218.** Load the Landing-Screen Bundle — Valid Request and Response

This figure demonstrates the request and returned response for “Load the Landing-Screen Bundle.”

[SCREENSHOT: Invalid request and response.]

**Figure 219.** Load the Landing-Screen Bundle — Invalid Request and Response

This figure shows a rejected request for “Load the Landing-Screen Bundle” and the error message returned by the system.

### 1.17.3 Read the Officer or Administrator Overview

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the summary for an SBO officer or administrator.

**Endpoint:** [http://localhost:3001/api/v1/me/overview](http://localhost:3001/api/v1/me/overview)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Use an SBO officer or administrator account. A student or adviser session receives access denied even though a sign-in session exists.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The summary for the user's permitted working area is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 220.** Read the Officer or Administrator Overview — Valid Request and Response

This figure shows the request and returned response for “Read the Officer or Administrator Overview.”

[SCREENSHOT: Invalid request and response.]

**Figure 221.** Read the Officer or Administrator Overview — Invalid Request and Response

This figure shows a rejected request for “Read the Officer or Administrator Overview” and the error message returned by the system.

### 1.17.4 Read My Digital Stamp

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the signed-in user's digital stamp.

**Endpoint:** [http://localhost:3001/api/v1/me/stamp](http://localhost:3001/api/v1/me/stamp)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The saved stamp details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 222.** Read My Digital Stamp — Valid Request and Response

This figure demonstrates the request and returned response for “Read My Digital Stamp.”

[SCREENSHOT: Invalid request and response.]

**Figure 223.** Read My Digital Stamp — Invalid Request and Response

This figure shows a rejected request for “Read My Digital Stamp” and the error message returned by the system.

### 1.17.5 Update My Digital Stamp

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint changes the signed-in user's digital stamp.

**Endpoint:** [http://localhost:3001/api/v1/me/stamp](http://localhost:3001/api/v1/me/stamp)

**Method:** PATCH

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Request body: name (optional, at most 80 characters)
- graphicUrl and signatureUrl (optional URL up to 1,000 characters, or null).

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The updated stamp details are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 224.** Update My Digital Stamp — Valid Request and Response

This figure shows the request and returned response for “Update My Digital Stamp.”

[SCREENSHOT: Invalid request and response.]

**Figure 225.** Update My Digital Stamp — Invalid Request and Response

This figure shows a rejected request for “Update My Digital Stamp” and the error message returned by the system.

### 1.17.6 Read My Notifications

**Version:** 1.0

**Date:** November 18, 2026

**Description:** This endpoint shows the signed-in user's latest notifications.

**Endpoint:** [http://localhost:3001/api/v1/me/notifications](http://localhost:3001/api/v1/me/notifications)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Newest first, capped at 50. This handler does not expose arbitrary notification pagination. New read markers live in account-scoped browser storage, capped at 1,000 IDs; they do not synchronize across devices and clearing browser storage resets them. Existing server read markers remain honored. There is no mark-read write endpoint.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Up to 50 notifications are returned, with the newest first.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 226.** Read My Notifications — Valid Request and Response

This figure demonstrates the request and returned response for “Read My Notifications.”

[SCREENSHOT: Invalid request and response.]

**Figure 227.** Read My Notifications — Invalid Request and Response

This figure shows a rejected request for “Read My Notifications” and the error message returned by the system.

## 1.18 REPORT MODULE API

### 1.18.1 Module Description

This module supplies student lists, requirement registers, and totals for reports. The website prepares the printable PDF; these endpoints provide the information.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/reports/user-directory](http://localhost:3001/api/v1/reports/user-directory)
- GET [http://localhost:3001/api/v1/reports/roster](http://localhost:3001/api/v1/reports/roster)
- GET [http://localhost:3001/api/v1/reports/roster-stats](http://localhost:3001/api/v1/reports/roster-stats)
- GET [http://localhost:3001/api/v1/reports/step-register](http://localhost:3001/api/v1/reports/step-register)

### 1.18.2 Read User-Directory Report Data

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint provides account information for a user-directory report.

**Endpoint:** [http://localhost:3001/api/v1/reports/user-directory](http://localhost:3001/api/v1/reports/user-directory)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: q (up to 100 characters), role (permitted account category
- omit for all), outside (ALL/INSIDE/OUTSIDE), academicYearId, departmentId, yearLevel
- sort (joined/studentNumber/name, default joined), dir (asc/desc, default desc). Account-category labels in this document are descriptive, not values used by the account-management screen
- use the account-management client for role-filtered requests.

**Important Notes:**

- At most 1,000 report rows are returned. Check the matched count and shortened-results notice before presenting the report as complete.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The selected year, matching account rows, total matches, and a notice of any shortened results are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 228.** Read User-Directory Report Data — Valid Request and Response

This figure shows the request and returned response for “Read User-Directory Report Data.”

[SCREENSHOT: Invalid request and response.]

**Figure 229.** Read User-Directory Report Data — Invalid Request and Response

This figure shows a rejected request for “Read User-Directory Report Data” and the error message returned by the system.

### 1.18.3 Read Department-Roster Report Data

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint provides student information for a department roster report.

**Endpoint:** [http://localhost:3001/api/v1/reports/roster](http://localhost:3001/api/v1/reports/roster)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Optional address filter: academicYearId
- scope (mine/all, default mine)
- sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt)
- dir (asc/desc)
- q (up to 100 characters)
- departmentIds, yearLevels, buckets, steps (repeat array address filter keys for multiple selections)
- stepState
- enrolled (true/false)
- unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Important Notes:**

- At most 1,000 rows are returned. Summary totals describe the returned rows. The separate total-count endpoint ignores progress-group filters, so its totals can differ. Without a selected year, the result is empty.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The selected year, student rows, summary totals, total matches, and a notice of shortened results are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 230.** Read Department-Roster Report Data — Valid Request and Response

This figure demonstrates the request and returned response for “Read Department-Roster Report Data.”

[SCREENSHOT: Invalid request and response.]

**Figure 231.** Read Department-Roster Report Data — Invalid Request and Response

This figure shows a rejected request for “Read Department-Roster Report Data” and the error message returned by the system.

### 1.18.4 Read Uncapped Roster Totals

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint counts the students matching the roster filters.

**Endpoint:** [http://localhost:3001/api/v1/reports/roster-stats](http://localhost:3001/api/v1/reports/roster-stats)

**Method:** GET

**Configurations:** An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply.

**Parameters:**

- Optional address filter: academicYearId
- scope (mine/all, default mine)
- sort (name/studentNumber/stepsVerified/yearLevel/enrolledAt)
- dir (asc/desc)
- q (up to 100 characters)
- departmentIds, yearLevels, buckets, steps (repeat array address filter keys for multiple selections)
- stepState
- enrolled (true/false)
- unassigned (true). Buckets: NOT_STARTED, IN_PROGRESS, READY_FOR_QUEUE, ENROLLED. Step states: MISSING, PENDING, SUBMITTED, VERIFIED, RETURNED. Scope all is a roster filter, not an access-control bypass.

**Important Notes:**

- These totals have no report row limit. Progress-group filters are not applied; other supported roster filters still apply.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Totals by course, course and year level, progress group, and unassigned students are returned without the report row limit.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 232.** Read Uncapped Roster Totals — Valid Request and Response

This figure shows the request and returned response for “Read Uncapped Roster Totals.”

[SCREENSHOT: Invalid request and response.]

**Figure 233.** Read Uncapped Roster Totals — Invalid Request and Response

This figure shows a rejected request for “Read Uncapped Roster Totals” and the error message returned by the system.

### 1.18.5 Read Step-Register Report Data

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint provides submissions for a requirement register report.

**Endpoint:** [http://localhost:3001/api/v1/reports/step-register](http://localhost:3001/api/v1/reports/step-register)

**Method:** GET

**Configurations:** An SBO officer or administrator must be signed in.

**Parameters:**

- Query: step is required.
- Other submission filters apply, except page and pageSize.
- Optional address filter: step (ASSESSMENT, SOCIAL_MEDIA, PROFILING, MUGSHOT, CONSENT)
- page (default 1), pageSize (1–100, default 50)
- sort (submittedAt, studentName, status
- default submittedAt)
- dir (asc/desc, default asc)
- q (up to 100 characters)
- status (ALL, PENDING, SUBMITTED, VERIFIED, RETURNED)
- evidence (ALL, HAS, NONE)
- range (ALL, today, 7d, 30d, year).

**Important Notes:**

- At most 1,000 rows are returned. The website creates the PDF from these rows.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The year, selected requirement, matching rows, total matches, and a notice of shortened results are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 234.** Read Step-Register Report Data — Valid Request and Response

This figure demonstrates the request and returned response for “Read Step-Register Report Data.”

[SCREENSHOT: Invalid request and response.]

**Figure 235.** Read Step-Register Report Data — Invalid Request and Response

This figure shows a rejected request for “Read Step-Register Report Data” and the error message returned by the system.

## 1.19 ACCOUNT MANAGEMENT MODULE API

### 1.19.1 Module Description

This module lets administrators find accounts, change supported permissions, block accounts, and help students replace passwords.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)
- PATCH [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)
- DELETE [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)
- PATCH [http://localhost:3001/api/v1/users/:userId](http://localhost:3001/api/v1/users/:userId)
- DELETE [http://localhost:3001/api/v1/users/:userId](http://localhost:3001/api/v1/users/:userId)
- POST [http://localhost:3001/api/v1/users/:userId/password-reset](http://localhost:3001/api/v1/users/:userId/password-reset)

### 1.19.2 Search the User Directory

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint finds accounts in the administrator's user directory.

**Endpoint:** [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: q (up to 100 characters), role (permitted account category
- omit for all), outside (ALL/INSIDE/OUTSIDE), academicYearId, departmentId, yearLevel
- sort (joined/studentNumber/name, default joined), dir (asc/desc, default desc). Account-category labels in this document are descriptive, not values used by the account-management screen
- use the account-management client for role-filtered requests.
- Optional page (at least 1, default 1), pageSize (1–100, default 50).

**Important Notes:**

- The year defaults to active, otherwise newest. Academic year alone does not restrict account membership. Name/student-number sorting occurs within the page already selected by joined date, not globally. These endpoints do not require the integration extra administrator verification.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A page of account details is returned, including placement, permissions, and blocked status where available.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 236.** Search the User Directory — Valid Request and Response

This figure shows the request and returned response for “Search the User Directory.”

[SCREENSHOT: Invalid request and response.]

**Figure 237.** Search the User Directory — Invalid Request and Response

This figure shows a rejected request for “Search the User Directory” and the error message returned by the system.

### 1.19.3 Change Student or Officer Permissions in Bulk

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint changes supported student or officer permissions for selected accounts.

**Endpoint:** [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)

**Method:** PATCH

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: userIds (required array, 0–500 not empty identifiers), role (required permitted student/officer value used by the account-management screen).

**Important Notes:**

- Only student-to-officer or officer-to-student changes are allowed. Human role labels are not accepted values used by the account-management screen; use the administrative account client for this request. Already-matching/unsupported targets are skipped; missing IDs are absent from the result. Empty selection succeeds with zero updates.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The number of updated accounts and details of skipped accounts are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 238.** Change Student or Officer Permissions in Bulk — Valid Request and Response

This figure demonstrates the request and returned response for “Change Student or Officer Permissions in Bulk.”

[SCREENSHOT: Invalid request and response.]

**Figure 239.** Change Student or Officer Permissions in Bulk — Invalid Request and Response

This figure shows a rejected request for “Change Student or Officer Permissions in Bulk” and the error message returned by the system.

### 1.19.4 Block or Delete Selected Accounts

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint blocks or deletes selected accounts according to their activity.

**Endpoint:** [http://localhost:3001/api/v1/users](http://localhost:3001/api/v1/users)

**Method:** DELETE

**Configurations:** An administrator must be signed in.

**Parameters:**

- Request body: userIds (required array, 0–500 not empty identifiers).

**Important Notes:**

- Accounts with activity are blocked, their sessions revoked, and queue/availability state cleaned. Inactive accounts take the narrower delete path. Administrators, already-blocked accounts, and missing accounts are skipped. This is not the separate permanent-purge operation.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Lists of deleted, blocked, and skipped accounts are returned. Accounts with activity are blocked rather than immediately erased.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 240.** Block or Delete Selected Accounts — Valid Request and Response

This figure shows the request and returned response for “Block or Delete Selected Accounts.”

[SCREENSHOT: Invalid request and response.]

**Figure 241.** Block or Delete Selected Accounts — Invalid Request and Response

This figure shows a rejected request for “Block or Delete Selected Accounts” and the error message returned by the system.

### 1.19.5 Change One Student or Officer Permission

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint changes the supported student or officer permission for one account.

**Endpoint:** [http://localhost:3001/api/v1/users/:userId](http://localhost:3001/api/v1/users/:userId)

**Method:** PATCH

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: userId.
- Request body: role (required permitted student/officer value used by the account-management screen).

**Important Notes:**

- Use the account-management client rather than substituting a human label. Other email-derived account categories cannot be changed through this action. Repeating the same allowed value is a no-change success.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The account identifier and saved permission are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 242.** Change One Student or Officer Permission — Valid Request and Response

This figure demonstrates the request and returned response for “Change One Student or Officer Permission.”

[SCREENSHOT: Invalid request and response.]

**Figure 243.** Change One Student or Officer Permission — Invalid Request and Response

This figure shows a rejected request for “Change One Student or Officer Permission” and the error message returned by the system.

### 1.19.6 Permanently Purge a Blocked Account

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint permanently removes an eligible blocked account and related records.

**Endpoint:** [http://localhost:3001/api/v1/users/:userId](http://localhost:3001/api/v1/users/:userId)

**Method:** DELETE

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: userId.

**Important Notes:**

- Permanent removal and related-record cleanup require an already-blocked non-administrator account.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The identifier of the removed account is returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 244.** Permanently Purge a Blocked Account — Valid Request and Response

This figure shows the request and returned response for “Permanently Purge a Blocked Account.”

[SCREENSHOT: Invalid request and response.]

**Figure 245.** Permanently Purge a Blocked Account — Invalid Request and Response

This figure shows a rejected request for “Permanently Purge a Blocked Account” and the error message returned by the system.

### 1.19.7 Set a Replacement Student Password

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint lets an administrator set a student's replacement password.

**Endpoint:** [http://localhost:3001/api/v1/users/:userId/password-reset](http://localhost:3001/api/v1/users/:userId/password-reset)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- Path: userId.
- Request body: newPassword (required string, 8–128 characters).

**Important Notes:**

- Immediately sets credentials, not an emailed link. Only a student target other than the person making the request is allowed. This handler does not revoke existing target sessions or exclude blocked targets.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A confirmation and message are returned. This changes the password directly rather than sending a reset email.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 246.** Set a Replacement Student Password — Valid Request and Response

This figure demonstrates the request and returned response for “Set a Replacement Student Password.”

[SCREENSHOT: Invalid request and response.]

**Figure 247.** Set a Replacement Student Password — Invalid Request and Response

This figure shows a rejected request for “Set a Replacement Student Password” and the error message returned by the system.

## 1.20 INTEGRATION SETTINGS MODULE API

### 1.20.1 Module Description

This module shows the connected services and their settings. Sensitive changes require additional administrator verification. Better Auth stays enabled because the system needs it for sign-in.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/integrations/authenticators](http://localhost:3001/api/v1/integrations/authenticators)
- DELETE [http://localhost:3001/api/v1/integrations/authenticators/:userId](http://localhost:3001/api/v1/integrations/authenticators/:userId)
- GET [http://localhost:3001/api/v1/integrations/credentials/export](http://localhost:3001/api/v1/integrations/credentials/export)
- GET [http://localhost:3001/api/v1/integrations](http://localhost:3001/api/v1/integrations)
- PATCH [http://localhost:3001/api/v1/integrations/:key](http://localhost:3001/api/v1/integrations/:key)
- POST [http://localhost:3001/api/v1/integrations/:key/credentials/validate](http://localhost:3001/api/v1/integrations/:key/credentials/validate)
- PUT [http://localhost:3001/api/v1/integrations/:key/credentials](http://localhost:3001/api/v1/integrations/:key/credentials)
- DELETE [http://localhost:3001/api/v1/integrations/:key/credentials](http://localhost:3001/api/v1/integrations/:key/credentials)

### 1.20.2 List Administrator Authenticator Status

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint shows which administrators have set up an authenticator.

**Endpoint:** [http://localhost:3001/api/v1/integrations/authenticators](http://localhost:3001/api/v1/integrations/authenticators)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Administrator session required; no extra administrator verification required merely to view status.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** The administrator identifiers, names, emails, and setup status are returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 248.** List Administrator Authenticator Status — Valid Request and Response

This figure shows the request and returned response for “List Administrator Authenticator Status.”

[SCREENSHOT: Invalid request and response.]

**Figure 249.** List Administrator Authenticator Status — Invalid Request and Response

This figure shows a rejected request for “List Administrator Authenticator Status” and the error message returned by the system.

### 1.20.3 Reset an Administrator Authenticator

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint removes an administrator's authenticator setup.

**Endpoint:** [http://localhost:3001/api/v1/integrations/authenticators/:userId](http://localhost:3001/api/v1/integrations/authenticators/:userId)

**Method:** DELETE

**Configurations:** An administrator must be signed in. Complete the extra security unlock before this action.

**Parameters:**

- Path: userId.

**Important Notes:**

- Requires a current administrator extra administrator verification unlock. Deletes the target's authenticator and temporary unlock and requires fresh setup. Self-reset is allowed.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 404 | Not Found | The requested record cannot be found. |

**Response (JSON):** The account identifier and not-enrolled status are returned. Fresh setup is needed before the next protected unlock.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 250.** Reset an Administrator Authenticator — Valid Request and Response

This figure demonstrates the request and returned response for “Reset an Administrator Authenticator.”

[SCREENSHOT: Invalid request and response.]

**Figure 251.** Reset an Administrator Authenticator — Invalid Request and Response

This figure shows a rejected request for “Reset an Administrator Authenticator” and the error message returned by the system.

### 1.20.4 Export Effective Integration Credentials

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint prepares a private copy of the active service credentials.

**Endpoint:** [http://localhost:3001/api/v1/integrations/credentials/export](http://localhost:3001/api/v1/integrations/credentials/export)

**Method:** GET

**Configurations:** The user must be signed in. Record-permission checks may also apply.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Requires a current extra administrator verification unlock. Cache-Control: no-store. Content contains actual effective secrets, not masks. Store privately and never paste the export into the manuscript, screenshots, or source control. Unreadable overrides can fall back to configured environment values.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** A suggested file name and credential text are returned. The text contains real secrets and must never appear in this paper or screenshots.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 252.** Export Effective Integration Credentials — Valid Request and Response

This figure shows the request and returned response for “Export Effective Integration Credentials.”

[SCREENSHOT: Invalid request and response.]

**Figure 253.** Export Effective Integration Credentials — Invalid Request and Response

This figure shows a rejected request for “Export Effective Integration Credentials” and the error message returned by the system.

### 1.20.5 Read Integration Availability and Configuration

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint shows which connected services are available and configured.

**Endpoint:** [http://localhost:3001/api/v1/integrations](http://localhost:3001/api/v1/integrations)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Viewing settings does not require the extra security unlock. Secret fields show masks rather than actual values. Turning an optional service on does not prove its credentials are ready. Better Auth is always enabled.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |

**Response (JSON):** General callers receive service availability. Administrators receive detailed service settings. Secret values are hidden. Better Auth is always on and includes feature-status information.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 254.** Read Integration Availability and Configuration — Valid Request and Response

This figure demonstrates the request and returned response for “Read Integration Availability and Configuration.”

[SCREENSHOT: Invalid request and response.]

**Figure 255.** Read Integration Availability and Configuration — Invalid Request and Response

This figure shows a rejected request for “Read Integration Availability and Configuration” and the error message returned by the system.

### 1.20.6 Enable or Disable an Integration

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint turns a supported optional service on or off.

**Endpoint:** [http://localhost:3001/api/v1/integrations/:key](http://localhost:3001/api/v1/integrations/:key)

**Method:** PATCH

**Configurations:** An administrator must be signed in. Complete the extra security unlock before this action.

**Parameters:**

- Path: key is turnstile, r2, googleAuth, cloudflareChat, email, googleForms, or googleCalendar.
- Request body: enabled (required true or false).

**Important Notes:**

- Complete the administrator security unlock before changing a switch. Better Auth cannot be changed and returns INTEGRATION_LOCKED.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The integration key and saved on-or-off status are returned. Better Auth cannot be turned off.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 256.** Enable or Disable an Integration — Valid Request and Response

This figure shows the request and returned response for “Enable or Disable an Integration.”

[SCREENSHOT: Invalid request and response.]

**Figure 257.** Enable or Disable an Integration — Invalid Request and Response

This figure shows a rejected request for “Enable or Disable an Integration” and the error message returned by the system.

### 1.20.7 Check Integration Credentials Before Saving

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint checks proposed service credentials without saving them.

**Endpoint:** [http://localhost:3001/api/v1/integrations/:key/credentials/validate](http://localhost:3001/api/v1/integrations/:key/credentials/validate)

**Method:** POST

**Configurations:** An administrator must be signed in.

**Parameters:**

- key — Required supported service key in the endpoint address. Better Auth is locked.
- version — Required current revision number, zero or greater.
- values — Required group of credential names and proposed values. Each value may contain at most 4,096 characters or be null. The same field and pairing rules apply as when saving.

**Important Notes:**

- This check does not save values and does not require the extra security unlock. It checks required fields, matching pairs, formats, and supported provider connections using the draft and existing values. It shares the credential-attempt limit. A successful check is not a saved change.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 422 | Details Could Not Be Verified | Check the supplied credentials or file details. |

**Response (JSON):** The service key, current revision, and each checked field's saved status and source are returned. Secret values are not returned.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 258.** Check Integration Credentials Before Saving — Valid Request and Response

This figure demonstrates the request and returned response for “Check Integration Credentials Before Saving.”

[SCREENSHOT: Invalid request and response.]

**Figure 259.** Check Integration Credentials Before Saving — Invalid Request and Response

This figure shows a rejected request for “Check Integration Credentials Before Saving” and the error message returned by the system.

### 1.20.8 Save Integration Credential Overrides

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint saves replacement credentials for a connected service.

**Endpoint:** [http://localhost:3001/api/v1/integrations/:key/credentials](http://localhost:3001/api/v1/integrations/:key/credentials)

**Method:** PUT

**Configurations:** An administrator must be signed in. Complete the extra security unlock before this action.

**Parameters:**

- key — Required service key in the endpoint address. Better Auth is locked and cannot be edited.
- version — Required current revision number, zero or greater, in the request body. Read it from the service settings first.
- values — Required group of permitted credential field names and replacement values. Each value may contain at most 4,096 characters. Leave a field out to keep it; use null to remove an override. Do not send empty strings.

**Important Notes:**

- Complete the administrator security unlock first. Paired fields must be submitted together when changed. Supported services check credentials before saving. Unchanged values do not increase the revision. Credential checks, saves, and resets share a ten-attempt-per-minute limit. Better Auth is locked. Check the restart notice after saving.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |
| 422 | Details Could Not Be Verified | Check the supplied credentials or file details. |

**Response (JSON):** The updated service settings are returned. A restart notice shows whether saved values need a server restart before use.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 260.** Save Integration Credential Overrides — Valid Request and Response

This figure shows the request and returned response for “Save Integration Credential Overrides.”

[SCREENSHOT: Invalid request and response.]

**Figure 261.** Save Integration Credential Overrides — Invalid Request and Response

This figure shows a rejected request for “Save Integration Credential Overrides” and the error message returned by the system.

### 1.20.9 Restore Configured Credential Defaults

**Version:** 1.0

**Date:** November 19, 2026

**Description:** This endpoint removes saved credential overrides for a connected service.

**Endpoint:** [http://localhost:3001/api/v1/integrations/:key/credentials](http://localhost:3001/api/v1/integrations/:key/credentials)

**Method:** DELETE

**Configurations:** An administrator must be signed in. Complete the extra security unlock before this action.

**Parameters:**

- Path: key is a supported integration key. No version business field.

**Important Notes:**

- Requires the administrator security unlock. This removes saved overrides and may disrupt a connected service. Use test settings only. Better Auth cannot be changed.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |
| 409 | Conflicting Change | Refresh the record or resolve its current state. |

**Response (JSON):** The service settings are returned using the server's configured defaults. This does not restart the server or restore an exported backup.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 262.** Restore Configured Credential Defaults — Valid Request and Response

This figure demonstrates the request and returned response for “Restore Configured Credential Defaults.”

[SCREENSHOT: Invalid request and response.]

**Figure 263.** Restore Configured Credential Defaults — Invalid Request and Response

This figure shows a rejected request for “Restore Configured Credential Defaults” and the error message returned by the system.

## 1.21 ACTIVITY LOG MODULE API

### 1.21.1 Module Description

This module lets administrators review recorded requests that changed application information.

This module has the following endpoints:

- GET [http://localhost:3001/api/v1/audit-logs](http://localhost:3001/api/v1/audit-logs)

### 1.21.2 Search Recorded Write Requests

**Version:** 1.0

**Date:** November 20, 2026

**Description:** This endpoint shows recorded requests that changed application information.

**Endpoint:** [http://localhost:3001/api/v1/audit-logs](http://localhost:3001/api/v1/audit-logs)

**Method:** GET

**Configurations:** An administrator must be signed in.

**Parameters:**

- Optional address filter: role (account category filter, at most 40 characters), method (POST/PUT/PATCH/DELETE), q (actor name, email, or path
- at most 200 characters).
- Optional address filter: page (positive whole number, default 1), pageSize or limit (default 50, maximum 200). Some small-list endpoints return the full list with page details rather than slicing
- see endpoint notes.

**Important Notes:**

- Records signed-in versioned write requests, newest first. This request audit is separate from administrator action summaries.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (JSON):** Matching activity entries are returned with the account, action, address, result, and time.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 264.** Search Recorded Write Requests — Valid Request and Response

This figure shows the request and returned response for “Search Recorded Write Requests.”

[SCREENSHOT: Invalid request and response.]

**Figure 265.** Search Recorded Write Requests — Invalid Request and Response

This figure shows a rejected request for “Search Recorded Write Requests” and the error message returned by the system.

## 1.22 ENROLLMENT ASSISTANT MODULE API

### 1.22.1 Module Description

This module provides an assistant that answers enrollment questions. Replies arrive in small parts while the answer is being written.

This module has the following endpoints:

- POST [http://localhost:3001/api/chat/stream](http://localhost:3001/api/chat/stream)

### 1.22.2 Stream an Enrollment Assistant Reply

**Version:** 1.0

**Date:** November 20, 2026

**Description:** This endpoint sends a question to the enrollment assistant.

**Endpoint:** [http://localhost:3001/api/chat/stream](http://localhost:3001/api/chat/stream)

**Method:** POST

**Configurations:** A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area.

**Parameters:**

- messages — Required list of 1–20 messages in the request body.
- role — Required for each message: user or assistant. The older value model is also accepted as assistant.
- text — Required message text, 1–2,000 characters per message. The whole request may not exceed 100 KB.

**Important Notes:**

- Uses the signed-in student working area. Legacy model messages normalize to assistant. Ten requests per minute per account/IP; daily allowances and connected service limits also apply. Errors after the stream starts are event objects, not a new HTTP status.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | The request was completed. |
| 400 | Invalid Request | Check the required information. |
| 403 | Access Denied | Permission or security verification is required. |

**Response (Event stream):** The answer arrives in parts, followed by a completion or error notice. A reply can start successfully and still report an error later.

[SCREENSHOT: Valid Request; include the request and response.]

**Figure 266.** Stream an Enrollment Assistant Reply — Valid Request and Response

This figure demonstrates the request and returned response for “Stream an Enrollment Assistant Reply.”

[SCREENSHOT: Invalid request and response.]

**Figure 267.** Stream an Enrollment Assistant Reply — Invalid Request and Response

This figure shows a rejected request for “Stream an Enrollment Assistant Reply” and the error message returned by the system.

## 1.23 SYSTEM HEALTH MODULE API

### 1.23.1 Module Description

This module provides a basic check that the application server is responding.

This module has the following endpoints:

- GET [http://localhost:3001/api/health](http://localhost:3001/api/health)

### 1.23.2 Check Basic Application Health

**Version:** 1.0

**Date:** November 20, 2026

**Description:** This endpoint checks whether the application server is responding.

**Endpoint:** [http://localhost:3001/api/health](http://localhost:3001/api/health)

**Method:** GET

**Configurations:** No sign-in is required. Follow any token or provider checks described below.

**Parameters:**

- No additional request-body or query information is required.

**Important Notes:**

- Public, non-versioned JSON. It is a basic liveness response, not a database-readiness probe.

Response codes of this API endpoint:

| Code | Message | Description |
| --- | --- | --- |
| 200 | Request Successful (OK) | A simple running confirmation is returned. This does not check database readiness. |

**Response (JSON):** A simple running confirmation is returned. This does not check database readiness.

[SCREENSHOT: Request and response.]

**Figure 268.** Check Basic Application Health — Request and Response

This figure shows the health-check request and the server response indicating that the application is running.

