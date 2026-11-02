import type { ReactNode } from "react";
import type { IntegrationKey } from "$lib/integrations/use-integrations";

export type SetupGuide = {
  enables: string;
  steps: { title: string; body: ReactNode }[];
  verify: string;
};

function ProviderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  );
}

export function setupGuideFor(
  integration: IntegrationKey,
  origin: string = window.location.origin,
): SetupGuide {
  return setupGuides(origin)[integration];
}

function setupGuides(origin: string): Record<IntegrationKey, SetupGuide> {
  return {
    googleAuth: {
      enables: "Google sign-in and account linking. This OAuth client is also used by Google Forms; its refresh token is configured separately.",
      steps: [
        {
          title: "Create or select a Google Cloud project",
          body: <>Open the <ProviderLink href="https://console.cloud.google.com/">Google Cloud console</ProviderLink>. In Google Auth Platform, configure Branding, Audience and Data Access for your school. Choose Internal only if all intended users belong to that Workspace organization; otherwise use External. Add test users while the app is in Testing.</>,
        },
        {
          title: "Create a web OAuth client",
          body: <>Open <ProviderLink href="https://console.cloud.google.com/apis/credentials">APIs &amp; Services → Credentials</ProviderLink>, choose Create credentials → OAuth client ID → Web application. Add this site's public origin as an authorized JavaScript origin and its full callback URL as an authorized redirect URI: <code className="break-all">{origin}/api/auth/callback/google</code>. If the public URL differs from this preview, use the deployed public URL instead.</>,
        },
        {
          title: "Save the client pair",
          body: <>Copy the Client ID and Client secret into Google sign-in → Credentials on this page. Save both together, then restart the server to load them. Keep the secret private. Google Forms tokens must be issued by this same client; changing the client requires a new Forms refresh token.</>,
        },
      ],
      verify: "Enable Google sign-in, then test Continue with Google using an allowed account. Keep an admin email/password sign-in available before changing credentials.",
    },
    googleForms: {
      enables: "Officers and admins can create and publish a profiling form for an academic year, preview it in ERPSYS, and open Google's editor separately. Students answer in Google; ERPSYS imports their latest response by verified email when they press I've submitted.",
      steps: [
        {
          title: "Configure the shared Google OAuth client first",
          body: <>Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET under Google sign-in → Credentials, then restart the server before saving the Forms token. Google Forms validates tokens against the currently loaded client, not pending changes. Its switch is independent of the Google sign-in switch.</>,
        },
        {
          title: "Enable both APIs in that client's project",
          body: <>In the Google Cloud API Library, enable the <ProviderLink href="https://console.cloud.google.com/apis/library/forms.googleapis.com">Google Forms API</ProviderLink> and <ProviderLink href="https://console.cloud.google.com/apis/library/drive.googleapis.com">Google Drive API</ProviderLink>. Forms creates and reads forms and responses; Drive shares edit access with the officer who creates a form.</>,
        },
        {
          title: "Configure consent and permissions",
          body: <>In Google Auth Platform → Data Access (OAuth consent screen), add these scopes:
            <ul className="mt-2 space-y-1 font-mono">
              <li className="break-all">https://www.googleapis.com/auth/forms.body</li>
              <li className="break-all">https://www.googleapis.com/auth/forms.responses.readonly</li>
              <li className="break-all">https://www.googleapis.com/auth/drive.file</li>
            </ul>
            <p className="mt-2">Add the form-owner account as a test user if required. For an External app in Testing, these refresh tokens expire after 7 days. For lasting use, move to Production and complete any Google verification or Workspace approval required, then issue a new token.</p>
          </>,
        },
        {
          title: "Authorize with your own OAuth credentials",
          body: <>Add <code className="break-all">https://developers.google.com/oauthplayground</code> to the same web client's authorized redirect URIs. Open <ProviderLink href="https://developers.google.com/oauthplayground">OAuth Playground</ProviderLink>, select the gear → Use your own OAuth credentials, and enter that Client ID and Client secret. Use offline access and consent prompting to obtain a refresh token.</>,
        },
        {
          title: "Generate the form owner's refresh token",
          body: <>In Playground Step 1, enter the three scopes above and authorize with the Google account that should own the forms, not a service account. In Step 2, choose Exchange authorization code for tokens. Copy the Refresh token, not the access token. It only works with the client that issued it. Remove the Playground redirect URI afterward.</>,
        },
        {
          title: "Save, restart and enable",
          body: <>Open Google Forms → Credentials below, choose Replace, paste the token and Save. Saving checks the token exchange with Google, not full API access. Restart the server to load the encrypted stored token, then enable Google Forms. Do not paste tokens into source files, chat or screenshots.</>,
        },
      ],
      verify: "With an active academic year, open Profiling Form and choose Create Google Form. Check Edit in Google Forms works; if not, check Drive API and drive.file permission. Submit as a test student using their registered Google email, then press I've submitted. Turning this integration off blocks creation and response import but does not delete linked Google forms.",
    },
    googleCalendar: {
      enables: "Instructors can optionally connect their own Google Calendar. ERPSYS then mirrors their office-hour schedule to a dedicated ERPSYS Office Hours calendar in their account. Students see the schedule inside ERPSYS either way.",
      steps: [
        {
          title: "Configure the shared Google OAuth client first",
          body: <>Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET under Google sign-in → Credentials. Calendar uses the same client; each instructor authorizes with their own Google account, so no refresh token is stored here.</>,
        },
        {
          title: "Enable the Calendar API and add the scope",
          body: <>In the Google Cloud API Library, enable the <ProviderLink href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">Google Calendar API</ProviderLink>. In Google Auth Platform → Data Access, add this scope:<ul className="mt-2 space-y-1 font-mono"><li className="break-all">https://www.googleapis.com/auth/calendar.app.created</li></ul><p className="mt-2">It only lets ERPSYS create and manage its own calendar. For an External app in Testing, add each instructor as a test user and expect tokens to expire after 7 days; complete Google verification before wide rollout.</p></>,
        },
        {
          title: "Authorize the callback",
          body: <>Add this redirect URI to the same web client: <code className="break-all">{origin}/api/v1/calendar/callback</code>. If the public URL differs from this preview, use the deployed public URL.</>,
        },
        {
          title: "Save the encryption key and enable",
          body: "Enter a random secret of 32+ characters as Token encryption key. It encrypts instructors' refresh tokens at rest; changing it disconnects everyone. Save, restart the server and enable Google Calendar.",
        },
      ],
      verify: "Sign in as an instructor, open a department → Schedule, add a weekly window, choose Connect Google Calendar and approve. Check the ERPSYS Office Hours calendar in Google Calendar shows the window. Turning this integration off stops syncing but keeps schedules visible to students.",
    },
    turnstile: {
      enables: "Cloudflare bot verification on sign-in and student registration.",
      steps: [
        {
          title: "Create a Turnstile widget",
          body: <>Open <ProviderLink href="https://dash.cloudflare.com/?to=/:account/turnstile">Cloudflare Turnstile</ProviderLink>, choose Add widget, name it and add each hostname that serves ERPSYS. Choose Managed mode. Use hostnames without a scheme or path.</>,
        },
        {
          title: "Copy the matching key pair",
          body: "Copy the widget's Secret key and Site key into Credentials below and save both together. Allowed hostnames is an optional comma-separated server-side check; use the same hostnames as the widget.",
        },
        {
          title: "Apply and enable protection",
          body: "Restart the server after saving the secret. The public site key applies without a restart, so coordinate key-pair changes to avoid a mismatch. Enable Bot protection only once the matching pair is loaded.",
        },
      ],
      verify: "Open sign-in and registration and complete the widget. Turning this integration off leaves both forms without the bot challenge.",
    },
    r2: {
      enables: "Evidence photo and document uploads to a private Cloudflare R2 bucket. Existing files remain readable when new uploads are turned off.",
      steps: [
        {
          title: "Create a storage bucket",
          body: <>Open <ProviderLink href="https://dash.cloudflare.com/?to=/:account/r2">Cloudflare R2</ProviderLink>, activate R2 for the account if needed, and create a Standard storage-class bucket. Keep public access disabled; ERPSYS handles access to evidence.</>,
        },
        {
          title: "Create bucket-scoped credentials",
          body: <>Open <ProviderLink href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens">R2 API tokens</ProviderLink> and create a token with Object Read &amp; Write access limited to this bucket. Copy the Access key ID and Secret access key when shown; these are the S3 credentials, not a general Cloudflare API token.</>,
        },
        {
          title: "Save all four storage fields",
          body: <>Enter the Bucket name, Endpoint, Access key ID and Secret access key below. The endpoint must be <code className="break-all">https://&lt;account-id&gt;.r2.cloudflarestorage.com</code>, with no bucket path, query or port. Save, restart the server and enable File uploads.</>,
        },
      ],
      verify: "Upload an allowed evidence file as a test student, then view it through ERPSYS. Saving checks bucket access; a real upload verifies write permissions too.",
    },
    cloudflareChat: {
      enables: "The student AI chat using Cloudflare Workers AI and the knowledge maintained in Chatbot Knowledge.",
      steps: [
        {
          title: "Open Workers AI on the right account",
          body: <>In the <ProviderLink href="https://dash.cloudflare.com/">Cloudflare dashboard</ProviderLink>, choose the account that should run the student chat, open Workers AI and select Use REST API. Accept any terms Cloudflare asks for. Copy the Account ID shown there.</>,
        },
        {
          title: "Create the Workers AI token",
          body: <>On the same page, select Create a Workers AI API Token, review the prefilled permissions and create it. Copy the token straight away. If you build a custom token in <ProviderLink href="https://dash.cloudflare.com/profile/api-tokens">API Tokens</ProviderLink> instead, give it both Workers AI Read and Workers AI Edit, limited to this account.</>,
        },
        {
          title: "Save and enable student chat",
          body: "Enter the Account ID and API token under Credentials. Save, restart the server and enable Student chat. Maintain the school's answers in Chatbot Knowledge; model availability, quotas and billing still depend on the Cloudflare account.",
        },
      ],
      verify: "Ask a school-related question as a test student. Saving checks the account's model-list endpoint; a real conversation verifies inference access and model availability.",
    },
    email: {
      enables: "Transactional email through Brevo for password resets and queue turn alerts.",
      steps: [
        {
          title: "Verify a sender in Brevo",
          body: <>Create or open your Brevo account. In <ProviderLink href="https://app.brevo.com/senders">Senders</ProviderLink>, add and verify the sending address. Authenticate its domain with the DNS records Brevo provides if required, and ensure transactional sending is activated.</>,
        },
        {
          title: "Generate an API key",
          body: <>Open <ProviderLink href="https://app.brevo.com/settings/keys/api">SMTP &amp; API → API Keys</ProviderLink> and generate a v3 API key. Copy the key when shown. Use an API key, not an SMTP password.</>,
        },
        {
          title: "Save the delivery settings",
          body: <>Enter the API key and verified Sender below. Sender accepts a bare email address or <code>Name &lt;email@example.com&gt;</code>. Save, restart the server and enable Email delivery. Protect the key: it permits sending mail from this account.</>,
        },
      ],
      verify: "Request a password reset for a test account and check delivery and spam folders. Saving checks the API key's account access, not sender verification or inbox delivery.",
    },
  };
}

export default function IntegrationSetupGuide({
  integration,
  defaultOpen = false,
}: {
  integration: IntegrationKey;
  defaultOpen?: boolean;
}) {
  const guide = setupGuideFor(integration);
  return (
    <details open={defaultOpen} className="group rounded-lg border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-medium text-ink transition-[background-color] duration-100 ease-out hover:bg-ink/[0.03] [&::-webkit-details-marker]:hidden">
        <span>
          Setup guide
          <span className="ml-2 font-normal text-muted">{guide.steps.length} steps</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="space-y-5 border-t border-border px-4 pb-4 pt-4 text-sm text-muted">
        <ol className="space-y-4">
          {guide.steps.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-medium tabular-nums text-ink">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-6 text-ink">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </p>
                <div className="mt-1 space-y-2 break-words leading-relaxed">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-md bg-surface-raised px-3 py-2.5">
          <p className="font-medium text-ink">Check it works</p>
          <p className="mt-1 leading-relaxed">{guide.verify}</p>
        </div>
        <p className="text-xs leading-relaxed">Values saved here are encrypted and override the deployment env file. Reset to .env removes the stored values. Credential changes apply after a server restart; the switch applies immediately.</p>
      </div>
    </details>
  );
}
