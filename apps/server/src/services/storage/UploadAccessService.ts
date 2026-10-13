import { ApiError } from "../../config/errors.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";

export class UploadAccessService {
  static async assertCanView(
    upload: { studentProfileId?: unknown },
    user: { id: string; role?: string },
  ): Promise<void> {
    const profileId =
      typeof upload.studentProfileId === "string"
        ? upload.studentProfileId
        : "";
    const callerProfile = await StudentProfileModel.findByUserId(user.id);
    if (callerProfile && String(callerProfile._id) === profileId) return;

    if (user.role === "SBO_OFFICER" || user.role === "ADMIN") return;

    if (user.role === "ENROLLMENT_ADVISER") {
      const year = await AcademicYearModel.findActive();
      if (year) {
        const enrollment = await StudentEnrollmentModel.findByProfileYear(
          profileId,
          String(year._id),
        );
        if (!enrollment) return;
        const link = await AdviserDepartmentModel.findLink(
          user.id,
          enrollment.departmentId,
        );
        if (link) return;
      }
    }

    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
}
