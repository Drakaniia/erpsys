import { PASSWORD_REQUIREMENTS, newPasswordSchema } from "./password";

/**
 * Live, client-side companion to `newPasswordSchema`. The schema stays the
 * gatekeeper — this only renders feedback as the user types, so it never
 * weakens what is accepted and the two can never disagree about "acceptable".
 * Invariant: `score: 0` exactly when `acceptable: false` (the schema rejects
 * the value); every acceptable password scores at least 1.
 */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3;
  label: "Too weak" | "Weak" | "Good" | "Strong";
  acceptable: boolean;
  /** Unmet schema rules, in display order; empty once `acceptable`. */
  unmet: string[];
};

type Check = {
  requirement: string;
  passes: (value: string) => boolean;
};

const CHECKS: Check[] = [
  {
    requirement: "At least 12 characters",
    passes: (value) => value.length >= 12,
  },
  {
    requirement: "An uppercase letter (A–Z)",
    passes: (value) => /[A-Z]/.test(value),
  },
  {
    requirement: "A lowercase letter (a–z)",
    passes: (value) => /[a-z]/.test(value),
  },
];

const REPEATED_CHARACTER = /(.)\1{2,}/;
const RUNS =
  /0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|efgh|fghi|ghij|hijk|ijkl|jklm|klmn|lmno|mnop|nopq|opqr|pqrs|qrst|rstu|stuv|tuvw|uvwx|vwxy|wxyz/i;

const WEAK_PASSWORDS = new Set([
  "password",
  "password1",
  "passw0rd",
  "passw0rd1",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "121212",
  "123123",
  "654321",
  "abc123",
  "iloveyou",
  "admin123",
  "welcome1",
  "welcome123",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "letmein",
  "superman",
  "batman",
  "trustno1",
  "football",
  "baseball",
  "starwars",
  "zaq12wsx",
  "1q2w3e4r",
  "1qaz2wsx",
  "asdfgh",
  "zxcvbnm",
  "buksu",
  "buksu123",
  "student",
  "student123",
  "erpsys",
]);

/**
 * Scores a password live as the user types. Returns `acceptable: false` with
 * the unmet rules exactly when `newPasswordSchema` rejects the value;
 * acceptable passwords are scored on length and character variety, with
 * demotions for repeated characters, keyboard/alphabet runs and a small set of
 * well-known weak passwords (which can never score above "Weak").
 */
export function assessPasswordStrength(value: string): PasswordStrength {
  const parsed = newPasswordSchema.safeParse(value);
  if (!parsed.success) {
    const unmet = CHECKS.filter((check) => !check.passes(value)).map(
      (check) => check.requirement,
    );
    return { score: 0, label: "Too weak", acceptable: false, unmet };
  }

  let score: 0 | 1 | 2 | 3 = 1;
  if (value.length >= 14) score = 2;
  if (value.length >= 16 && /[0-9]/.test(value)) score = 3;
  if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) {
    score = Math.min(3, score + 1) as 0 | 1 | 2 | 3;
  }
  if (REPEATED_CHARACTER.test(value) || RUNS.test(value)) {
    score = Math.max(1, score - 1) as 0 | 1 | 2 | 3;
  }
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    score = 1;
  }

  const label =
    score === 0
      ? "Too weak"
      : score === 1
        ? "Weak"
        : score === 2
          ? "Good"
          : "Strong";
  return { score, label, acceptable: true, unmet: [] };
}

/** The shared schema's first error for a value, or `null` when it accepts. */
export function passwordSchemaError(value: string): string | null {
  const parsed = newPasswordSchema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (!issue) return PASSWORD_REQUIREMENTS;
  return typeof issue.message === "string" && issue.message.length > 0
    ? issue.message
    : PASSWORD_REQUIREMENTS;
}
