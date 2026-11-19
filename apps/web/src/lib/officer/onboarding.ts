import type { OnboardingTip } from "$lib/ui/onboarding";

export const OFFICER_TIPS = [
  { id: "step-tabs", title: "Find what needs review", body: "Start in Overview, or open a step from these tabs. Badges show how many submissions are still unverified.", context: "Use the tabs at the top of the Officer Console." },
  { id: "submissions", title: "Find a submission", body: "Search by name or student number, or narrow the list with filters. Open a row or card to review it.", context: "Open a verification step such as Assessment." },
  { id: "review", title: "Review the submission", body: "Check the requirements or evidence in this sheet before deciding. Select an uploaded image to view it at full size.", context: "Open a submission from a step tab." },
  { id: "review-actions", title: "Verify or send back", body: "Stamp as verified if the submission meets the requirements. Use Send back to explain what the student needs to fix.", context: "Look at the bottom of an unverified submission." },
  { id: "notifications", title: "See new submissions", body: "The bell shows submissions waiting for review across steps. Select Review on an item to open it directly.", context: "Look for the bell in the console header." },
  { id: "profiling-form", title: "Edit the profiling form", body: "Manage the questions students answer for the active academic year.", context: "Open the Profiling Form tab." },
  { id: "social-media-links", title: "Manage required social links", body: "Add, edit, or reorder the pages students are asked to follow.", context: "Open the Social Media Links tab." },
  { id: "mugshot", title: "Capture a mugshot", body: "Preview the photo before saving. If the camera is unavailable, review the student's upload instead.", context: "Open an unverified submission in the Mugshot tab." },
] as const satisfies readonly OnboardingTip[];
