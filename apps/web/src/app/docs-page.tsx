import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

/**
 * Public, signed-out documentation. The page is a plain guide for the people
 * who use ERPSYS, not an API reference: every section explains what a person
 * has to do and what the system does in response.
 */

type DocItem = { id: string; label: string };

const DOC_NAV: ReadonlyArray<{ group: string; items: readonly DocItem[] }> = [
  {
    group: "Getting started",
    items: [
      { id: "overview", label: "What ERPSYS is" },
      { id: "who-its-for", label: "Who it is for" },
      { id: "signing-in", label: "Signing in" },
    ],
  },
  {
    group: "Enrollment",
    items: [
      { id: "steps", label: "The six steps" },
      { id: "statuses", label: "Statuses and stamps" },
      { id: "queue", label: "The enrollment queue" },
      { id: "notifications", label: "Notifications" },
    ],
  },
  {
    group: "For staff",
    items: [
      { id: "officers", label: "SBO officers" },
      { id: "advisers", label: "Enrollment advisers" },
      { id: "admins", label: "Administrators" },
    ],
  },
  {
    group: "Help",
    items: [
      { id: "account-help", label: "Account help" },
      { id: "faq", label: "Frequently asked questions" },
    ],
  },
];

export const DOC_SECTIONS: readonly DocItem[] = DOC_NAV.flatMap(
  (group) => group.items,
);

const DOC_SECTION_IDS = DOC_SECTIONS.map((section) => section.id);

/**
 * Scrollspy for the section nav. The sticky header is 64px tall, so a section
 * becomes current once its top passes just under it. Resolving on scroll (one
 * frame at a time) also keeps the last section current at the bottom of the
 * page, where a short section can never reach the header line.
 */
function useActiveSection(ids: readonly string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? "");

  useEffect(() => {
    let frame = 0;

    function resolve() {
      frame = 0;
      if (window.scrollY <= 0) {
        setActiveId(ids[0] ?? "");
        return;
      }
      const offset = 96;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top > offset) break;
        current = id;
      }
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        current = ids[ids.length - 1] ?? current;
      }
      setActiveId(current);
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(resolve);
    }

    resolve();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  return activeId;
}

const STEP_GUIDE: ReadonlyArray<{
  number: number;
  title: string;
  summary: string;
  todo: string;
}> = [
  {
    number: 1,
    title: "Assessment",
    summary:
      "Checks the requirements and payments the office lists for your assessment. When everything on the list is settled, you apply from inside the step.",
    todo: "Review the requirements and payments, then tap Apply for assessment.",
  },
  {
    number: 2,
    title: "Social Media",
    summary:
      "Proves you follow the official COT-SBO pages. The office keeps the current list of pages in its Social Media Links tab.",
    todo: "Upload one or more screenshots showing you liked or followed the pages.",
  },
  {
    number: 3,
    title: "Profiling",
    summary:
      "Collects your student profile through the office's own form. The form link opens from the step, and the page shows your email so you can copy it.",
    todo: "Fill in and submit the form, then upload a screenshot of the “response recorded” page.",
  },
  {
    number: 4,
    title: "Mugshot",
    summary:
      "Your photo for the enrollment records. You can upload one yourself, or have an SBO officer capture it for you at the office.",
    todo: "Upload a JPEG, PNG or WebP photo up to 4 MB — or ask the officer to take it.",
  },
  {
    number: 5,
    title: "Consent / Medical",
    summary:
      "Your signed parent consent and medical form. A clear scan or a photo of the papers is enough; you do not need to hand in the originals first.",
    todo: "Upload a scan or photo of the signed consent and medical form.",
  },
  {
    number: 6,
    title: "Enrollment",
    summary:
      "The final step, done at the enrollment queue. Once steps 1 to 5 carry a stamp, you can join your department's queue and the adviser completes your enrollment.",
    todo: "Join the queue when steps 1 to 5 are verified, then wait to be served.",
  },
];

const FAQ: ReadonlyArray<{ question: string; answer: ReactNode }> = [
  {
    question: "Why can't I join the queue yet?",
    answer: (
      <>
        The queue opens only when three things are true: an academic year is
        active, your department&apos;s adviser has opened availability, and
        steps 1 to 5 are verified. The queue page tells you which ones are
        missing, and the Enrollment step in your progress list links there.
      </>
    ),
  },
  {
    question: "A step was returned. What do I do?",
    answer: (
      <>
        Open the returned step and read the officer&apos;s note — it says what
        was missing or unclear. Replace or add the file, then submit it again.
        Only that one step reopens; your stamped steps stay stamped.
      </>
    ),
  },
  {
    question: "My queue number changed. Did I lose my place?",
    answer: (
      <>
        No. Your position is simply the number of students ahead of you in that
        department at that moment, so it moves as people join or are served. You
        only lose your place if you leave the queue yourself.
      </>
    ),
  },
  {
    question: "I picked the wrong course or year level.",
    answer: (
      <>
        Update it in your Profile tab. If you have already been enrolled for the
        year, ask your department&apos;s enrollment adviser first — changing the
        course after enrollment has to be fixed on their side.
      </>
    ),
  },
  {
    question: "Why did my steps reset?",
    answer: (
      <>
        Each academic year starts a fresh set of six steps. When the admin
        activates the new year, the checklist resets, but last year&apos;s
        stamps and files remain in your records.
      </>
    ),
  },
  {
    question: "I can't sign in.",
    answer: (
      <>
        Check three things: you are on the right door (student, instructor,
        officer), you are using the same email you registered with, and Google
        sign-in is using your BukSU account. If the account was created with a
        password, use that; the Forgot password link on the sign-in screen
        emails you a reset link.
      </>
    ),
  },
  {
    question: "Can I use ERPSYS on my phone?",
    answer: (
      <>
        Yes. Every console works in a mobile browser — your progress checklist,
        uploads, the queue and notifications included. Screenshots and photos
        can be taken straight from your phone when you upload.
      </>
    ),
  },
  {
    question: "Who can see the files I upload?",
    answer: (
      <>
        Only the office reviewing that step. Evidence is attached to your
        submission and opened by officers in their console; it is not posted
        anywhere public. A stamp shows which officer verified the step, when,
        and under which stamp name.
      </>
    ),
  },
];

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 border-t border-border pt-10"
    >
      <h2
        id={`${id}-title`}
        className="text-[22px] font-semibold tracking-[-0.02em] text-ink"
      >
        {title}
      </h2>
      {lede ? (
        <p className="mt-2 text-[15px] leading-7 text-muted">{lede}</p>
      ) : null}
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted">
        {children}
      </div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted/60">
      {children}
    </ul>
  );
}

function RoleCard({
  role,
  door,
  children,
}: {
  role: string;
  door: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">{role}</p>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {door}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-surface-raised px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">
        {question}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-muted transition-transform duration-150 group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <p className="mt-2 text-sm leading-7 text-muted">{answer}</p>
    </details>
  );
}

function InPageNav({
  activeId,
  className = "",
}: {
  activeId: string;
  className?: string;
}) {
  return (
    <nav aria-label="Documentation sections" className={className}>
      {DOC_NAV.map((group) => (
        <div key={group.group} className="mb-6 last:mb-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {group.group}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={active ? "location" : undefined}
                    className={`relative block rounded-md px-2 py-1.5 text-sm transition-colors duration-100 ${
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted hover:bg-surface hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsPage() {
  const activeId = useActiveSection(DOC_SECTION_IDS);

  useEffect(() => {
    document.title = "Documentation — ERPSYS";
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content =
      "ERPSYS documentation: how students complete the six enrollment steps, join the queue, and how officers, enrollment advisers and administrators run the process.";
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = window.location.origin + "/docs";
  }, []);

  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#overview"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow"
      >
        Skip to documentation
      </a>

      <header className="material sticky top-0 z-40 border-b border-border bg-chrome backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-2.5 md:px-6">
          <Link
            to="/login"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <img
              src="/images/cot-sbo-logo.webp"
              alt=""
              className="h-8 w-8 select-none object-contain"
            />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              ERPSYS
            </span>
            <span className="hidden text-sm text-muted sm:inline">
              Documentation
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted md:inline">
              Enrollment guide for students and staff
            </span>
            <Link
              to="/login"
              className="press rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px] gap-10 px-4 py-8 md:px-6 lg:py-12">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="apple-scrollbar sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-8">
            <InPageNav activeId={activeId} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <details className="mb-8 rounded-xl border border-border bg-surface-raised px-4 py-3 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink [&_summary::-webkit-details-marker]:hidden">
              Browse documentation
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-muted"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="mt-4">
              <InPageNav activeId={activeId} />
            </div>
          </details>

          <article className="mx-auto w-full max-w-[760px] pb-16">
            <header className="border-b border-border pb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                COT-SBO · Bukidnon State University
              </p>
              <h1 className="mt-3 text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
                ERPSYS documentation
              </h1>
              <p className="mt-4 text-[17px] leading-8 text-muted">
                ERPSYS is the online home of the enrollment requirements
                process. This guide explains, in everyday terms, what each step
                asks of you, how the queue works, and what the different offices
                do on their side. No technical knowledge needed.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-full border border-border bg-surface-raised px-3 py-1">
                  6 enrollment steps
                </span>
                <span className="rounded-full border border-border bg-surface-raised px-3 py-1">
                  4 account types
                </span>
                <span className="rounded-full border border-border bg-surface-raised px-3 py-1">
                  1 online queue
                </span>
              </div>
            </header>

            <div className="mt-10 space-y-10">
              <Section
                id="overview"
                title="What ERPSYS is"
                lede="Enrollment Records and Processing System — one place to track your enrollment requirements from start to finish."
              >
                <p>
                  Before ERPSYS, a student printed a requirement sheet, lined up
                  at the SBO office for each signature, and came back again and
                  again to ask whether a step had been checked. ERPSYS puts that
                  same process online: you see the six requirements, upload what
                  the office asks for, and watch each one move from pending to
                  stamped.
                </p>
                <p>In practice, the system lets you:</p>
                <Bullets>
                  <li>
                    follow your progress through the six enrollment steps for
                    the active academic year;
                  </li>
                  <li>
                    upload evidence — screenshots, photos and scans — and submit
                    it for review;
                  </li>
                  <li>
                    join your department&apos;s enrollment queue, see your
                    position, and leave before you are served;
                  </li>
                  <li>
                    receive notifications when a step is verified, returned, or
                    when your queue status changes; and
                  </li>
                  <li>
                    keep a digital stamp for every verified step, showing who
                    checked it and when.
                  </li>
                </Bullets>
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <p className="text-sm font-semibold text-ink">
                    What ERPSYS is not
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    It is not the university&apos;s grading, class scheduling or
                    tuition system. ERPSYS records enrollment requirements and
                    the enrollment queue. Your grades, subjects and fees remain
                    in the university&apos;s own systems.
                  </p>
                </div>
                <p>
                  The system works in a browser on a computer or a phone. Nothing
                  needs to be installed.
                </p>
              </Section>

              <Section
                id="who-its-for"
                title="Who it is for"
                lede="Four account types share ERPSYS. Each one sees only the consoles its role allows."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <RoleCard role="Student" door="Student door">
                    Registers with a student number, completes a profile, tracks
                    the six steps, uploads evidence, and joins the queue.
                  </RoleCard>
                  <RoleCard role="SBO officer" door="Officer door">
                    Reviews submissions for the steps assigned to them, stamps or
                    returns them, maintains the social media links, the profiling
                    form and their stamp, and generates reports.
                  </RoleCard>
                  <RoleCard role="Enrollment adviser" door="Instructor door">
                    Opens department availability, serves students in queue
                    order, completes or reverts enrollment, keeps department
                    details, and reviews the student roster and reports.
                  </RoleCard>
                  <RoleCard role="Administrator" door="Admin door">
                    Manages users and roles, departments, academic years,
                    assessment requirements, adviser mapping, chatbot knowledge,
                    integrations and system-wide reports.
                  </RoleCard>
                </div>
                <p>
                  Your account type is assigned by the office. Students can
                  register themselves; officers are promoted from a student
                  account by an administrator; instructors and administrators
                  are set up by the office. On the sign-in screen, pick the door
                  that matches your account.
                </p>
              </Section>

              <Section
                id="signing-in"
                title="Signing in"
                lede="Use the same institutional account every time. The door you pick must match the account type on your record."
              >
                <Bullets>
                  <li>
                    <span className="font-medium text-ink">Students</span> sign
                    in with their{" "}
                    <span className="font-medium text-ink">
                      @student.buksu.edu.ph
                    </span>{" "}
                    Google account, or with an email and password. On the first
                    visit, choose Register and supply your student number and
                    personal email.
                  </li>
                  <li>
                    <span className="font-medium text-ink">
                      Instructors, officers and administrators
                    </span>{" "}
                    sign in with their{" "}
                    <span className="font-medium text-ink">
                      @buksu.edu.ph
                    </span>{" "}
                    account. There is no self-registration for these roles.
                  </li>
                  <li>
                    If you open the wrong door, ERPSYS sends you back with a
                    notice instead of signing you in silently as someone else.
                  </li>
                </Bullets>
                <p>
                  After your first sign-in, you complete a short profile —
                  course, year level and contact details. Your console opens
                  only after that profile is complete.
                </p>
                <p>
                  Forgot your password? Use the Forgot password link on the
                  sign-in screen and open the reset link sent to your email. If
                  you normally sign in with Google, use the Google button
                  instead.
                </p>
                <p>
                  Already inside? The Connected accounts page under Settings
                  shows which sign-in methods are attached to your account and
                  lets you link another one, so a password account and a Google
                  account can reach the same records.
                </p>
              </Section>

              <Section
                id="steps"
                title="The six steps"
                lede="Every student completes the same six requirements, in the same order, for each academic year. Steps 1 to 5 are checked by SBO officers; step 6 happens at the queue."
              >
                <ol className="space-y-3">
                  {STEP_GUIDE.map((step) => (
                    <li
                      key={step.number}
                      className="rounded-xl border border-border bg-surface-raised p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold tabular-nums text-white">
                          {step.number}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-ink">
                            {step.title}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted">
                            {step.summary}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-ink">
                            <span className="font-medium">What you do: </span>
                            {step.todo}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <p>
                  A step can be edited freely until you submit it. Once it is
                  verified it locks, and the evidence stays with your record. If
                  the office returns a step, only that step reopens.
                </p>
                <p>
                  Activating a new academic year resets the checklist for
                  everyone. Previous stamps and files are kept in your records,
                  so you never have to prove an old year again.
                </p>
              </Section>

              <Section
                id="statuses"
                title="Statuses and stamps"
                lede="Each step shows one status at a time. The label tells you whether the next move is yours or the office's."
              >
                <Bullets>
                  <li>
                    <span className="font-medium text-ink">Pending</span> — you
                    still have something to do. Open the step, attach what it
                    asks for and submit.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Submitted</span> — the
                    office has it. Nothing to do but wait; the review appears in
                    the officer&apos;s console immediately.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Verified</span> — an
                    officer checked it and applied a digital stamp. The stamp
                    shows the officer&apos;s name, stamp name, graphic, signature
                    and the date. The step is now locked.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Returned</span> — the
                    officer sent it back with a note explaining what to fix.
                    Open the step, read the note, replace or add the file and
                    submit again.
                  </li>
                </Bullets>
                <p>
                  The progress counter counts verified steps out of six. When
                  five are stamped, the Enrollment step unlocks and points you
                  to the queue.
                </p>
              </Section>

              <Section
                id="queue"
                title="The enrollment queue"
                lede="One adviser serves each department, in order. The queue is what keeps that fair — and what makes the waiting visible from anywhere."
              >
                <p>
                  <span className="font-medium text-ink">
                    Before you can join:
                  </span>{" "}
                  an academic year must be active, your department&apos;s adviser
                  must have opened availability, and steps 1 to 5 must be
                  verified. The queue page lists anything still missing and links
                  back to your progress.
                </p>
                <p>
                  <span className="font-medium text-ink">Joining:</span> open the
                  Enrollment step in your progress list. You will see your
                  department, its status and your position. Confirm to join.
                  Joining is per student, so only you can take your place.
                </p>
                <p>
                  <span className="font-medium text-ink">While you wait:</span>{" "}
                  your position refreshes on its own, roughly every 20 seconds.
                  There is no need to reload the page — keep it open and your
                  place updates as students ahead of you are served. You are
                  notified when your turn comes.
                </p>
                <p>
                  <span className="font-medium text-ink">Leaving:</span> you can
                  leave at any time before you are served, but you give up your
                  place and will rejoin at the end of the line.
                </p>
                <p>
                  <span className="font-medium text-ink">When you are served:</span>{" "}
                  the adviser marks you in progress. If everything is in order,
                  they complete your enrollment and the final stamp appears; if
                  not, they can end the turn or move you to the end of the queue
                  with a note.
                </p>
                <p>
                  When your enrollment is complete, the queue page shows the
                  confirmation and your enrollment stamp. You are done for the
                  academic year.
                </p>
              </Section>

              <Section
                id="notifications"
                title="Notifications"
                lede="The bell keeps the trail of what happened, so you never have to ask whether a step moved."
              >
                <p>
                  Notifications arrive when a submission is verified or returned,
                  when a review is needed on the staff side, and when your queue
                  status changes. Unread items are counted on the bell; open it
                  to read the details and jump straight to the step or queue it
                  refers to. Mark all as read clears the count without deleting
                  anything.
                </p>
              </Section>

              <Section
                id="officers"
                title="For SBO officers"
                lede="The officer console is where submissions are judged, stamped and returned."
              >
                <p>
                  The tabs follow the process: <span className="font-medium text-ink">Overview</span>{" "}
                  shows what is waiting, then one tab per review step —
                  Assessment, Social Media, Profiling, Mugshot and Consent — and
                  finally Social Media Links, Profiling Form and Reports.
                </p>
                <Bullets>
                  <li>
                    Open a submission to see the student, the evidence and the
                    verification history.
                  </li>
                  <li>
                    Verify with your digital stamp: your stamp name, graphic and
                    signature are applied to the record with the date.
                  </li>
                  <li>
                    Return a submission with reason chips and a note. Revoke a
                    stamp if it was applied by mistake.
                  </li>
                  <li>
                    Maintain the Social Media Links list and the Profiling Form
                    URL students are sent to.
                  </li>
                  <li>
                    Keep your stamp current — upload a new graphic or signature
                    whenever the office changes them.
                  </li>
                  <li>
                    Generate a PDF report for the steps you are assigned to.
                  </li>
                </Bullets>
              </Section>

              <Section
                id="advisers"
                title="For enrollment advisers"
                lede="The instructor console runs the department queue and closes out enrollment."
              >
                <Bullets>
                  <li>
                    <span className="font-medium text-ink">Availability:</span>{" "}
                    open your department when you are ready to serve. While it is
                    open a heartbeat keeps it alive; closing it or signing out
                    closes it for students.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Queues:</span> see
                    waiting counts and who is being served across your mapped
                    departments.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Serving:</span> serve
                    the next student in FIFO order, end the turn, or move the
                    first student to the back of the queue.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Enrollment:</span>{" "}
                    complete a student once every prerequisite is verified, or
                    revert a completed enrollment back to waiting when a
                    correction is needed.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Departments:</span>{" "}
                    create and update department details, assign the adviser, and
                    delete an empty department.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Students and reports:</span>{" "}
                    review the roster across your departments and generate PDF
                    reports for them.
                  </li>
                </Bullets>
              </Section>

              <Section
                id="admins"
                title="For administrators"
                lede="The admin console owns the settings the rest of the process depends on."
              >
                <Bullets>
                  <li>
                    <span className="font-medium text-ink">Overview:</span>{" "}
                    system statistics and the recent administrative activity log.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Users:</span> search
                    and filter accounts, change individual roles, and apply bulk
                    role changes.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Passwords:</span> find
                    a student and generate a new password for them.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Departments:</span>{" "}
                    names, codes, and active or inactive status.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Adviser Mapping:</span>{" "}
                    assign enrollment advisers to departments.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Academic Years:</span>{" "}
                    create, edit, preview and activate a year. Activation resets
                    the student checklist for that year.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Requirements:</span>{" "}
                    the assessment requirements and payments list, in order.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Profiling Form and Chatbot Knowledge:</span>{" "}
                    the form students are sent to, and the guide the Enrollment
                    Assistant answers from.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Integrations:</span>{" "}
                    connection status and credentials for the services the
                    system uses, so a broken connection is visible instead of
                    silent.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Reports:</span>{" "}
                    generate PDF reports for administrative purposes.
                  </li>
                </Bullets>
              </Section>

              <Section
                id="account-help"
                title="Account help"
                lede="The common account situations, and the shortest way out of each."
              >
                <Bullets>
                  <li>
                    <span className="font-medium text-ink">
                      Forgotten password:
                    </span>{" "}
                    use Forgot password on the sign-in screen and follow the
                    emailed reset link.
                  </li>
                  <li>
                    <span className="font-medium text-ink">
                      Wrong door or wrong account:
                    </span>{" "}
                    sign out from the user menu and choose the door that matches
                    your account. ERPSYS never moves a session between account
                    types on its own.
                  </li>
                  <li>
                    <span className="font-medium text-ink">
                      &ldquo;Outside the organization&rdquo; notice:
                    </span>{" "}
                    your email is not on the college list yet. Ask the SBO office
                    to add your institutional address, then sign in again.
                  </li>
                  <li>
                    <span className="font-medium text-ink">
                      Wrong course or year level:
                    </span>{" "}
                    correct it in your Profile tab — unless you are already
                    enrolled, in which case your adviser has to correct it.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Signing out:</span>{" "}
                    use the user menu. For advisers, signing out also closes any
                    open department availability.
                  </li>
                </Bullets>
              </Section>

              <Section
                id="faq"
                title="Frequently asked questions"
                lede="Quick answers to the questions the office hears most."
              >
                <div className="space-y-2">
                  {FAQ.map((item) => (
                    <FaqItem
                      key={item.question}
                      question={item.question}
                      answer={item.answer}
                    />
                  ))}
                </div>
              </Section>

              <section className="scroll-mt-24 border-t border-border pt-10">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  Still stuck?
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface-raised p-4">
                    <p className="text-sm font-semibold text-ink">
                      Ask the Enrollment Assistant
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Signed-in students can open the Chat tab and ask about
                      steps, requirements, queueing or what to bring to the
                      office. It answers from the official process guide.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised p-4">
                    <p className="text-sm font-semibold text-ink">
                      Visit the COT-SBO office
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      For a returned step, a wrong course, or an account that
                      needs promoting, the office can check your record and fix
                      it on the spot. Bring your student ID.
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Ready to start?{" "}
                  <Link
                    to="/login"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Sign in to ERPSYS
                  </Link>{" "}
                  or open the queue from your progress list.
                </p>
              </section>
            </div>

            <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted">
              <p>
                ERPSYS — Enrollment Records and Processing System · COT-SBO
              </p>
              <a
                href="#overview"
                className="font-medium text-primary underline underline-offset-2"
              >
                Back to top
              </a>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
