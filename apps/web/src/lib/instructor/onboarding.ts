import type { OnboardingTip } from "$lib/ui/onboarding";

export const INSTRUCTOR_TIPS = [
  {
    id: "departments",
    title: "Switch department queues",
    body: "Each department tab opens its queue. The badge shows how many students are waiting.",
    context:
      "Look for your assigned department tabs at the top of the console.",
  },
  {
    id: "serve",
    title: "Serve the next eligible student",
    body: "Serve starts working with the next eligible student in your queue. It does not enroll them.",
    context: "Open a queue with a student you’re eligible to serve.",
  },
  {
    id: "enrollment",
    title: "Review before enrolling",
    body: "Check the student's identity, department, term, and all five verified steps before confirming enrollment.",
    context: "While serving a student, open the enrollment confirmation.",
  },
  {
    id: "accepting",
    title: "Open or close your queue",
    body: "Accepting students lets new students join. Closing the queue keeps students already waiting in line.",
    context: "Open one of your department queues.",
  },
  {
    id: "enrolled-tab",
    title: "Find enrolled students",
    body: "Open Enrolled to see completed enrollments for this department.",
    context: "Look beside Queue in your department view.",
  },
  {
    id: "enrolled-search",
    title: "Search enrollments",
    body: "Search by name or student number, or choose a date range to narrow the list.",
    context: "Open the Enrolled tab in your department.",
  },
  {
    id: "reports",
    title: "Export enrollment reports",
    body: "Choose a report and filters to generate a PDF for your departments.",
    context: "Open Reports when an academic year is active.",
  },
] as const satisfies readonly OnboardingTip[];
