/**
 * Wire types the web renders.
 *
 * Copied verbatim from the server's services and views (`StudentRecordView`,
 * `RosterService`, `UserListService`, `SubmissionListService`, `sse`,
 * `integration-settings`, `storage`) when the web stopped importing server
 * code. They describe payloads, not behaviour, so there is nothing to keep in
 * sync beyond a response-shape change.
 */


export type StudentRecordStep = {
  code: string;
  status: "MISSING" | "PENDING" | "SUBMITTED" | "VERIFIED" | "RETURNED";
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  respondedAt: string | null;
  respondedByName: string | null;
  evidenceCount: number;
  replyChips: string[];
  replyNote: string | null;
};

export type StudentRecord = {
  student: {
    name: string;
    email: string;
    studentNumber: string | null;
    isOutsideOrg: boolean;
    createdAt: string;
  };
  year: { id: string; label: string; semesterLabel: string };
  enrollment: {
    departmentName: string;
    departmentCode: string;
    yearLevel: string;
    enrolledAt: string | null;
  } | null;
  enrolledAt: string | null;
  steps: StudentRecordStep[];
  queue: {
    status: string;
    joinedAt: string;
    servedAt: string | null;
    completedAt: string | null;
    servedByName: string | null;
  } | null;
};

export type RosterStepState =
  | "MISSING"
  | "PENDING"
  | "SUBMITTED"
  | "VERIFIED"
  | "RETURNED";

export type RosterBucket =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY_FOR_QUEUE"
  | "ENROLLED";

export type RosterRow = {
  studentProfileId: string;
  studentName: string;
  studentNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  yearLevel: string | null;
  stepsVerified: number;
  stepsTotal: number;
  stepStates: { code: string; status: RosterStepState }[];
  queueStatus: "NONE" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
  enrolled: boolean;
  enrolledAt: string | null;
  pendingReview: number;
  bucket: RosterBucket;
};

export type RosterStats = {
  byCourse: {
    departmentId: string | null;
    departmentName: string | null;
    departmentCode: string | null;
    count: number;
  }[];
  byCourseYearLevel: {
    departmentId: string;
    departmentName: string;
    departmentCode: string;
    counts: Record<string, number>;
    total: number;
  }[];
  distribution: Record<RosterBucket, number>;
  unassignedTotal: number;
  total: number;
};

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  isOutsideOrg: boolean;
  blocked: boolean;
  studentNumber: string | null;
  studentProfileId: string | null;
  department: { id: string; name: string; code: string } | null;
  yearLevel: string | null;
  joinedAt: string;
};

export type StepRegisterRow = {
  student: {
    studentProfileId: string;
    name: string;
    studentNumber: string | null;
  };
  status: "MISSING" | "PENDING" | "SUBMITTED" | "VERIFIED" | "RETURNED";
  submittedAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
  evidenceCount: number;
  hasReply: boolean;
};

export type IntegrationKey =
  | "turnstile"
  | "r2"
  | "googleAuth"
  | "cloudflareChat"
  | "email"
  | "googleForms"
  | "googleCalendar";

export type WindowKind = "WEEKLY" | "EXTRA" | "CANCEL";

export type ScheduleWindow = {
  kind: WindowKind;
  weekday?: number;
  date?: string;
  startMinute?: number;
  endMinute?: number;
};

export type ScheduleSummary = {
  current: { startsAt: string; endsAt: string } | null;
  next: { startsAt: string; endsAt: string } | null;
};

export type SyncState =
  | "NOT_CONNECTED"
  | "SYNCED"
  | "PENDING"
  | "NEEDS_RECONNECT"
  | "FAILED";

export type ScheduleView = {
  departmentId: string;
  windows: ScheduleWindow[];
  sync: SyncState;
};

export type CalendarStatus = {
  available: boolean;
  status: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_RECONNECT";
  sync: SyncState;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type LiveTopic =
  | "transfer-requests"
  | "notifications"
  | "queue"
  | "availability"
  | "reconnect";

export type LiveEvent = {
  topic: LiveTopic;
  at: string;
};

export type StorageRoute = "evidenceImage" | "mugshotCapture" | "stampImage";

export type StorageSessionRequest = {
  route: StorageRoute;
  stepCode?: string;
  /** Officer surface only. Never a client owner email. */
  studentProfileId?: string;
  mime: string;
  size: number;
};

export type StorageSessionResponse = {
  uploadId: string;
  uploadUrl: string;
  sessionExpiresAt: string;
};

export type StorageSessionStatusResponse = {
  status: "pending" | "complete" | "abandoned";
  bytesReceived?: number;
};
