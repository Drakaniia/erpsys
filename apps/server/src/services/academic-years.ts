import { ApiError } from "../config/errors.js";
import {
  AcademicYearModel,
  type AcademicYearRow,
} from "../models/AcademicYearModel.js";

export async function resolveYear(
  requestedId?: string,
): Promise<AcademicYearRow | null> {
  if (requestedId) return AcademicYearModel.findById(requestedId);
  return (await AcademicYearModel.findActive()) ?? AcademicYearModel.newest();
}

export async function activeYearOrThrow(): Promise<AcademicYearRow> {
  const year = await AcademicYearModel.findActive();
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No active academic year — an admin must activate one first.",
    });
  }
  return year;
}
