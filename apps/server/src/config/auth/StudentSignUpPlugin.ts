import { APIError, createAuthEndpoint, signUpEmail } from "better-auth/api";
import { z } from "zod";
import {
  STUDENT_NUMBER_IN_USE_MESSAGE,
  STUDENT_NUMBER_PATTERN,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  type YearLevel,
} from "../constants.js";
import { ApiError } from "../errors.js";
import { newPasswordSchema } from "../password.js";
import { getDbSync } from "../../lib/db/db.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";

import { UserModel } from "../../models/UserModel.js";

const bodySchema = z
  .object({
    name: z.string().min(1),
    studentNumber: z
      .string()
      .trim()
      .min(1, "Student number is required")
      .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed"),
    email: z.email(),
    password: newPasswordSchema,
    academicYearId: z.string().min(1, "Choose an academic year"),
    departmentId: z.string().min(1, "Choose your course"),
    yearLevel: z.enum(YEAR_LEVELS, "Choose your year level"),
    "cf-turnstile-response": z.string().min(1).max(2048).optional(),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .passthrough();

function isDuplicateKeyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === 11000) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function place(input: {
  userId: string;
  studentNumber: string;
  academicYearId: string;
  departmentId: string;
  yearLevel: YearLevel;
}): Promise<void> {
  const rollback = async (
    message: string,
    code = "BAD_REQUEST",
  ): Promise<never> => {
    await purgeUserById(getDbSync(), input.userId);
    throw new ApiError(code, { message });
  };

  const year = await AcademicYearModel.findById(input.academicYearId);
  if (!year) return rollback("Pick an academic year from the list.");
  const department = await DepartmentModel.findById(input.departmentId);
  if (!department || !department.isActive) {
    return rollback("Pick a course from the list.");
  }
  if (!departmentAcceptsLevel(department.yearLevels ?? [], input.yearLevel)) {
    return rollback(
      `${department.name} doesn't offer ${YEAR_LEVEL_LABELS[input.yearLevel]}.`,
    );
  }

  const profileId = crypto.randomUUID();
  try {
    await UserModel.insertProfile({
      _id: profileId,
      userId: input.userId,
      studentNumber: input.studentNumber,
      academicYearId: year._id,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return rollback(STUDENT_NUMBER_IN_USE_MESSAGE);
    }
    return rollback(
      "Could not save your student number — please try again.",
      "INTERNAL_SERVER_ERROR",
    );
  }
  try {
    await StudentEnrollmentModel.insert({
      _id: crypto.randomUUID(),
      studentProfileId: profileId,
      academicYearId: year._id,
      departmentId: department._id,
      yearLevel: input.yearLevel,
    });
  } catch {
    return rollback("Could not save your enrollment — please try again.");
  }
}

export function createStudentSignUpPlugin() {
  return {
    id: "student-signup",
    pathMethods: { "/sign-up/student": "POST" } as const,
    endpoints: {
      signUpStudent: createAuthEndpoint(
        "/sign-up/student",
        { method: "POST", body: bodySchema, cloneRequest: true },
        async (ctx) => {
          const input = ctx.body;
          const adapter = ctx.context.internalAdapter;
          const email = input.email.toLowerCase();

          if (email.endsWith("@student.buksu.edu.ph")) {
            throw new APIError("BAD_REQUEST", {
              message: "Institutional accounts sign in with Google instead.",
            });
          }

          const existingUser = await adapter.findUserByEmail(email);
          if (existingUser?.user) {
            throw new APIError("BAD_REQUEST", {
              message:
                "An account with this email already exists — sign in instead.",
            });
          }

          const existingProfile = await UserModel.findProfileByStudentNumber(
            input.studentNumber,
          );
          if (existingProfile) {
            throw new APIError("BAD_REQUEST", {
              message: STUDENT_NUMBER_IN_USE_MESSAGE,
            });
          }

          const result = await signUpEmail()({
            ...ctx,
            body: { name: input.name, email, password: input.password },
            asResponse: false,
            returnHeaders: true,
          });
          const user = result.response.user;
          await adapter.updateUser(user.id, { isOutsideOrg: false });
          await place({ ...input, userId: user.id });
          for (const cookie of result.headers.getSetCookie()) {
            ctx.responseHeaders?.append("set-cookie", cookie);
          }
          return ctx.json({
            ...result.response,
            user: { ...user, isOutsideOrg: false },
          });
        },
      ),
    },
  };
}
