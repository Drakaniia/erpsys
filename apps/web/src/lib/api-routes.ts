// Hand-written — the generated catalogue is gone (backend refactor).
// This file is the source of truth for client paths; the server mounts the
// matching resources in apps/server/src/routes/v1/.
// Leaf keys and ClientRoute shape are unchanged; only paths changed.
export type ClientRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  update?: { method: ClientRoute["method"]; path: string };
  list?: boolean;
};

export const ROUTES = {
  me: {
    // The aggregate launch read — one round trip for the landing surface.
    getLaunch: { method: "GET", path: "/api/v1/me/launch" },
  },
  options: {
    getSignupOptions: { method: "GET", path: "/api/v1/signup-options" },
  },
  notifications: {
    listMine: { method: "GET", path: "/api/v1/me/notifications", list: true },
    markAllRead: { method: "POST", path: "/api/v1/me/notifications/read" },
  },
  admin: {
    getOverview: { method: "GET", path: "/api/v1/me/overview" },
    listUsers: { method: "GET", path: "/api/v1/users", list: true },
    listAuditLogs: { method: "GET", path: "/api/v1/audit-logs", list: true },
    setRole: { method: "PATCH", path: "/api/v1/users/:userId" },
    setRoleBulk: { method: "PATCH", path: "/api/v1/users" },
    deleteAccounts: { method: "DELETE", path: "/api/v1/users" },
    purgeAccount: { method: "DELETE", path: "/api/v1/users/:userId" },
    listDepartments: { method: "GET", path: "/api/v1/departments", list: true },
    createDepartment: { method: "POST", path: "/api/v1/departments" },
    updateDepartment: { method: "PATCH", path: "/api/v1/departments/:id" },
    setDepartmentYearLevels: {
      method: "PUT",
      path: "/api/v1/departments/:id/year-levels",
    },
    setDepartmentActive: { method: "PATCH", path: "/api/v1/departments/:id" },
    listAdvisers: { method: "GET", path: "/api/v1/advisers", list: true },
    setAdviserDepartments: {
      method: "PATCH",
      path: "/api/v1/advisers/:adviserId",
    },
    listAcademicYears: {
      method: "GET",
      path: "/api/v1/academic-years",
      list: true,
    },
    createAcademicYear: { method: "POST", path: "/api/v1/academic-years" },
    updateAcademicYear: { method: "PATCH", path: "/api/v1/academic-years/:id" },
    deleteAcademicYear: {
      method: "DELETE",
      path: "/api/v1/academic-years/:id",
    },
    getActivationPreview: {
      method: "GET",
      path: "/api/v1/academic-years/:id/activation",
    },
    activateAcademicYear: {
      method: "POST",
      path: "/api/v1/academic-years/:id/activation",
    },
    listRequirementItems: {
      method: "GET",
      path: "/api/v1/requirements",
      list: true,
    },
    createRequirementItem: { method: "POST", path: "/api/v1/requirements" },
    updateRequirementItem: {
      method: "PATCH",
      path: "/api/v1/requirements/:id",
    },
    deleteRequirementItem: {
      method: "DELETE",
      path: "/api/v1/requirements/:id",
    },
    reorderRequirementItem: {
      method: "PUT",
      path: "/api/v1/requirements/order",
    },
    resetPassword: {
      method: "POST",
      path: "/api/v1/users/:userId/password-reset",
    },
    searchUsersForPasswordReset: {
      method: "GET",
      path: "/api/v1/users",
      list: true,
    },
    getChatbotKnowledge: { method: "GET", path: "/api/v1/chatbot-knowledge" },
    updateChatbotKnowledge: {
      method: "PUT",
      path: "/api/v1/chatbot-knowledge",
    },
    getProfilingForm: { method: "GET", path: "/api/v1/profiling-form" },
    createProfilingForm: { method: "POST", path: "/api/v1/profiling-form" },
    deleteProfilingForm: { method: "DELETE", path: "/api/v1/profiling-form" },
    getUserDirectoryReport: {
      method: "GET",
      path: "/api/v1/reports/user-directory",
    },
    searchStudents: { method: "GET", path: "/api/v1/students", list: true },
    getStudentRecord: { method: "GET", path: "/api/v1/students/:id/record" },
    getIntegrations: {
      method: "GET",
      path: "/api/v1/integrations",
      list: true,
    },
    setIntegration: { method: "PATCH", path: "/api/v1/integrations/:key" },
    saveIntegrationCredentials: {
      method: "PUT",
      path: "/api/v1/integrations/:key/credentials",
    },
    resetIntegrationCredentials: {
      method: "DELETE",
      path: "/api/v1/integrations/:key/credentials",
    },
    exportIntegrationCredentials: {
      method: "GET",
      path: "/api/v1/integrations/credentials/export",
    },
  },
  student: {
    getMySteps: { method: "GET", path: "/api/v1/me/student" },
    applyAssessment: { method: "POST", path: "/api/v1/me/assessment" },
    uploadEvidence: { method: "POST", path: "/api/v1/evidence" },
    submitEvidence: {
      method: "POST",
      path: "/api/v1/me/steps/:code/submission",
    },
    cancelEvidenceSubmission: {
      method: "DELETE",
      path: "/api/v1/me/steps/:code/submission",
    },
    deleteEvidence: { method: "DELETE", path: "/api/v1/evidence/:id" },
    upsertExternalLink: { method: "PUT", path: "/api/v1/me/evidence-link" },
    removeExternalLink: { method: "DELETE", path: "/api/v1/me/evidence-link" },
    joinQueue: { method: "POST", path: "/api/v1/me/queue" },
    getMyQueueStatus: { method: "GET", path: "/api/v1/me/queue" },
    leaveQueue: { method: "DELETE", path: "/api/v1/me/queue" },
    getMyDepartmentQueue: { method: "GET", path: "/api/v1/me/departments" },
    profileStatus: { method: "GET", path: "/api/v1/me/student/profile" },
    resolveQueueShareLink: {
      method: "GET",
      path: "/api/v1/queue-shares/:token",
    },
    getMyRecord: { method: "GET", path: "/api/v1/me/record" },
    saveStudentNumber: { method: "PATCH", path: "/api/v1/me/student" },
    saveEnrollment: { method: "POST", path: "/api/v1/me/enrollments" },
    getMyEnrollments: {
      method: "GET",
      path: "/api/v1/me/enrollments",
      list: true,
    },
  },
  instructor: {
    setAvailability: { method: "PUT", path: "/api/v1/me/availability" },
    heartbeat: { method: "POST", path: "/api/v1/me/availability/heartbeat" },
    getMySchedule: { method: "GET", path: "/api/v1/me/schedule" },
    saveMySchedule: { method: "PUT", path: "/api/v1/me/schedule" },
    getMyCalendar: { method: "GET", path: "/api/v1/me/calendar" },
    connectCalendar: { method: "GET", path: "/api/v1/me/calendar/connect" },
    syncCalendar: { method: "POST", path: "/api/v1/me/calendar/sync" },
    disconnectCalendar: { method: "DELETE", path: "/api/v1/me/calendar" },
    listDepartments: { method: "GET", path: "/api/v1/departments", list: true },
    createDepartment: { method: "POST", path: "/api/v1/departments" },
    updateDepartment: { method: "PATCH", path: "/api/v1/departments/:id" },
    setDepartmentYearLevels: {
      method: "PUT",
      path: "/api/v1/departments/:id/year-levels",
    },
    deleteDepartment: { method: "DELETE", path: "/api/v1/departments/:id" },
    transferDepartment: {
      method: "POST",
      path: "/api/v1/departments/:id/takeover",
    },
    setMyDepartments: { method: "PUT", path: "/api/v1/me/departments" },
    requestDepartmentTransfer: { method: "POST", path: "/api/v1/transfers" },
    listMyTransferRequests: { method: "GET", path: "/api/v1/transfers" },
    respondDepartmentTransfer: {
      method: "PATCH",
      path: "/api/v1/transfers/:id",
    },
    cancelDepartmentTransfer: {
      method: "DELETE",
      path: "/api/v1/transfers/:id",
    },
    getMyQueues: { method: "GET", path: "/api/v1/queues" },
    getEnrolledByDept: {
      method: "GET",
      path: "/api/v1/departments/:id/enrollments",
      list: true,
    },
    removeFromQueue: {
      method: "POST",
      path: "/api/v1/queue-entries/:id/removal",
    },
    undoRemoveFromQueue: {
      method: "POST",
      path: "/api/v1/queue-entries/:id/restoration",
    },
    mintQueueShareLink: { method: "POST", path: "/api/v1/queue-shares" },
    beginServing: { method: "POST", path: "/api/v1/queues/serving" },
    endServing: { method: "DELETE", path: "/api/v1/queues/serving" },
    moveToEnd: { method: "POST", path: "/api/v1/queues/serving/position" },
    completeEnrollment: {
      method: "POST",
      path: "/api/v1/enrollments/:id/completion",
    },
    revertEnrollment: {
      method: "DELETE",
      path: "/api/v1/enrollments/:id/completion",
    },
    bulkRevertEnrollments: {
      method: "DELETE",
      path: "/api/v1/enrollments/completions",
    },
    listStudents: { method: "GET", path: "/api/v1/students", list: true },
    getStudentStats: { method: "GET", path: "/api/v1/reports/roster-stats" },
    getRosterBoard: { method: "GET", path: "/api/v1/students/board" },
    getStudentDetail: { method: "GET", path: "/api/v1/students/:id" },
    remindStudents: { method: "POST", path: "/api/v1/students/reminders" },
    getRosterReport: { method: "GET", path: "/api/v1/reports/roster" },
    searchStudents: { method: "GET", path: "/api/v1/students", list: true },
    getStudentRecord: { method: "GET", path: "/api/v1/students/:id/record" },
  },
  officer: {
    getOverview: { method: "GET", path: "/api/v1/me/overview" },
    getBell: { method: "GET", path: "/api/v1/submissions", list: true },
    listByStep: { method: "GET", path: "/api/v1/submissions", list: true },
    getStepDetail: {
      method: "GET",
      path: "/api/v1/submissions/:verificationId",
    },
    verifyStep: {
      method: "POST",
      path: "/api/v1/submissions/:id/verification",
    },
    replyStep: { method: "POST", path: "/api/v1/submissions/:id/replies" },
    revokeStamp: {
      method: "DELETE",
      path: "/api/v1/submissions/:id/verification",
    },
    captureMugshot: { method: "PUT", path: "/api/v1/students/:id/mugshot" },
    getProfilingForm: { method: "GET", path: "/api/v1/profiling-form" },
    createProfilingForm: { method: "POST", path: "/api/v1/profiling-form" },
    deleteProfilingForm: { method: "DELETE", path: "/api/v1/profiling-form" },
    getStamp: { method: "GET", path: "/api/v1/me/stamp" },
    updateStamp: { method: "PATCH", path: "/api/v1/me/stamp" },
    listSocialMediaLinks: {
      method: "GET",
      path: "/api/v1/social-links",
      list: true,
    },
    upsertSocialMediaLink: {
      method: "POST",
      path: "/api/v1/social-links",
      update: { method: "PATCH", path: "/api/v1/social-links/:id" },
    },
    deleteSocialMediaLink: {
      method: "DELETE",
      path: "/api/v1/social-links/:id",
    },
    reorderSocialMediaLinks: {
      method: "PUT",
      path: "/api/v1/social-links/order",
    },
    getStepRegisterReport: {
      method: "GET",
      path: "/api/v1/reports/step-register",
    },
    searchStudents: { method: "GET", path: "/api/v1/students", list: true },
    getStudentRecord: { method: "GET", path: "/api/v1/students/:id/record" },
  },
  storage: {
    mintSession: { method: "POST", path: "/api/v1/storage/session" },
    completeUpload: { method: "POST", path: "/api/v1/storage/complete" },
    sessionStatus: { method: "GET", path: "/api/v1/storage/session-status" },
    getContent: { method: "GET", path: "/api/v1/uploads/:id/content" },
    getThumb: { method: "GET", path: "/api/v1/uploads/:id/content?thumb=1" },
  },
} as const;
