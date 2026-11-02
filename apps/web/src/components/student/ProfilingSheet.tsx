import { useMutation } from "@tanstack/react-query";
import ReplyNotice from "./ReplyNotice";
import StampDisplay from "./StampDisplay";
import SubmittedNotice from "./SubmittedNotice";
import { api, queryClient } from "$lib/api";
import { useIntegrations } from "$lib/integrations/use-integrations";
import type { StepRow } from "$lib/student/types";

export default function ProfilingSheet({
  step,
  notify,
}: {
  step: StepRow;
  notify: (message: string, kind?: "success" | "error") => void;
}) {
  const submitMutation = useMutation(
    api.student.submitEvidence.mutationOptions(),
  );
  const { flags } = useIntegrations();

  async function submit() {
    try {
      await submitMutation.mutateAsync({ stepCode: "PROFILING" });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Submitted — pending officer review.");
    } catch (e) {
      notify(
        (e as { message?: string })?.message ?? "Could not submit — try again.",
        "error",
      );
    }
  }

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
          <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-[15px] font-semibold text-ink">
            Verified — you&apos;re done with this step.
          </p>
        )
      ) : step.status === "SUBMITTED" ? (
        <SubmittedNotice stepCode="PROFILING" evidence={[]} notify={notify} />
      ) : !flags.googleForms ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-ink">
            Profiling is temporarily unavailable — check back later or{" "}
            <span className="font-semibold">see the SBO office</span>.
          </p>
        </div>
      ) : step.profilingFormUrl ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-ink">
            Answer the profiling form in Google Forms, signed in with your
            school Google account. When you&apos;re done, come back and press
            &ldquo;I&apos;ve submitted&rdquo;.
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
            <button
              onClick={submit}
              disabled={submitMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-raised disabled:opacity-50"
            >
              {submitMutation.isPending ? "Checking…" : "I've submitted"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-ink">
            The profiling form isn&apos;t set up yet —{" "}
            <span className="font-semibold">see the SBO office</span>.
          </p>
        </div>
      )}
    </div>
  );
}
