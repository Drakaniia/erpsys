import type { OutputOf, RestRouters } from "$lib/api";

export type InstructorRouterClient = RestRouters["instructor"];

type NotificationsRouter = RestRouters["notifications"];

export type MyQueuesData = OutputOf<InstructorRouterClient["getMyQueues"]>;
export type DepartmentQueue = MyQueuesData["departments"][number];
export type QueueEntry = DepartmentQueue["entries"][number];
export type AvailabilityState = OutputOf<
  InstructorRouterClient["setAvailability"]
>;
export type EnrollmentOutcome = OutputOf<
  InstructorRouterClient["completeEnrollment"]
>;
export type DepartmentManageItem = OutputOf<
  InstructorRouterClient["listDepartments"]
>["items"][number];

export type NotificationItem = OutputOf<
  NotificationsRouter["listMine"]
>[number];

export type TransferRequestsData = OutputOf<
  InstructorRouterClient["listMyTransferRequests"]
>;
export type TransferRequestItem = TransferRequestsData["outgoing"][number];

export type EnrolledByDeptData = OutputOf<
  InstructorRouterClient["getEnrolledByDept"]
>;
export type EnrolledEntry = EnrolledByDeptData["entries"][number];
export type RevertOutcome = OutputOf<
  InstructorRouterClient["revertEnrollment"]
>;

export type StudentsListData = OutputOf<InstructorRouterClient["listStudents"]>;
export type RosterRow = StudentsListData["entries"][number];
export type RosterYear = NonNullable<StudentsListData["year"]>;
export type StudentsStatsData = OutputOf<
  InstructorRouterClient["getStudentStats"]
>;
export type RosterStats = StudentsStatsData["stats"];
export type StudentDetailData = OutputOf<
  InstructorRouterClient["getStudentDetail"]
>;
export type StudentDetailStep = StudentDetailData["steps"][number];
export type ReminderOutcome = OutputOf<
  InstructorRouterClient["remindStudents"]
>;
