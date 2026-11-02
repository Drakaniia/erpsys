const CORE_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "PUBLIC_SITE_URL",
  "WEB_ORIGIN",
  "ADMIN_EMAILS",
  "PORT",
  "NODE_ENV",
] as const;

/**
 * The keys that must exist before any integration can work. Names only: the
 * server never sends their values, and this page cannot change them.
 */
export default function CoreConfigSection() {
  return (
    <details className="rounded-xl border border-border bg-surface-raised px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Core configuration
      </summary>
      <p className="mt-2 text-xs text-muted">
        These come from the deployment env file and are not editable here.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {CORE_KEYS.map((key) => (
          <div key={key} className="flex items-baseline justify-between gap-4">
            <dt className="font-mono text-ink">{key}</dt>
            <dd className="text-muted">Deployment env</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
