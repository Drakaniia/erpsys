import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { Db } from "mongodb";
import { z } from "zod";
import { STUDENT_NUMBER_PATTERN, YEAR_LEVELS } from "../constants.js";
import {
  SignUpService,
  type SignUpAdapter,
  type SignUpInput,
} from "../../services/auth/SignUpService.js";

const bodySchema = z
  .object({
    name: z.string().min(1),
    studentNumber: z
      .string()
      .trim()
      .min(1, "Student number is required")
      .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed"),
    email: z.email(),
    password: z.string().min(8).max(128),
    academicYearId: z.string().min(1, "Choose an academic year"),
    departmentId: z.string().min(1, "Choose your course"),
    yearLevel: z.enum(YEAR_LEVELS, "Choose your year level"),
    "cf-turnstile-response": z.string().min(1).max(2048).optional(),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .passthrough();

export function createStudentSignUpPlugin(db: Db) {
  void db;

  return {
    id: "student-signup",
    pathMethods: { "/sign-up/student": "POST" } as const,
    endpoints: {
      signUpStudent: createAuthEndpoint(
        "/sign-up/student",
        { method: "POST", body: bodySchema, cloneRequest: true },
        async (ctx) => {
          const body = ctx.body as SignUpInput & { password: string };
          const result = await SignUpService.register({
            input: body,
            adapter: ctx.context.internalAdapter as unknown as SignUpAdapter,
            hashPassword: (password) => ctx.context.password.hash(password),
            password: body.password,
          });
          await setSessionCookie(
            ctx,
            { session: result.session, user: result.user } as never,
            false,
          );
          return ctx.json({ token: result.session.token, user: result.user });
        },
      ),
    },
  };
}
