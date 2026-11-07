# Google Calendar setup

Instructors can publish office-hour windows per department. Students see them
on the queue card. Optionally an instructor connects their own Google account and
ERPSYS mirrors the windows to a dedicated **ERPSYS Office Hours** calendar there.
The mirror is one-way: ERPSYS is the source of truth and edits made in Google are
overwritten on the next sync.

The schedule is informational only. The **Accepting students** switch and the
one-hour idle auto-close still decide whether a queue is open.

## What you need

| Item | Where |
| --- | --- |
| Sign-in OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (shared with Google sign-in) |
| Token encryption key | `CALENDAR_TOKEN_KEY`, 32+ random characters |
| Calendar API enabled | Google Cloud API Library, same project as the client |
| Scope | `https://www.googleapis.com/auth/calendar.app.created` |
| Redirect URI | `https://<host>/api/v1/calendar/callback` |

There is no refresh token to mint: every instructor authorises with their own
account from **Department → Schedule → Connect Google Calendar**.

## Steps

1. In the Google Cloud project that owns the sign-in client, enable the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
2. In Google Auth Platform → Data Access, add the scope above. It only lets
   ERPSYS create and manage its own calendar; it cannot read the rest of an
   instructor's calendar. Confirm in Google's scope list whether it counts as
   sensitive for your verification status.
3. Add the callback URI above to the client's authorised redirect URIs (and the
   production origin once you have one).
4. Generate a key, for example `openssl rand -base64 32`, and set
   `CALENDAR_TOKEN_KEY` in `.env` or under **Admin → Integrations → Google
   Calendar → Credentials**. Restart the server.
5. Enable **Google Calendar** in Admin → Integrations.

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

| Symptom | Likely cause |
| --- | --- |
| No Connect button in the schedule dialog | Integration off, or `CALENDAR_TOKEN_KEY`/client credentials missing. |
| `Calendar permission was not granted` | The instructor unticked the Calendar permission on the consent screen. |
| Everyone shows **Needs reconnect** after a deploy | `CALENDAR_TOKEN_KEY` changed. |
| Weekly **Needs reconnect** in Testing mode | Tokens expire after 7 days for unverified External apps. |
