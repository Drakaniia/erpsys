import type { OutputOf, RestRouters } from "$lib/api";

export type StudentRouterClient = RestRouters["student"];

type NotificationsRouter = RestRouters["notifications"];

export type MyStepsData = OutputOf<StudentRouterClient["getMySteps"]>;
export type StepRow = MyStepsData["steps"][number];
export type StepCode = StepRow["code"];
export type StepStatus = StepRow["status"];
export type MyDepartmentQueue = NonNullable<
  OutputOf<StudentRouterClient["getMyDepartmentQueue"]>
>;
export type QueueStatusData = OutputOf<StudentRouterClient["getMyQueueStatus"]>;
export type QueueEntry = NonNullable<QueueStatusData>;

export type ResolvedShareLink = OutputOf<
  StudentRouterClient["resolveQueueShareLink"]
>;

export type NotificationItem = OutputOf<
  NotificationsRouter["listMine"]
>[number];
