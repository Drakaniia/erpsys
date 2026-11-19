"""Generate a standalone API manuscript from a combined project manuscript.

Usage: python docs/paper/split_api.py --source path/to/combined.md
The source is read-only. Existing destinations are never overwritten.
"""
import argparse
import pathlib
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=pathlib.Path, required=True)
parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path(__file__).with_name("API_DOCUMENTATION.md"))
args = parser.parse_args()
source = args.source.read_text(encoding="utf-8")
body = source.split("# API Documentation\n", 1)[1].split("# External API Documentation\n", 1)[0]
body = body[body.index("## 1.1 STUDENT MODULE API"):].rstrip().rstrip("-").rstrip()
roles = {
    "ENROLLMENT_ADVISER": "Enrollment adviser",
    "SBO_OFFICER": "SBO officer",
    "STUDENT": "Student",
    "ADMIN": "Administrator",
}
for code, label in roles.items():
    body = re.sub(rf"\b{code}\b", label, body)
body = re.sub(r"\bnginx\b", "web server", body, flags=re.I)
header = """# ERPSYS — API Documentation

## Purpose and Use

This standalone companion to the project paper retains the seven API modules, endpoint descriptions, request examples, response codes, and figure captions from the combined manuscript. Chapters 1–5 are presented separately in the project paper.

The local example address is `http://localhost:3001`. Replace it with the deployed website address when testing a hosted system. Versioned resources use `/api/v1`, authentication uses `/api/auth`, and the assistant uses `/api/chat/stream`.

**Example conventions:** Identifiers, dates, credentials, and student details are illustrative. Role names are written in ordinary language rather than internal account codes. A role name shown in an example explains the intended user category; it is not a literal role value to copy into a request. Use the account-management interface or the validated API contract for permitted role values.

**Validation status:** The endpoint descriptions and expected responses are documentation, not proof that the requests were run. Capture dates and screenshot placeholders must be completed through actual testing. Confirm all endpoints against the running version before external use, especially operational routes and optional services.

**Concurrency:** Versioned data operations use transaction timestamps to help prevent an older request from overwriting newer work. A response may include `ts`; a write may return that value to identify the version being edited. A stale operation can return `409` with `TS_ABORTED`. Refresh the affected record before trying again. Session authentication is managed separately.

## Request and Response Evidence

Each endpoint retains its version, capture date, purpose, address, method, configuration, parameters, expected responses, and request/response figure captions. Items marked TODO or `<date of capture>` still require the project team's evidence.

"""
external = """

# External API Documentation

## A. Google Sign-In

**Description:** Lets a user sign in with a Google account. ERPSYS still checks the account's permission before allowing access to protected information.

**Protocol:** OAuth 2.0, with the configured sign-in provider.

**Documentation:** [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2).

## B. Cloudflare Turnstile

**Description:** Checks public sign-in and registration requests for automated activity. The server validates the returned check result.

**Service:** Turnstile managed widget and server verification.

**Documentation:** [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/).

## C. Cloudflare R2

**Description:** Stores enrollment evidence, photographs, and stamp images privately. Upload and read permissions are controlled by the application.

**Interface:** S3-compatible storage API.

**Documentation:** [Cloudflare R2 API](https://developers.cloudflare.com/r2/api/s3/).

## D. Cloudflare Workers AI

**Description:** Supports the enrollment assistant using the information approved by the office, subject to configured usage limits.

**Interface:** Workers AI inference service.

**Documentation:** [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/).

## E. Google Forms

**Description:** Supports creation and linking of the student profiling form when configured. Related Google Drive permissions support form management; Google Drive is not the primary evidence store.

**Version:** Google Forms API v1.

**Documentation:** [Google Forms API](https://developers.google.com/workspace/forms/api).

## F. Google Calendar

**Description:** Optionally mirrors an adviser's published office-hour schedule to a connected Google Calendar. Connecting a calendar is separate from signing in with Google.

**Version:** Google Calendar API v3.

**Documentation:** [Google Calendar API](https://developers.google.com/workspace/calendar/api).

## G. MongoDB Atlas

**Description:** Hosts the database for accounts, enrollment steps, verification decisions, queue entries, and administrative records. It is supporting infrastructure rather than an optional student feature.

**Interface:** MongoDB database driver over an encrypted connection.

**Documentation:** [MongoDB Atlas](https://www.mongodb.com/docs/atlas/).
"""
output = header + body + external
assert not re.search(r"ENROLLMENT_ADVISER|SBO_OFFICER|\bnginx\b|apps/(?:server|web)/", output, re.I)
with args.output.open("x", encoding="utf-8", newline="\n") as stream:
    stream.write(output)
print(f"Generated {args.output}: {len(re.findall(r'^### ', body, re.M))} module and endpoint sections retained")
