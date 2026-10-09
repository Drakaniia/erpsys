import { NOTIFICATION_PAGE_SIZE } from "../../config/constants.js";
import { landingSurfaceForRole, type SurfaceId } from "../../config/roles.js";
import type { SessionUser } from "../auth/AuthService.js";
import { DepartmentListingService } from "../departments/DepartmentListingService.js";
import { IntegrationSettingService } from "../integrations/IntegrationSettingService.js";
import { QueueListingService } from "../queues/QueueListingService.js";
import { QueueStatusService } from "../queues/QueueStatusService.js";
import { TransferService } from "../transfers/TransferService.js";
import { ProfilingFormService } from "../content/ProfilingFormService.js";
import { SocialLinkService } from "../content/SocialLinkService.js";
import { StudentProfileService } from "../students/StudentProfileService.js";
import { StudentStepService } from "../students/StudentStepService.js";
import {
  SubmissionListService,
  submissionListQuery,
} from "../submissions/SubmissionListService.js";
import { NotificationService } from "./NotificationService.js";
import { OverviewService } from "./OverviewService.js";

export const LAUNCH_SCHEMA_VERSION = 1;

const SOCIAL_LINK_PAGE_SIZE = 50;

const page = <T>(data: T[], pageSize: number, total = data.length) => ({
  data,
  page: 1,
  pageSize,
  total,
});

async function studentLaunch(user: SessionUser) {
  const [getMySteps, getMyQueueStatus, notifications, profileStatus, flags] =
    await Promise.all([
      StudentStepService.load(user),
      QueueStatusService.load(user.id),
      NotificationService.listMine(user.id),
      StudentProfileService.status(user.id),
      IntegrationSettingService.publicFlags(),
    ]);
  return {
    getMySteps,
    getMyQueueStatus,
    notifications: page(notifications, NOTIFICATION_PAGE_SIZE),
    profileStatus,
    integrations: { data: flags },
  };
}

const BELL_INPUT = submissionListQuery.parse({
  status: "PENDING",
  dir: "desc",
  pageSize: 20,
});

async function officerLaunch(role: string | undefined) {
  const [getOverview, getBell, getProfilingForm, links] = await Promise.all([
    OverviewService.load(role),
    SubmissionListService.page(BELL_INPUT),
    ProfilingFormService.read(),
    SocialLinkService.list(),
  ]);
  return {
    getOverview,
    getBell,
    getProfilingForm,
    listSocialMediaLinks: page(links, SOCIAL_LINK_PAGE_SIZE),
  };
}

async function instructorLaunch(user: SessionUser) {
  await TransferService.resolveExpired();
  const isAdmin = user.role === "ADMIN";
  const [getMyQueues, departments, listMyTransferRequests, notifications] =
    await Promise.all([
      QueueListingService.myQueues(user.id),
      DepartmentListingService.listing(user.id, isAdmin),
      TransferService.list(user.id),
      NotificationService.listMine(user.id),
    ]);
  return {
    getMyQueues,
    listDepartments: page(
      departments.slice(0, SOCIAL_LINK_PAGE_SIZE),
      SOCIAL_LINK_PAGE_SIZE,
      departments.length,
    ),
    listMyTransferRequests,
    notifications: page(notifications, NOTIFICATION_PAGE_SIZE),
  };
}

async function adminLaunch(role: string | undefined) {
  const [getOverview, getProfilingForm] = await Promise.all([
    OverviewService.load(role),
    ProfilingFormService.read(),
  ]);
  return { getOverview, getProfilingForm };
}

export class LaunchService {
  static async load(user: SessionUser) {
    const surface: SurfaceId = landingSurfaceForRole(user.role);
    return {
      surface,
      generatedAt: new Date().toISOString(),
      schemaVersion: LAUNCH_SCHEMA_VERSION,
      data: await LaunchService.payload(surface, user),
    };
  }

  private static async payload(surface: SurfaceId, user: SessionUser) {
    switch (surface) {
      case "student":
        return studentLaunch(user);
      case "officer":
        return officerLaunch(user.role);
      case "instructor":
        return instructorLaunch(user);
      case "admin":
        return adminLaunch(user.role);
    }
  }
}
