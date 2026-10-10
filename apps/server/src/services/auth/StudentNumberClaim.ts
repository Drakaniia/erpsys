import { deriveStudentNumberFromEmail } from "../../config/constants.js";

export const NUMBER_IN_USE_MESSAGE = "That student number is already in use.";

const NUMBER_ALREADY_CLAIMED_MESSAGE =
  "This student number is already claimed — contact the SBO office.";

export type ClaimDecision =
  | { kind: "claim" }
  | { kind: "purge-blocked-owner" }
  | { kind: "takeover-institutional" }
  | { kind: "hijack-blocked"; message: string }
  | { kind: "conflict"; message: string };

function isInstitutionalOwnerOf(
  email: string | null | undefined,
  number: string,
): boolean {
  return deriveStudentNumberFromEmail(email) === number;
}

export function decideStudentNumberClaim(input: {
  claimedByUserId: string;
  claimedByEmail: string;
  claimedNumber: string;
  existing: {
    userId: string;
    email?: string | null;
    blockedAt?: Date | null;
  } | null;
}): ClaimDecision {
  const { claimedByUserId, claimedByEmail, claimedNumber, existing } = input;

  if (!existing) return { kind: "claim" };
  if (existing.userId === claimedByUserId) return { kind: "claim" };
  if (existing.blockedAt) return { kind: "purge-blocked-owner" };

  if (!isInstitutionalOwnerOf(claimedByEmail, claimedNumber)) {
    return { kind: "conflict", message: NUMBER_IN_USE_MESSAGE };
  }

  if (!existing.email) {
    return { kind: "conflict", message: NUMBER_IN_USE_MESSAGE };
  }

  if (isInstitutionalOwnerOf(existing.email, claimedNumber)) {
    return { kind: "hijack-blocked", message: NUMBER_ALREADY_CLAIMED_MESSAGE };
  }

  return { kind: "takeover-institutional" };
}
