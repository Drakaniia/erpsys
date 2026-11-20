import ReplyNotice from "./ReplyNotice";
import StampDisplay from "./StampDisplay";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { absoluteTime } from "$lib/officer/format";
import type { StepRow } from "$lib/student/types";

export default function ProfilingSheet({
  step,
}: {
  step: StepRow;
  notify?: (message: string, kind?: "success" | "error") => void;
}) {
  const { flags } = useIntegrations();
  const response:
    | {
        status: "NOT_SUBMITTED" | "INCOMPLETE" | "COMPLETE" | "UNAVAILABLE";
        submittedAt: string | null;
        answers: { label: string; value: string }[];
        missingRequired: string[];
      }
    | null
    | undefined = step.profilingResponse;

  return (
    <div className="flex flex-col gap-4">
      {step.reply ? <ReplyNotice reply={step.reply} /> : null}

      {step.status === "VERIFIED" ? (
        step.stamp ? (
          <StampDisplay
            stampName={step.stamp.stampName ?? step.stamp.verifiedByName}
            stampGraphicUrl={step.stamp.stampGraphicUrl}
            stampSignatureUrl={step.stamp.stampSignatureUrl}
            verifiedAt={step.stamp.verifiedAt}
            verifiedByName={step.stamp.verifiedByName}
          />
        ) : (
          <p
            role="status"
            className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-[15px] font-semibold text-ink"
          >
            Verified — you&apos;re done with this step.
          </p>
        )
      ) : !flags.googleForms ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p role="status" className="text-sm text-ink">
            Profiling is temporarily unavailable — check back later or{" "}
            <span className="font-semibold">see the SBO office</span>.
          </p>
        </div>
      ) : step.profilingFormUrl ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <p role="status" aria-atomic="true" className="text-sm text-ink">
            {response?.status === "NOT_SUBMITTED"
              ? "Not submitted — no Google Form response has been found yet."
              : response?.status === "INCOMPLETE"
                ? "Incomplete — your response is missing required answers. Complete them in Google Forms before this step can be submitted for review."
                : response?.status === "COMPLETE"
                  ? step.status === "RETURNED"
                    ? "Response submitted — changes are needed before officer review. See the officer's feedback above and update your Google Form response."
                    : "Submitted — awaiting officer review."
                  : "Submission status is temporarily unavailable — check back later or see the SBO office. This does not mean your response is missing."}
          </p>
          {response?.status === "INCOMPLETE" &&
          response.missingRequired.length > 0 ? (
            <div className="text-sm text-ink">
              <p className="font-semibold">Missing required answers:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {response.missingRequired.map((label, index) => (
                  <li key={index}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-ink">
            Answer the profiling form in Google Forms, signed in with your
            school Google account. Your submission status and response update
            automatically here.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={step.profilingFormUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Open the form
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p role="status" className="text-sm text-ink">
            The profiling form isn&apos;t set up yet —{" "}
            <span className="font-semibold">see the SBO office</span>.
          </p>
        </div>
      )}

      {step.status === "VERIFIED" && response?.status === "UNAVAILABLE" ? (
        <p
          role="status"
          className="rounded-2xl border border-border bg-surface p-4 text-sm text-ink"
        >
          Response status is temporarily unavailable. Your verification is
          unchanged, but the response preview may be out of date.
        </p>
      ) : null}

      {response ? (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Your response
          </summary>
          {response.submittedAt ? (
            <p className="mt-3 text-xs text-muted">
              Submitted{" "}
              <time dateTime={response.submittedAt}>
                {absoluteTime(response.submittedAt)}
              </time>
            </p>
          ) : null}
          {response.answers.length > 0 ? (
            <dl className="mt-3 space-y-3 text-sm text-ink">
              {response.answers.map((answer, index) => (
                <div key={index}>
                  <dt className="font-semibold">{answer.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">
                    {answer.value || "No answer"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No answers to preview yet.
            </p>
          )}
        </details>
      ) : null}
    </div>
  );
}
