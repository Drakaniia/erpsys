# Google Calendar setup

Instructors can publish office-hour windows per department. Students see them
on the queue card. Optionally an instructor connects their own Google account and
ERPSYS mirrors the windows to a dedicated **ERPSYS Office Hours** calendar there.
The mirror is one-way: ERPSYS is the source of truth and edits made in Google are
overwritten on the next sync.

The schedule is informational only. The **Accepting students** switch and the
one-hour idle auto-close still decide whether a queue is open.

## What you need

| Item                 | Where                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| Sign-in OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (shared with Google sign-in) |
| Token encryption key | `CALENDAR_TOKEN_KEY`, 32+ random characters                             |
| Calendar API enabled | Google Cloud API Library, same project as the client                    |
| Scope                | `https://www.googleapis.com/auth/calendar.app.created`                  |
| Redirect URI         | `https://<host>/api/v1/calendar/callback`                               |

There is no refresh token to mint: each instructor authorises with their own
account. Google sign-in automatically starts Calendar consent for instructors
without a working connection, when the integration is available. Connected
instructors skip this step; students and password sign-ins do not start it.
Google still requires Calendar permission. Cancelling leaves ERPSYS sign-in
intact; retry from **Department → Schedule → Connect Google Calendar**.

## Steps

1. In the Google Cloud project that owns the sign-in client, enable the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
2. In Google Auth Platform → Data Access, add the scope above. It only lets
   ERPSYS create and manage its own calendar; it cannot read the rest of an
   instructor's calendar. Confirm in Google's scope list whether it counts as
   sensitive for your verification status.
3. Add the callback URI above to the client's authorised redirect URIs (and the
   production origin once you have one). Calendar builds this URL from
   `PUBLIC_SITE_URL`, falling back to `BETTER_AUTH_URL`. For local development,
   set both to `http://localhost:5173`, register
   `http://localhost:5173/api/v1/calendar/callback`, and keep the separate
   `http://localhost:5173/api/auth/callback/google` sign-in callback. Restart the
   server after changing environment URLs. Use the actual deployed origin in
   production; do not leave a placeholder host in `PUBLIC_SITE_URL`.
4. Generate a key, for example `openssl rand -base64 32`, and set
   `CALENDAR_TOKEN_KEY` in `.env` or under **Admin → Integrations → Google
   Calendar → Credentials**. Restart the server.
5. Enable **Google Calendar** in Admin → Integrations.

## Local development and deployment URLs

The repository-root `.env` is loaded independently of the backend's working
directory. Existing process environment variables still take precedence, so
deployment settings from `/etc/erpsys.env` are preserved. With neither URL set,
development defaults to `http://localhost:5173`; production startup rejects a
local public URL.

Use `PUBLIC_SITE_URL=http://localhost:5173` and
`BETTER_AUTH_URL=http://localhost:5173` locally. Run only one API backend on port
3001: an older `node dist/index.js` process keeps its original URLs and can block
`pnpm dev`. Stop that process before starting the development backend. Editing
`.env` requires a backend restart; refreshing the browser is not enough.

When deploying the single-origin app, set both URLs to the real HTTPS origin
in the deployment environment, restart the backend, and register both
`https://<host>/api/v1/calendar/callback` and
`https://<host>/api/auth/callback/google` on the OAuth client used by ERPSYS.
Keep the localhost entries too if the same client serves local development.
Start a fresh connection attempt after changing URLs; old consent links retain
the callback URL they were created with.

## Testing mode and verification

`@buksu.edu.ph` is probably not a Workspace domain the team administers, so
assume the OAuth app is **External**. While it is in **Testing**:

- only listed test users can connect (add each instructor), and
- refresh tokens expire after 7 days, so instructors land on the
  **Reconnect Google Calendar** banner weekly.

Move the app to Production and complete Google's verification for the scope
before a wide rollout.

## How it behaves

- Saving a schedule writes ERPSYS first, then Google. If Google fails the save
  still succeeds, the connection is marked pending, and a one-minute sweep
  retries with exponential backoff (up to one hour) for 8 attempts, then shows
  **Google sync failed**. **Sync now** resets the count.
- A revoked or expired token marks the connection **Needs reconnect**: syncing
  pauses, the schedule and queue keep working, and reconnecting triggers a full
  resync.
- Events carry only a generic title (`Enrollment advising – <Department>`), no
  attendees, no reminders, and are never shared publicly.
- Weekly windows are recurring events with no end date. When the active academic
  year changes, the sweep deletes the old year's windows and their events.
- Admin remapping an instructor away from a department, deleting a department,
  or deleting/disabling the account removes the affected windows and events.
- Signing out clears an instructor's department link but **not** their posted
  hours.
- Disconnecting deletes the mirrored calendar, revokes the token at Google and
  drops the stored copy. The ERPSYS schedule stays.

## Turning it off

Switching **Google Calendar** off in Admin → Integrations stops connecting and
syncing. Schedules stay editable and visible to students; existing Google
events are left as they are.

## Troubleshooting

| Symptom                                           | Likely cause                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| No Connect button in the schedule dialog          | Integration off, or `CALENDAR_TOKEN_KEY`/client credentials missing.   |
| `Calendar permission was not granted`             | The instructor unticked the Calendar permission on the consent screen. |
| Everyone shows **Needs reconnect** after a deploy | `CALENDAR_TOKEN_KEY` changed.                                          |
| Weekly **Needs reconnect** in Testing mode        | Tokens expire after 7 days for unverified External apps.               |
