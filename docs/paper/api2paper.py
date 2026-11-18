"""Build the standalone API manuscript from explicit contracts and mounted routes.

Usage: python docs/paper/api2paper.py [--check]
Read-only --check compares documented method/path pairs against the current route
inventory. Generation refuses missing contract notes instead of guessing.
"""
import argparse
import json
import pathlib
import re

from api_contracts import CONTRACTS
import api_student_contracts
from api_auth_contracts import AUTH_ENDPOINTS

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent.parent
RESOURCE = REPO / "apps/server/src/routes"
ROUTE_PATTERN = re.compile(r'\w+Router\.(get|post|put|patch|delete)\(\s*"([^"]+)"', re.S)
MOUNTS = re.compile(r'import \{ \w+Router \} from "\./([^/]+)/index\.js";')
DOC_PAIR = re.compile(r'^\*\*Method:\*\* (GET|POST|PUT|PATCH|DELETE)\n\n\*\*Endpoint:\*\* `([^`]+)`', re.M)


def current_routes():
    index = (RESOURCE / "index.ts").read_text(encoding="utf-8")
    groups = MOUNTS.findall(index) + ["chat"]
    result = []
    for group in groups:
        text = (RESOURCE / group / "index.ts").read_text(encoding="utf-8")
        for match in ROUTE_PATTERN.finditer(text):
            method, path = match.groups()
            prefix = "/api" if group == "chat" else "/api/v1"
            before = text[:match.start()]
            block = before[before.rfind("/**"):]
            access_match = re.search(r'Access: (.*?)\.', block)
            access = access_match.group(1) if access_match else "session"
            result.append((group, method.upper(), prefix + path, access))
    result.append(("system", "GET", "/api/health", "public"))
    return result


def access_label(value):
    if value.startswith("public"):
        return "Public; an administrator session changes the integration-list response shape." if "session" in value else "Public."
    if "admin surface" in value:
        return "Administrator session" + (" with current sensitive-action unlock." if "step-up" in value else ".")
    if "instructor surface" in value:
        return "Enrollment adviser or administrator, with any additional assignment checks described below."
    if "officer surface" in value:
        return "SBO officer or administrator."
    if "student surface" in value:
        return "Student-facing access: student, SBO officer, or administrator. Enrollment advisers do not inherit this access."
    return "Signed-in session; the operation may impose additional business visibility checks."


GROUPS = {
    "students": (1, "Student Profiles and Records"),
    "enrollments": (2, "Enrollment Placement and Completion"),
    "evidence": (3, "Evidence and Requirement Submission"),
    "storage": (4, "Private Uploads and File Access"),
    "submissions": (5, "Officer Review"),
    "queues": (6, "Queues and Adviser Service"),
    "queue-shares": (7, "Queue Invitations"),
    "departments": (8, "Departments"),
    "advisers": (9, "Adviser Assignments and Availability"),
    "transfers": (10, "Department Handovers"),
    "schedules": (11, "Office-Hour Schedules"),
    "calendar": (12, "Google Calendar Connection"),
    "academic-years": (13, "Academic Years"),
    "requirements": (14, "Assessment Requirements"),
    "content": (15, "Forms, Links, and Assistant Knowledge"),
    "me": (16, "Launch, Overview, Stamps, and Notifications"),
    "reports": (17, "Report Data"),
    "users": (18, "Account Administration"),
    "integrations": (19, "Integration Administration"),
    "audit-logs": (20, "Request Audit"),
    "chat": (21, "Enrollment Assistant Stream"),
    "system": (22, "Application Health"),
    "editing-presence": (23, "Advisory Editor Presence"),
}
HEADER = """# ERPSYS — API Documentation

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

"""
FOOTER = """
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
"""


def generate():
    routes = current_routes()
    missing = [f"{method} {path}" for _, method, path, _ in routes if f"{method} {path}" not in CONTRACTS]
    if missing:
        raise ValueError("Missing explicit contracts: " + ", ".join(missing))
    expected = {f"{method} {path}" for _, method, path, _ in routes}
    unused = set(CONTRACTS) - expected
    if unused:
        raise ValueError("Unregistered contract notes: " + ", ".join(sorted(unused)))
    output = [HEADER]
    for i, entry in enumerate(AUTH_ENDPOINTS, 1):
        method, path, title, access, params, response, notes, example, errors = entry
        status = None if path == "/api/auth/sign-up/email" else (302 if method == "GET" and ("Callback" in title or path.endswith("callback/google")) else 200)
        output.append(endpoint(f"1.{i}", method, path, title, access, params, response, notes, example, errors, status))
    for group, (number, title) in sorted(GROUPS.items(), key=lambda x: x[1][0]):
        output.append(f"\n## 2.{number}. {title}\n\n")
        subset = [item for item in routes if item[0] == group]
        for i, (_, method, path, access) in enumerate(subset, 1):
            item = CONTRACTS[f"{method} {path}"]
            output.append(endpoint(f"2.{number}.{i}", method, path, item["title"], access_label(access), item["parameters"], item["response"], item["notes"], item["example"], item["errors"], item["status"]))
    output.insert(1 + len(AUTH_ENDPOINTS), "\n# 2. Application Resource API\n\nEach endpoint below is mounted by the current application. Shared envelope, error, and concurrency rules apply unless a specific exception is stated.\n")
    output.append(FOOTER)
    text = "".join(output)
    if re.search(r'(?i)\bnginx\b|ENROLLMENT_ADVISER|SBO_OFFICER|apps/(?:server|web)/|\b[\w/-]+\.tsx?\b', text):
        raise ValueError("Forbidden internal wording in manuscript")
    return text


def endpoint(number, method, path, title, access, parameters, response, notes, example, errors, status):
    outcome = f"**Success:** HTTP {status}. {response}." if status is not None else f"**Expected outcome:** HTTP 400; registration is deliberately disabled. {response}."
    text = f"### {number}. {title}\n\n**Method:** {method}\n\n**Endpoint:** `{path}`\n\n**Version:** {'Application API v1' if path.startswith('/api/v1/') else 'Configured application/authentication version'}\n\n**Capture date:** Not yet supplied.\n\n**Access:** {access}\n\n**Parameters:** {parameters}\n\n{outcome}\n\n"
    if notes:
        text += f"**Behavior:** {notes}\n\n"
    if errors:
        text += f"**Additional failure conditions:** {errors}\n\n"
    if example is not None:
        text += "**Illustrative request body:**\n\n```json\n" + json.dumps(example, ensure_ascii=False, indent=2) + "\n```\n\n"
    text += "**Verification evidence:** Capture actual results using the shared checklist; no successful run is implied by this entry.\n\n"
    return text


def check(text):
    expected = {(m, p) for _, m, p, _ in current_routes()} | {(row[0], row[1]) for row in AUTH_ENDPOINTS}
    pairs = DOC_PAIR.findall(text)
    actual = set(pairs)
    missing, extra = expected - actual, actual - expected
    duplicates = len(pairs) - len(actual)
    if missing or extra or duplicates:
        raise ValueError(f"API coverage mismatch: missing={sorted(missing)}, extra={sorted(extra)}, duplicates={duplicates}")
    if text != generate():
        raise ValueError("API manuscript differs from its contract generator; regenerate or update contracts")
    print(f"PASS API route coverage: {len(current_routes())} concrete application routes + {len(AUTH_ENDPOINTS)} authentication entry points; no duplicates or retired endpoints")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = ROOT / "API_DOCUMENTATION.md"
    if args.check:
        check(target.read_text(encoding="utf-8"))
    else:
        target.write_text(generate(), encoding="utf-8", newline="\n")
        check(target.read_text(encoding="utf-8"))
        print(f"Built {target.name}")
