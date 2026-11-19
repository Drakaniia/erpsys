"""Summarize observed live checks without credentials, personal records, or response bodies."""
from pathlib import Path
from api2paper import current_routes
from api_auth_contracts import AUTH_ENDPOINTS

ROOT = Path(__file__).resolve().parent
OBSERVED = {}


def record(status, lines):
    for line in lines.strip().splitlines():
        assert line not in OBSERVED, line
        OBSERVED[line] = status


record('200', '''
GET /api/health
GET /api/auth/get-session
GET /api/auth/admin-gate/status
GET /api/v1/academic-years
GET /api/v1/academic-years/:id/activation
GET /api/v1/advisers
GET /api/v1/audit-logs
GET /api/v1/me/calendar
GET /api/v1/me/calendar/connect
GET /api/v1/chatbot-knowledge
GET /api/v1/profiling-form
GET /api/v1/social-links
GET /api/v1/signup-options
GET /api/v1/me/departments
GET /api/v1/departments
GET /api/v1/me/enrollments
GET /api/v1/integrations/authenticators
GET /api/v1/integrations
GET /api/v1/me/launch
GET /api/v1/me/overview
GET /api/v1/me/stamp
GET /api/v1/me/notifications
GET /api/v1/me/queue
GET /api/v1/queues
GET /api/v1/reports/user-directory
GET /api/v1/reports/roster
GET /api/v1/reports/roster-stats
GET /api/v1/reports/step-register
GET /api/v1/requirements
GET /api/v1/me/schedule
GET /api/v1/me/student/profile
GET /api/v1/students
GET /api/v1/students/board
GET /api/v1/me/student
GET /api/v1/students/:id/record
GET /api/v1/students/:id
GET /api/v1/me/record
GET /api/v1/submissions
GET /api/v1/submissions/:verificationId
GET /api/v1/transfers
GET /api/v1/users
POST /api/v1/me/availability/heartbeat
POST /api/v1/integrations/:key/credentials/validate
PATCH /api/v1/me/stamp
PATCH /api/v1/me/student
POST /api/v1/me/enrollments
POST /api/v1/me/assessment
PUT /api/v1/requirements/order
PUT /api/v1/social-links/order
''')
record('201 creation; 200 update/delete on dedicated temporary records', '''
POST /api/v1/academic-years
DELETE /api/v1/academic-years/:id
POST /api/v1/departments
PATCH /api/v1/departments/:id
PUT /api/v1/departments/:id/year-levels
DELETE /api/v1/departments/:id
POST /api/v1/requirements
PATCH /api/v1/requirements/:id
DELETE /api/v1/requirements/:id
POST /api/v1/social-links
PATCH /api/v1/social-links/:id
DELETE /api/v1/social-links/:id
''')
record('200 empty selection only; actual account changes not tested', '''
PATCH /api/v1/users
DELETE /api/v1/users
''')
record('200 with zero delivered reminders for missing test profile', '''
POST /api/v1/students/reminders
''')
record('200 with INVALID invitation; valid invitation flow not tested', '''
GET /api/v1/queue-shares/:token
''')
record('200; stream emitted start, token, done', '''
POST /api/chat/stream
''')
record('200 with NOT_CONNECTED; successful Google synchronization not verified', '''
POST /api/v1/me/calendar/sync
DELETE /api/v1/me/calendar
''')
record('Redirect observed for incomplete callback; Google consent success not tested', '''
GET /api/v1/calendar/callback
''')
record('200 through website proxy; direct API-page origin returned 403; delivery not verified', '''
POST /api/auth/request-password-reset
''')
record('200 through website proxy; inbox/code consumption not verified', '''
POST /api/auth/email-otp/send-verification-otp
''')
record('403 assignment required; successful operation blocked', '''
PUT /api/v1/me/availability
GET /api/v1/departments/:id/enrollments
PUT /api/v1/me/schedule
POST /api/v1/queue-shares
POST /api/v1/queues/serving
DELETE /api/v1/queues/serving
POST /api/v1/queues/serving/position
POST /api/v1/enrollments/:id/completion
DELETE /api/v1/enrollments/:id/completion
DELETE /api/v1/enrollments/completions
''')
record('403 security unlock required; no live credentials/settings changed', '''
GET /api/v1/integrations/credentials/export
DELETE /api/v1/integrations/authenticators/:userId
PATCH /api/v1/integrations/:key
PUT /api/v1/integrations/:key/credentials
DELETE /api/v1/integrations/:key/credentials
''')
record('404 expected for missing test record; success not verified', '''
PATCH /api/v1/academic-years/:id
POST /api/v1/academic-years/:id/activation
PATCH /api/v1/advisers/:adviserId
PUT /api/v1/me/departments
POST /api/v1/transfers
PATCH /api/v1/transfers/:id
DELETE /api/v1/transfers/:id
POST /api/v1/departments/:id/takeover
DELETE /api/v1/evidence/:id
POST /api/v1/queue-entries/:id/removal
POST /api/v1/storage/complete
GET /api/v1/storage/session-status
GET /api/v1/uploads/:id/content
PUT /api/v1/students/:id/mugshot
POST /api/v1/submissions/:id/verification
DELETE /api/v1/submissions/:id/verification
POST /api/v1/submissions/:id/replies
PATCH /api/v1/users/:userId
DELETE /api/v1/users/:userId
POST /api/v1/users/:userId/password-reset
''')
record('400 expected input refusal; success not verified', '''
POST /api/v1/evidence
PUT /api/v1/me/evidence-link
DELETE /api/v1/me/evidence-link
POST /api/v1/me/steps/:code/submission
DELETE /api/v1/me/steps/:code/submission
POST /api/v1/queue-entries/:id/restoration
POST /api/v1/storage/session
POST /api/v1/profiling-form
PUT /api/v1/chatbot-knowledge
''')
record('409 current completed placement/queue state; eligible waiting-student success not tested', '''
POST /api/v1/me/queue
DELETE /api/v1/me/queue
''')


record('400 expected missing-input/challenge refusal; valid sign-in or reset not performed', '''
POST /api/auth/sign-up/email
POST /api/auth/sign-up/student
POST /api/auth/sign-in/email
POST /api/auth/sign-in/social
POST /api/auth/sign-in/email-otp
POST /api/auth/email-otp/verify-email
POST /api/auth/reset-password
''')


def build():
    lines = ['# API Screenshot Readiness — Live Checks', '',
             'Target: http://localhost:3001. This report records observed live requests, not a guarantee that all workflows pass. Repeated requests are not counted as separate endpoints. No cookies, passwords, tokens, account emails, or private response bodies are included.', '',
             '## Enrollment fix', '',
             '- The enrollment model now puts a new identifier in $setOnInsert instead of replacing _id during an update.',
             '- All 29 focused enrollment, completion, and authentication tests passed. These include updates and repeated saves that keep the original identifier.',
             '- The compiled API was rebuilt and restarted. Two repeated live POST /api/v1/me/enrollments requests returned 200 with the original placement preserved. Earlier 500 results are superseded by these retests.',
             '- Repository type checks passed. The full test suite timed out; it is not reported as passing.', '',
             '## Before taking screenshots', '',
             '- Use the stated HTTP method and actual IDs. Clicking a URL only sends GET.',
             '- For authentication, use the website on port 5173 and its Network panel, or a client with a permitted Origin and cookie session. A page on the API origin was refused by the authentication Origin check.',
             '- Empty account selections, INVALID share results, and NOT_CONNECTED calendar results are not full business-success tests even when HTTP 200 is returned.',
             '- No school-domain student upload target or adviser-role account was available. Current administrator access does not bypass department assignment checks.',
             '- Remaining successful uploads need a permitted school-email student, real file bytes, upload completion, and authorized content retrieval.',
             '- Remaining queue/review tests need separate current-year student submissions, five verified prerequisites, adviser assignment and live availability, and a student actually being served.',
             '- Google callbacks require real consent; administrator security actions require PIN, password when applicable, email code, and authenticator. These were not bypassed.',
             '- Temporary academic-year, requirement, department, and social-link records created for CRUD tests were removed. Existing enrollment placement was preserved. The assessment endpoint returned APPLIED, so review that account’s assessment status before taking later progress screenshots.',
             '- Reset/verification email requests were accepted, but inbox delivery and token consumption were not confirmed. No password or authenticator reset was performed.',
             '- One POST /api/v1/users request was an operator wrong-method probe (404); the documented PATCH was then tested with 200. It is not an application defect.', '',
             '## Per-endpoint results', '']
    routes = current_routes()
    expected = {f'{m} {p}' for _, m, p, _ in routes} | {f'{r[0]} {r[1]}' for r in AUTH_ENDPOINTS}
    assert set(OBSERVED) <= expected, sorted(set(OBSERVED) - expected)
    for group in dict.fromkeys(g for g, _, _, _ in routes):
        lines.extend(['### ' + group.replace('-', ' ').title(), ''])
        for g, method, path, _ in routes:
            if g == group:
                key = f'{method} {path}'
                lines.append(f'- **{key}:** {OBSERVED.get(key, "NOT RUN — would remove the existing linked profiling form; use a disposable form/year first.")}')
        lines.append('')
    lines.extend(['### Authentication', ''])
    for method, path, *_ in AUTH_ENDPOINTS:
        key = f'{method} {path}'
        lines.append(f'- **{key}:** {OBSERVED.get(key, "NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.")}')
    lines.extend(['', f'Observed method/path pairs: {len(OBSERVED)} of {len(expected)}. Expected refusals are included in this count and are not claimed as successful operations.', ''])
    target = ROOT / 'API_SCREENSHOT_READINESS.md'
    target.write_text('\n'.join(lines), encoding='utf-8')
    print(f'Built {target.name}: {len(OBSERVED)} observed of {len(expected)} documented method/path pairs')


if __name__ == '__main__':
    build()
