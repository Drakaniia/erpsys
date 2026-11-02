import type { OutputOf, RestRouters } from "$lib/api";

export type OfficerRouterClient = RestRouters["officer"];

export type OverviewData = OutputOf<OfficerRouterClient["getOverview"]>;
export type ListByStepData = OutputOf<OfficerRouterClient["listByStep"]>;
export type ListItem = ListByStepData["items"][number];
export type StepDetailData = OutputOf<OfficerRouterClient["getStepDetail"]>;
export type BellData = OutputOf<OfficerRouterClient["getBell"]>;
export type ProfilingFormData = OutputOf<
  OfficerRouterClient["getProfilingForm"]
>;
export type SocialMediaLinkData = OutputOf<
  OfficerRouterClient["listSocialMediaLinks"]
>[number];
export type StampData = OutputOf<OfficerRouterClient["getStamp"]>;

export type StepCode = StepDetailData["step"]["code"];
export type StepStatus = StepDetailData["status"];
