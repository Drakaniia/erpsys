import { APIError } from "better-auth/api";
import type { YearLevel } from "../../config/constants.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import { getDbSync } from "../../lib/db/db.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { decideStudentNumberClaim } from "./StudentNumberClaim.js";
import { StudentPlacementService } from "./StudentPlacementService.js";

export type SignUpInput = {
  name: string;
  studentNumber: string;
  email: string;
  academicYearId: string;
  departmentId: string;
  yearLevel: YearLevel;
};

export type SignUpAdapter = {
  findUserByEmail(email: string): Promise<{ user?: { id: string } } | null>;
  createUser(data: Record<string, unknown>): Promise<{ id: string } | null>;
  updateUser(id: string, data: Record<string, unknown>): Promise<unknown>;
  linkAccount(data: Record<string, unknown>): Promise<unknown>;
  createSession(
    userId: string,
    dontRememberMe?: boolean,
  ): Promise<{ token: string } | null>;
  findUserById(id: string): Promise<unknown>;
};

export type SignUpResult = {
  session: { token: string };
  user: unknown;
};

export class SignUpService {
  static async register(params: {
    input: SignUpInput;
    adapter: SignUpAdapter;
    hashPassword: (password: string) => Promise<string>;
    password: string;
  }): Promise<SignUpResult> {
    const { input, adapter } = params;
    const db = getDbSync();
    const normalizedEmail = input.email.toLowerCase();

    if (normalizedEmail.endsWith("@student.buksu.edu.ph")) {
      throw new APIError("BAD_REQUEST", {
        message: "Institutional accounts sign in with Google instead.",
      });
    }

    const existingUser = await adapter.findUserByEmail(normalizedEmail);
    if (existingUser?.user) {
      const blocked = await UserModel.findById(existingUser.user.id);
      if (!blocked?.blockedAt) {
        throw new APIError("BAD_REQUEST", {
          message:
            "An account with this email already exists — sign in instead.",
        });
      }
      await purgeUserById(db, blocked._id);
    }

    const existingProfile = await StudentProfileModel.findByStudentNumber(
      input.studentNumber,
    );
    if (existingProfile) {
      const owner = await UserModel.findById(existingProfile.userId);
      const decision = decideStudentNumberClaim({
        claimedByUserId: "",
        claimedByEmail: normalizedEmail,
        claimedNumber: input.studentNumber,
        existing: owner
          ? {
              userId: existingProfile.userId,
              email: owner.email,
              blockedAt: owner.blockedAt,
            }
          : { userId: existingProfile.userId },
      });
      if (decision.kind === "purge-blocked-owner") {
        if (owner) await purgeUserById(db, String(owner._id));
      } else if (
        decision.kind === "conflict" ||
        decision.kind === "hijack-blocked"
      ) {
        throw new APIError("BAD_REQUEST", { message: decision.message });
      }
    }

    const hash = await params.hashPassword(params.password);
    const createdUser = await adapter.createUser({
      name: input.name,
      email: normalizedEmail,
      emailVerified: false,
      image: null,
      role: "STUDENT",
      isOutsideOrg: false,
    });
    if (!createdUser) {
      throw new APIError("BAD_REQUEST", { message: "Failed to create user." });
    }

    await adapter.updateUser(createdUser.id, { isOutsideOrg: false });
    await adapter.linkAccount({
      userId: createdUser.id,
      providerId: "credential",
      accountId: createdUser.id,
      password: hash,
    });

    await StudentPlacementService.create({
      userId: createdUser.id,
      studentNumber: input.studentNumber,
      academicYearId: input.academicYearId,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel,
    });

    const session = await adapter.createSession(createdUser.id, false);
    if (!session) {
      throw new APIError("BAD_REQUEST", {
        message: "Failed to create session.",
      });
    }
    const user = (await adapter.findUserById(createdUser.id)) ?? createdUser;
    return { session, user };
  }
}
