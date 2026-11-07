# Confirming integration changes

Signing in is unchanged: administrators use their email and password like everyone else. The extra checks apply when an administrator changes the integration settings.

## What is protected

These calls need an active confirmation, or the server answers `403 STEP_UP_REQUIRED`:

- turning an integration on or off,
- saving or resetting its credentials,
- exporting the real keys as an `.env` block.

The admin console catches that answer, opens a confirmation dialog and retries the change once the administrator passes it.

## The four steps

1. **PIN** — the shared 6-digit `SU_PIN` (8 tries per administrator per 15 minutes, 60 overall).
2. **Password** — the administrator's own account password.
3. **Emailed code** — a 6-digit code sent to the administrator's own address (10 minutes, single use, 5 tries, one send per minute). The email links to `/login/copy-code#<code>`, which has a Copy button, because email clients strip JavaScript.
4. **Authenticator** — a code from Google Authenticator or Microsoft Authenticator. The first time, the dialog shows a QR code and 10 backup codes; after that it asks for the app code, or a backup code. Five wrong codes restart the chain from the PIN.

Passing all four unlocks integration changes for **5 minutes**. After that the next change asks again.

## Configure

- `SU_PIN` — exactly 6 digits. Nobody can change integrations while it is empty. Production refuses to boot if it is not 6 digits or is still `123456`.
- The email integration (`BREVO_API_KEY`, `MAIL_FROM`) must be on, or in production no code can be sent and integrations cannot be changed from the console. Turn the email integration on first while it is still possible, or edit `.env` directly.

## Lost phone or no code

Backup codes work in the authenticator step. When they are gone too, reset the account from a shell with database access:

```bash
pnpm --filter @erpsys/server admin:reset-2fa admin@buksu.edu.ph
```

It removes the authenticator and any pending confirmation for that user. The next integration change sets up a new authenticator.

## Rotating the PIN

Change `SU_PIN` and restart. A confirmation already in progress is not affected.
