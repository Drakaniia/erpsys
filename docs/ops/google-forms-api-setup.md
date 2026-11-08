# Google Forms API — enable, connect, and turn on

Runbook for connecting the Profiling Form to the Google Forms API.

## How it works

The Profiling Form is a real Google Form, one per active academic year.

- **Create:** an officer or admin presses **Create Google Form** on the
  Profiling Form tab (`POST /api/v1/profiling-form`). The server
  (`apps/server/src/lib/google/forms.ts`):
  1. creates the form (`forms.create`),
  2. turns on verified-email collection (`forms.batchUpdate` →
     `emailCollectionType: VERIFIED`),
  3. publishes it and opens it for responses (`forms.setPublishSettings`),
  4. shares edit access with the caller's email through the Drive API
     (`drive/v3/files/<id>/permissions`, no notification email). A failure
     here is ignored, so the form is still created if Drive sharing is not
     set up — the caller just can't edit it with their own account.
- **Edit:** questions are edited in Google's own editor. The tab shows a live
  preview of the form (the responder page with `?embedded=true`), a
  **Full screen** button that opens the same preview over the whole app, and
  **Edit in Google Forms**, which opens the editor in a new tab. Google does
  not allow its editor page to load inside another site, so it can't be
  embedded.
- **Answer:** students open the form from their Profiling step, answer it
  signed in with their school Google account, then press **I've submitted**.
  The server reads the form (`forms.get`) and its responses
  (`forms.responses.list`) and attaches the latest response whose verified
  email matches the student's account.

Credentials: one OAuth refresh token (`GOOGLE_FORMS_REFRESH_TOKEN`) for the
Google account that owns the forms, minted against the same OAuth client as
Google sign-in (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Service accounts
are not supported: `forms.create` returns `HTTP 500 INTERNAL` for them.

## 1. Enable the APIs

In the [Google Cloud console](https://console.cloud.google.com/), pick the
project that holds the app's Google sign-in OAuth client, then under
**APIs & Services → Library** enable:

- [Google Forms API](https://console.cloud.google.com/apis/library/forms.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
  — needed to share edit access with the officer who created the form.

## 2. Add the scopes to the consent screen

**APIs & Services → OAuth consent screen → Data access**, add:

- `https://www.googleapis.com/auth/forms.body`
- `https://www.googleapis.com/auth/forms.responses.readonly`
- `https://www.googleapis.com/auth/drive.file`

These are sensitive scopes. While the consent screen is in **Testing**, add
the owner account under **Test users** — and note that refresh tokens issued
in Testing expire after 7 days. For anything lasting, publish the app
(**Audience → Publish app**) and mint the token after publishing.

## 3. Mint the refresh token

1. In **Credentials**, open the sign-in OAuth client and add
   `https://developers.google.com/oauthplayground` to **Authorized redirect
   URIs**.
2. Open the [OAuth Playground](https://developers.google.com/oauthplayground),
   click the gear icon, tick **Use your own OAuth credentials**, and paste the
   client ID and secret.
3. In Step 1, enter the three scopes above and authorize with the Google
   account that should own the forms.
4. In Step 2, click **Exchange authorization code for tokens** and copy the
   **Refresh token**.
5. Remove the Playground redirect URI from the client once you have the token.

The token only works with the client that issued it. Switching the sign-in
client means minting a new token.

## 4. Give the token to the server

Pick one:

- **Admin console (recommended):** **Admin → Integrations → Google Forms →
  Refresh token**. On save the server checks the token against Google
  (a `refresh_token` grant) and rejects it if it's expired, revoked, or minted
  for another client. The value is stored encrypted in MongoDB. Like the other
  stored credentials, it applies after the next server restart, and the row
  flags the pending restart until then.
- **`.env` / `/etc/erpsys.env`:**

  ```ini
  GOOGLE_FORMS_REFRESH_TOKEN=<refresh token>
  ```

  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must already be set. A stored
  value from the admin console takes precedence over `.env`; **Reset** on the
  row falls back to `.env`.

Without a token, **Create Google Form** and **I've submitted** answer `412`
("Google Forms isn't connected").

## 5. The on/off switch

**Admin → Integrations → Google Forms** turns the integration on or off. It is
on by default. When off:

- **Create Google Form** answers `503`, and the Profiling Form tab says the
  integration is turned off.
- **I've submitted** answers `503`, and students see the Profiling step as
  temporarily unavailable. The step stays in their checklist.
- An already linked form stays linked, and its preview still shows to
  officers. Nothing in Google is deleted.

The row counts as configured once the refresh token and the sign-in client ID
and secret are all present.

## 6. Check it works

1. Sign in as an officer or admin with an active academic year, open
   **Profiling Form**, and press **Create Google Form**.
2. The live preview appears. **Edit in Google Forms** opens the editor with
   your account (if it doesn't, Drive sharing failed — check step 1 and the
   `drive.file` scope).
3. Add a question, answer the form as a test student signed in with the
   student's Google account, then press **I've submitted** on that student's
   Profiling step. The response should show for review.

## Notes

- **Quota:** the Forms API has per-minute request limits per project. See
  **APIs & Services → Google Forms API → Quotas**.
- **Embedded preview and sign-in:** the form collects verified emails, so
  Google asks respondents to sign in. Browsers that block third-party cookies
  may ask again inside the embedded preview. Students always open the form on
  Google's own page, so this only affects the officer preview.
- **Secrets:** `.env` stays untracked. If the token leaks, revoke it at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
  for the owner account, mint a new one, and save it again.
