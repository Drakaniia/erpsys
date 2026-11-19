"""Reference-style API manuscript with human-readable tables and screenshot slots."""
import re
from api_paper_content import MODULES, NOTES, PARAMETERS, PLAIN

ALIASES = {"Validate Draft Integration Credentials": "Check Integration Credentials Before Saving", "Read Active Editors": "Read a Record's Active Editors", "Join or Renew an Editing Lease": "Join or Refresh Editing Presence", "Leave an Editing Lease": "Leave Editing Presence"}
ORDER = list(MODULES)
BASE_URL = 'http://localhost:3001'
FIGURES_PER_ENDPOINT = 2
STATUS = {
    200: ("Request Successful (OK)", "The request was accepted and its result is returned."),
    201: ("Created", "The requested record or submission was created."),
    206: ("Partial Content", "The requested part of the file is returned."),
    302: ("Redirect", "The browser is sent to the next page in the process."),
    400: ("Invalid Request", "Required information is missing, incorrect, or not accepted."),
    401: ("Sign-In Required", "The user is not signed in or the supplied sign-in information is not valid."),
    403: ("Access Denied", "The account does not have permission, or a required security step has not been completed."),
    404: ("Not Found", "The selected record or required information cannot be found."),
    409: ("Conflicting Change", "The record changed or its current state does not allow the action. Refresh it before trying again."),
    412: ("Required Step Not Completed", "A required setup or earlier step has not been completed."),
    413: ("File or Request Too Large", "The request or file is larger than the allowed size."),
    415: ("File Type Not Supported", "The selected file type is not accepted."),
    422: ("Details Could Not Be Verified", "The service could not accept or verify the supplied details."),
    429: ("Too Many Attempts", "The request limit has been reached. Wait before trying again."),
    500: ("Server Error", "The server could not finish the request because an internal problem occurred."),
    502: ("Connected Service Error", "A connected service could not provide the required result."),
    503: ("Service Unavailable", "A required service is disabled, unavailable, or temporarily limited."),
}
INTRO = """# API Documentation

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

"""


def simple(text):
    for old, new in {
        "nonempty": "not empty", "trimmed": "with extra outside spaces removed", "boolean": "true or false",
        "integer": "whole number", "wire values": "values used by the account-management screen",
        "wire value": "value used by the account-management screen", "no-op": "no-change",
        "payload": "returned information", "paging metadata": "page details", "metadata": "file details",
        "envelope": "response format", "step-up": "extra administrator security check", "upserts": "adds or updates",
        "caller": "person making the request", "uncapped": "without a row limit", "Body:": "Request body:",
        "presign": "upload-address creation", "MIME": "file type", "persistence": "saving",
        "stale version": "an older revision", "concurrent": "simultaneous", "prerequisites": "required earlier steps",
        "step-up": "extra administrator verification", "query": "address filter",
        "retained": "remaining", "placement": "course and year-level selection",
        "provider": "connected service", "schema": "input rules", "no business body fields": "no extra request-body fields",
        ">=": "at least ", "<=": "at most ", "max ": "up to ",
    }.items():
        text = text.replace(old, new)
    text = re.sub(r'\{\s*([^{}]*)\s*\}', lambda m: "the fields " + m.group(1).strip(), text)
    return text.replace("{", "").replace("}", "").replace("[...]", "the returned list").replace("[]", "an empty list").strip()


def access_label(access):
    if access.lower().startswith("public"):
        return "No sign-in is required. Follow any token or provider checks described below."
    if "admin" in access.lower():
        return "An administrator must be signed in." + (" Complete the extra security unlock before this action." if "step-up" in access else "")
    if "instructor" in access or "adviser" in access.lower():
        return "An enrollment adviser or administrator must be signed in. Department and year-level checks may also apply."
    if "officer" in access.lower():
        return "An SBO officer or administrator must be signed in."
    if "student" in access.lower():
        return "A student, SBO officer, or administrator must be signed in. Adviser access does not include this working area."
    return "The user must be signed in. Record-permission checks may also apply."


def parameter_bullets(title, text):
    if title in PARAMETERS:
        return PARAMETERS[title]
    if text in ("None.", "No business body/query fields.", "No business body fields."):
        return ["No additional request-body or query information is required."]
    return [simple(part) for part in re.split(r';\s*|(?<=[.])\s+(?=(?:Optional|Required|Path:|Body:|Query:|Each |Supply |Other |Use |Google ))', text) if part]


def response_rows(method, path, item, auth):
    if path == '/api/health':
        return [(200, 'Request Successful (OK)', PLAIN[item['title']][1])]
    if path == '/api/auth/sign-up/email':
        return [(400, 'Registration Disabled', 'Use the student-registration endpoint instead.')]
    errors = set(int(code) for code in re.findall(r'\b([45]\d\d)\b', item['errors']))
    codes = [item['status']]
    if path.endswith('/uploads/:id/content'):
        return [(200, 'OK / Partial Content (206)', 'The file or requested part is returned.'),
                (403, 'Access Denied', 'You cannot view this file.'),
                (404, 'Not Found', 'The file cannot be found.')]
    if path == '/api/v1/social-links' and method == 'POST':
        return [(200, 'Updated / Created (201)', 'The link was updated or created.'),
                (400, 'Invalid Request', 'Check the link name and address.'),
                (404, 'Not Found', 'The selected existing link cannot be found.')]
    if path == '/api/auth/sign-in/email':
        important = [400, 401]
    elif path == '/api/auth/email-otp/send-verification-otp':
        important = [400, 503]
    elif path in ('/api/auth/sign-in/email-otp', '/api/auth/email-otp/verify-email'):
        important = [400, 403]
    elif '/credentials' in path:
        important = [422, 409, 403, 404]
    elif '/admin-gate/' in path or '/two-factor/' in path:
        important = [403, 401, 400, 429, 409, 503]
    elif method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        important = [409, 412, 400, 403, 404, 422, 413, 503]
    else:
        important = [404, 403, 412, 401, 503]
    for code in important:
        if code in errors and code not in codes:
            codes.append(code)
        if len(codes) == 3:
            break
    if len(codes) == 1 and not auth and not item['access'].lower().startswith('public'):
        codes.append(403)
    concise = {200: 'The request was completed.', 201: 'The new record was created.',
               302: 'Continue on the next page.', 400: 'Check the required information.',
               401: 'Sign in or check your sign-in details.', 403: 'Permission or security verification is required.',
               404: 'The requested record cannot be found.', 409: 'Refresh the record or resolve its current state.',
               412: 'Complete the required setup or earlier step.', 413: 'Choose a smaller file.',
               422: 'Check the supplied credentials or file details.', 429: 'Wait before trying again.',
               503: 'The required service is unavailable.'}
    return [(code, STATUS[code][0], concise[code]) for code in sorted(codes)]


def evidence(fig, method, path, item):
    title = item['title']
    disabled = path == '/api/auth/sign-up/email'
    first = 'Expected Rejected Request' if disabled else 'Valid Request'
    format_name = 'File content' if path.endswith('/content') else 'Event stream' if path == '/api/chat/stream' else 'Redirect' if item['status'] == 302 else 'JSON'
    output = f"**Response ({format_name}):** {PLAIN[title][1]}\n\n"
    if path == '/api/health':
        return output + f"[SCREENSHOT: Request and response.]\n\n**Figure {fig}.** {title} — Request and Response\n\nThis figure shows the health-check request and the server response indicating that the application is running.\n\n"
    verb = ('shows', 'illustrates', 'demonstrates', 'depicts')[fig % 4]
    explanation = 'This figure shows the rejected standard signup request and the message directing students to the student-registration route.' if disabled else f'This figure {verb} the request and returned response for “{title}.”'
    output += f"[SCREENSHOT: {first}; include the request and response.]\n\n**Figure {fig}.** {title} — {first} and Response\n\n{explanation}\n\n"
    if not disabled:
        output += f"[SCREENSHOT: Invalid request and response.]\n\n**Figure {fig + 1}.** {title} — Invalid Request and Response\n\nThis figure shows a rejected request for “{title}” and the error message returned by the system.\n\n"
    return output


def endpoint(number, method, path, item, fig, auth):
    title = item['title']
    url = BASE_URL + path
    module_number = int(number.split('.')[1])
    day = 14 + (module_number - 1) * 7 // len(ORDER)
    output = [f"### {number} {title}\n\n", '**Version:** 1.0\n\n', f'**Date:** November {day}, 2026\n\n', f"**Description:** {PLAIN[title][0]}\n\n", f"**Endpoint:** [{url}]({url})\n\n**Method:** {method}\n\n", f"**Configurations:** {access_label(item['access'])}\n\n", '**Parameters:**\n\n']
    output.extend(f'- {part}\n' for part in parameter_bullets(title, item['parameters']))
    output.append('\n')
    notes = NOTES.get(title, [simple(item['notes'])] if item['notes'] else [])
    if notes:
        output.append('**Important Notes:**\n\n')
        output.extend(f'- {note}\n' for note in notes)
        output.append('\n')

    output.append('Response codes of this API endpoint:\n\n| Code | Message | Description |\n| --- | --- | --- |\n')
    for code, message, description in response_rows(method, path, item, auth):
        output.append(f"| {code} | {message} | {description.replace('|', '/')} |\n")
    output.append('\n' + evidence(fig, method, path, item))
    return ''.join(output)


def entries_by_group():
    from api2paper import current_routes
    from api_contracts import CONTRACTS
    from api_auth_contracts import AUTH_ENDPOINTS
    result = {group: [] for group in ORDER}
    for method, path, title, access, params, response, notes, example, errors in AUTH_ENDPOINTS:
        status = 302 if method == 'GET' and ('callback' in path or path == '/api/auth/reset-password/:token') else 200
        result['auth'].append((method, path, dict(title=title, access=access, parameters=params, notes=notes, errors=errors, status=status)))
    for group, method, path, access in current_routes():
        item = dict(CONTRACTS[f'{method} {path}'], access=access)
        item['title'] = ALIASES.get(item['title'], item['title'])
        if group == 'integrations' and ':key' in path and method in ('PUT', 'PATCH', 'DELETE'):
            item['errors'] += '; 409 INTEGRATION_LOCKED because Better Auth cannot be changed.'
        result[group].append((method, path, item))
    return result


def generate():
    output = [INTRO]
    groups = entries_by_group()
    fig = 1
    for number, group in enumerate(ORDER, 1):
        title, description = MODULES[group]
        entries = groups[group]
        output.append(f'## 1.{number} {title}\n\n### 1.{number}.1 Module Description\n\n{description}\n\nThis module has the following endpoints:\n\n')
        output.extend(f'- {method} [{BASE_URL}{path}]({BASE_URL}{path})\n' for method, path, _ in entries)
        output.append('\n')
        for index, (method, path, item) in enumerate(entries, 2):
            output.append(endpoint(f'1.{number}.{index}', method, path, item, fig, group == 'auth'))
            fig += 1 if path in ('/api/health', '/api/auth/sign-up/email') else FIGURES_PER_ENDPOINT
    return ''.join(output)


def check(text):
    from api2paper import current_routes
    from api_auth_contracts import AUTH_ENDPOINTS
    expected = {(m, p) for _, m, p, _ in current_routes()} | {(row[0], row[1]) for row in AUTH_ENDPOINTS}
    address = re.escape(BASE_URL)
    matches = re.findall(r'^\*\*Endpoint:\*\* \[(' + address + r'[^\]]+)\]\((' + address + r'[^)]+)\)\n\n\*\*Method:\*\* (GET|POST|PUT|PATCH|DELETE)$', text, re.M)
    assert all(label == target for label, target, _ in matches), 'Endpoint hyperlink mismatch'
    pairs = [(method, url.removeprefix(BASE_URL)) for url, _, method in matches]
    assert len(pairs) == len(set(pairs)) and set(pairs) == expected, 'Endpoint coverage mismatch'
    assert '```' not in text and not any(c in text for c in '{}'), 'Code examples remain'
    figures = [int(value) for value in re.findall(r'^\*\*Figure (\d+)\.\*\*', text, re.M)]
    expected_figures = sum(1 if path in ('/api/health', '/api/auth/sign-up/email') else FIGURES_PER_ENDPOINT for _, path in pairs)
    assert figures == list(range(1, expected_figures+1)), 'Figure numbering mismatch'
    explanations = re.findall(r'^\*\*Figure \d+\.\*\*[^\n]+\n\n(This figure[^\n]+)', text, re.M)
    assert len(explanations) == len(figures), 'Every figure needs a brief explanation'
    assert all(re.match(r'This figure (shows|illustrates|demonstrates|depicts|represents)\b', value) for value in explanations), 'Figure text must describe the screenshot'
    assert text.count('**Version:** 1.0\n') == len(pairs), 'Version must be 1.0 for every endpoint'
    dates = re.findall(r'^\*\*Date:\*\* November (\d+), 2026$', text, re.M)
    assert len(dates) == len(pairs) and all(14 <= int(day) <= 20 for day in dates), 'Dates must be November 14–20, 2026'
    assert 'localhost:3000' not in text, 'Old documentation base address remains'
    assert 'Existing signed-in sessions are not ended' not in text, 'Outdated password-reset behavior'
    for group, entries in entries_by_group().items():
        for method, path, item in entries:
            assert 1 <= len(response_rows(method, path, item, group == 'auth')) <= 3, 'Too many status codes'
    assert text.count('| Code | Message | Description |') == len(pairs)
    assert text == generate(), 'Source differs from generated manuscript'
    print(f'PASS: {len(current_routes())} application routes + {len(AUTH_ENDPOINTS)} authentication entries; {len(figures)} numbered screenshot placeholders; no code examples.')
