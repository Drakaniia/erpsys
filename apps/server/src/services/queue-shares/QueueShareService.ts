import { ApiError } from "../../config/errors.js";
import { deriveDepartmentCode } from "../../config/constants.js";
import {
  buildQueueShareToken,
  buildQueueShareUrl,
  verifyShareToken,
} from "../../config/queue-share.js";
import { availabilityKey, liveAvailabilityPairs } from "../../config/queue.js";
import { env, isLocalOrigin } from "../../lib/platform/env.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";

export type ShareCreated = {
  url: string;
  token: string;
  departmentId: string;
  departmentName: string;
  inviterName: string;
  academicYearId: string;
};

export type ShareView = {
  status: "OK" | "STALE" | "INVALID";
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  inviterName: string | null;
  isOpen: boolean;
  openByName: string | null;
  waitingCount: number;
  academicYearId: string | null;
};

const INVALID: ShareView = {
  status: "INVALID",
  departmentId: null,
  departmentName: null,
  departmentCode: null,
  inviterName: null,
  isOpen: false,
  openByName: null,
  waitingCount: 0,
  academicYearId: null,
};

export class QueueShareService {
  static async create(
    adviser: { id: string; name?: string },
    departmentId: string,
  ): Promise<ShareCreated> {
    const link = await AdviserDepartmentModel.findLink(
      adviser.id,
      departmentId,
    );
    if (!link) {
      throw new ApiError("FORBIDDEN", {
        message: "Department not assigned to you.",
      });
    }

    const year = await AcademicYearService.activeOrThrow();
    const department = await DepartmentModel.findById(departmentId);
    if (!department || !department.isActive) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }

    const origin = env.PUBLIC_SITE_URL;
    if (!origin) {
      throw new ApiError("PRECONDITION_FAILED", {
        message:
          "The public site URL is not configured — share links cannot be built. Set PUBLIC_SITE_URL on the server.",
      });
    }
    if (isLocalOrigin(origin) && env.NODE_ENV === "production") {
      throw new ApiError("PRECONDITION_FAILED", {
        message: `The public site URL is still "${origin}". Set it to the deployed host before sharing queue links.`,
      });
    }

    const token = buildQueueShareToken({
      departmentId: String(department._id),
      adviserId: adviser.id,
      academicYearId: String(year._id),
      secret: env.QUEUE_SHARE_SECRET,
    });
    return {
      url: buildQueueShareUrl({ token, origin }),
      token,
      departmentId: String(department._id),
      departmentName: department.name,
      inviterName: adviser.name ?? "Your adviser",
      academicYearId: String(year._id),
    };
  }

  static async view(token: string): Promise<ShareView> {
    const verified = verifyShareToken(token, env.QUEUE_SHARE_SECRET);
    if (!verified.ok) return INVALID;
    const { d: departmentId, a: adviserId, y: yearId } = verified.payload;

    const year = await AcademicYearService.findActive();
    if (!year || String(year._id) !== yearId) {
      return { ...INVALID, status: "STALE" };
    }
    const activeYearId = String(year._id);

    const department = await DepartmentModel.findById(departmentId);
    if (!department || !department.isActive) return INVALID;

    const [availabilities, serving, waitingCount, inviter] = await Promise.all([
      AdviserAvailabilityModel.listOpenByYear(activeYearId),
      EnrollmentQueueModel.listInProgressByYear(activeYearId),
      EnrollmentQueueModel.countInLine({
        academicYearId: activeYearId,
        departmentId,
        status: { $in: ["WAITING", "IN_PROGRESS"] },
      }),
      UserModel.findById(adviserId),
    ]);

    const departmentAdviserIds = [
      ...new Set(
        availabilities
          .filter((a) => a.departmentId === departmentId)
          .map((a) => a.adviserId),
      ),
    ];
    const advisers = await UserModel.findByIds(departmentAdviserIds);
    const nameById = new Map(
      advisers.map((u) => [String(u._id), u.name ?? "Adviser"] as const),
    );

    const livePairs = liveAvailabilityPairs({ availabilities, serving });
    let openByName: string | null = null;
    for (const a of availabilities) {
      if (a.departmentId !== departmentId) continue;
      if (!livePairs.has(availabilityKey(a.adviserId, a.departmentId)))
        continue;
      openByName = nameById.get(a.adviserId) ?? "Adviser";
      break;
    }

    return {
      status: "OK",
      departmentId,
      departmentName: department.name,
      departmentCode: deriveDepartmentCode(department.name),
      inviterName: inviter?.name ?? "Adviser",
      isOpen: openByName !== null,
      openByName,
      waitingCount,
      academicYearId: activeYearId,
    };
  }
}
