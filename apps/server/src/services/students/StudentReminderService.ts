import { ApiError } from "../../config/errors.js";
import {
  NOTIFICATION_STEPS_REMINDER,
  STEP_CODES,
} from "../../config/constants.js";
import { genId } from "../../lib/db/ids.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";

export class StudentReminderService {
  static async send(
    adviserId: string,
    studentProfileIds: string[],
    academicYearId?: string,
  ): Promise<{ sent: number; skipped: number }> {
    const year = await AcademicYearService.resolve(academicYearId);
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message:
          "No academic year is configured — ask an admin to add one first.",
      });
    }
    const yearId = String(year._id);
    const ids = [...new Set(studentProfileIds)];
    const [links, enrollments, verifications, completed, profiles, steps] =
      await Promise.all([
        AdviserDepartmentModel.listForAdviser(adviserId),
        StudentEnrollmentModel.listByProfiles(ids, yearId),
        StepVerificationModel.listByProfiles(ids, yearId),
        EnrollmentQueueModel.listCompletedProfiles(ids, yearId),
        StudentProfileModel.findByIds(ids),
        StepModel.listCodeMap(),
      ]);

    const myDepartments = new Set(links.map((link) => link.departmentId));
    const departmentByProfile = new Map(
      enrollments.map((row) => [
        String(row.studentProfileId),
        String(row.departmentId ?? ""),
      ]),
    );
    const userIdByProfile = new Map(
      profiles.map((profile) => [String(profile._id), String(profile.userId)]),
    );
    const completedProfiles = new Set(completed);
    const codeById = new Map(
      steps.map((step) => [String(step._id), step.code]),
    );

    const verifiedByProfile = new Map<string, Set<string>>();
    for (const row of verifications) {
      if (row.status !== "VERIFIED") continue;
      const code = codeById.get(String(row.stepId));
      if (!code) continue;
      const profileId = String(row.studentProfileId);
      const set = verifiedByProfile.get(profileId) ?? new Set<string>();
      set.add(code);
      verifiedByProfile.set(profileId, set);
    }

    const now = new Date();
    const rows: Parameters<typeof NotificationModel.insertMany>[0] = [];
    let skipped = 0;
    for (const profileId of ids) {
      const departmentId = departmentByProfile.get(profileId);
      const inScope =
        departmentId === undefined || myDepartments.has(departmentId);
      const verified = verifiedByProfile.get(profileId) ?? new Set<string>();
      const enrolled =
        completedProfiles.has(profileId) || verified.has("ENROLLMENT");
      const userId = userIdByProfile.get(profileId);
      if (!inScope || enrolled || !userId) {
        skipped += 1;
        continue;
      }
      const pending = STEP_CODES.filter((code) => !verified.has(code)).length;
      rows.push({
        _id: genId("notification"),
        userId,
        type: NOTIFICATION_STEPS_REMINDER,
        title: "Pending requirements",
        body: `You still have ${pending} requirement(s) to complete for ${year.label} — open ERPSYS to continue.`,
        createdAt: now,
      });
    }

    await NotificationModel.insertMany(rows);
    for (const row of rows) publishToUser(row.userId, "notifications");
    return { sent: rows.length, skipped };
  }
}
