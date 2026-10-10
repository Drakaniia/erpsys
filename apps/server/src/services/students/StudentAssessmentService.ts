import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileService } from "./StudentProfileService.js";

export class StudentAssessmentService {
  static async apply(user: {
    id: string;
  }): Promise<{ status: "APPLIED" | "VERIFIED" }> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const step = await StepModel.findByCode("ASSESSMENT");
    if (!step) {
      throw new ApiError("NOT_FOUND", {
        message: "Assessment step not configured.",
      });
    }

    const key = {
      studentProfileId: profile._id,
      stepId: String(step._id),
      academicYearId: String(year._id),
    };
    const existing = await StepVerificationModel.findByStep(key);

    if (!existing) {
      const now = new Date();
      await StepVerificationModel.insert({
        _id: genId("verification"),
        ...key,
        status: "PENDING",
        appliedAt: now,
        createdAt: now,
      });
      return { status: "APPLIED" };
    }

    if (existing.status === "VERIFIED") return { status: "VERIFIED" };
    if (existing.appliedAt && existing.status !== "RETURNED") {
      return { status: "APPLIED" };
    }

    await StepVerificationModel.updateById(existing._id, {
      status: "PENDING",
      appliedAt: existing.appliedAt ?? new Date(),
    });
    return { status: "APPLIED" };
  }
}
