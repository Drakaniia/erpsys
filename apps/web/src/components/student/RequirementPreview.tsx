import type { StepCode } from "$lib/student/types";

const examples: Record<StepCode, { sample: string; guide: string }> = {
  ASSESSMENT: {
    sample: "Payment receipt · Reference: SAMPLE-001 · Date: 01 October",
    guide: "If you upload proof of payment, use a clear photo or screenshot of your own receipt. Keep the date and reference number readable.",
  },
  SOCIAL_MEDIA: {
    sample: "Official COT-SBO page · Following ✓",
    guide: "Capture the page name and the Following or Liked status in the same screenshot. Use the pages listed in this step.",
  },
  PROFILING: {
    sample: "Google Forms · Your response has been recorded",
    guide: "Submit the form with your school Google account, then select ‘I’ve submitted’ here. ERPSYS checks the Google Forms record; no screenshot is needed.",
  },
  MUGSHOT: {
    sample: "Example: Face centered, front-facing, plain background",
    guide: "Use a clear JPEG, PNG, or WebP photo up to 4 MB, or ask an SBO officer to take your photo.",
  },
  CONSENT: {
    sample: "Annex E: General Parental/Guardian Consent Form · Annex F: Medical Certificate",
    guide: "Upload clear scans or photos of your completed documents, not these samples. Keep the signatures and form text readable.",
  },
  ENROLLMENT: {
    sample: "Example: Steps 1–5 verified · Department queue open",
    guide: "No file is needed for this step. Join your department’s queue when your prior steps are verified and staff are available.",
  },
};

export default function RequirementPreview({ step }: { step: StepCode }) {
  const { sample, guide } = examples[step];
  return (
    <details className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-ink">
        Requirement preview
      </summary>
      <p className="mt-2 text-muted">{guide}</p>
      <p className="mt-2 rounded-lg bg-surface-raised p-3 text-ink">{sample}</p>
      {step === "CONSENT" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <img
            src="/images/consent-form-preview.svg"
            alt="Blank Annex E excerpt showing student name and college, parent or guardian signature and date, and notarial section."
            width="400"
            height="220"
            loading="lazy"
          />
          <img
            src="/images/medical-form-preview.svg"
            alt="Blank Annex F excerpt showing student name and date, medical findings and remarks, and examining physician signature."
            width="400"
            height="220"
            loading="lazy"
          />
        </div>
      )}
    </details>
  );
}
