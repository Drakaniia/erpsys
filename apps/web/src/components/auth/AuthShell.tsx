import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router";

const ClearanceDeskIllustration = lazy(
  () => import("./ClearanceDeskIllustration"),
);

const ROLES = [
  { role: "Student", job: "Submit requirements and track your clearance" },
  { role: "Instructor", job: "Serve the enrollment queue" },
  { role: "SBO officer", job: "Review and verify submissions" },
] as const;

const ILLUSTRATION_TOKENS = {
  ink: "#0b2340",
  face: "#fdfcf9",
  accent: "#f5a623",
  bg: "#051d37",
};

/**
 * Split auth screen: the navy desk panel explains who signs in here, the white
 * panel holds the form. Below `lg` the form comes first and the panel shrinks
 * to a brand strip.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page-enter flex min-h-dvh flex-col bg-white lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col overflow-hidden bg-auth-navy px-12 py-10 text-white lg:flex xl:px-16">
        <BrandMark />

        <div className="mt-14 max-w-[30rem]">
          <h2 className="text-[clamp(2.1rem,3.2vw,2.9rem)] leading-[1.04] font-extrabold tracking-[-0.035em]">
            Every requirement, cleared at one desk.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">
            COT-SBO Enrollment Requirements Processing System, Bukidnon State
            University.
          </p>
        </div>

        <div className="relative my-auto flex aspect-[240/163] w-full max-w-[520px] self-center py-8">
          <Suspense fallback={null}>
            <ClearanceDeskIllustration
              tokens={ILLUSTRATION_TOKENS}
              title="An enrollment clearance desk: a checklist, an officer's stamp, a queue ticket and ID cards"
              className="w-full"
            />
          </Suspense>
        </div>

        <dl className="grid grid-cols-3 gap-6 border-t border-white/12 pt-6">
          {ROLES.map(({ role, job }) => (
            <div key={role}>
              <dt className="font-mono text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">
                {role}
              </dt>
              <dd className="mt-1.5 text-[13px] leading-snug text-white/70">
                {job}
              </dd>
            </div>
          ))}
        </dl>
      </aside>

      <header className="bg-auth-navy px-6 py-5 lg:hidden">
        <BrandMark />
      </header>

      <main className="flex flex-1 flex-col px-6 py-10 sm:px-10 lg:py-10">
        <div className="auth-enter m-auto w-full max-w-[400px]">{children}</div>
        <Link
          to="/docs"
          className="mx-auto mt-10 text-[13px] text-muted underline decoration-auth-border underline-offset-4 transition-colors hover:text-auth-ink"
        >
          How ERPSYS works
        </Link>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/images/cot-sbo-logo.webp"
        alt="COT-SBO"
        className="h-10 w-10 shrink-0 object-contain select-none"
      />
      <span className="font-mono text-[13px] font-semibold tracking-[0.2em] text-white/85">
        ERPSYS
      </span>
    </div>
  );
}
