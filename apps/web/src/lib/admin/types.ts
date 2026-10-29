import type { OutputOf, RestRouters } from "$lib/api";

/**
 * Admin view types. The payloads are untyped until the new server contract
 * lands; the aliases below keep their names so call sites do not churn.
 */

type AdminRouter = RestRouters["admin"];

export type OverviewData = OutputOf<AdminRouter["getOverview"]>;
export type UsersData = OutputOf<AdminRouter["listUsers"]>;
export type UserItem = UsersData["items"][number];
export type DepartmentsData = OutputOf<AdminRouter["listDepartments"]>;
export type DepartmentItem = DepartmentsData["items"][number];
export type AdvisersData = OutputOf<AdminRouter["listAdvisers"]>;
export type AdviserItem = AdvisersData["items"][number];
export type AcademicYearsData = OutputOf<AdminRouter["listAcademicYears"]>;
export type AcademicYearItem = AcademicYearsData["items"][number];
export type ActivationPreview = OutputOf<AdminRouter["getActivationPreview"]>;
export type RequirementItemsData = OutputOf<
  AdminRouter["listRequirementItems"]
>;
export type RequirementItem = RequirementItemsData["items"][number];
export type ChatbotKnowledgeData = OutputOf<AdminRouter["getChatbotKnowledge"]>;
export type ProfilingFormData = OutputOf<AdminRouter["getProfilingForm"]>;

export type RoleFilter =
  | "ALL"
  | "STUDENT"
  | "SBO_OFFICER"
  | "ENROLLMENT_ADVISER"
  | "ADMIN";
export type OutsideFilter = "ALL" | "INSIDE" | "OUTSIDE";
