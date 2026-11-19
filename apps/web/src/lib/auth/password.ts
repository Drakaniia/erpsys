import { z } from "zod";

export const PASSWORD_REQUIREMENTS =
  "Use 12–128 characters, including at least one uppercase (A–Z) and one lowercase (a–z) letter.";

export const newPasswordSchema = z
  .string()
  .min(12, PASSWORD_REQUIREMENTS)
  .max(128, PASSWORD_REQUIREMENTS)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS)
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS);
