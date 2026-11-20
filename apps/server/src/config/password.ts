import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REQUIREMENTS =
  "Use 12–128 characters, including at least one uppercase (A–Z) and one lowercase (a–z) letter.";

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS)
  .max(PASSWORD_MAX_LENGTH, PASSWORD_REQUIREMENTS)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS)
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS);
