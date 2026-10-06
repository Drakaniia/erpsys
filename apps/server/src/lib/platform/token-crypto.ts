import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "./env.js";

function key(): Buffer {
  const secret = env.CALENDAR_TOKEN_KEY;
  if (!secret) throw new Error("CALENDAR_TOKEN_KEY is not set");
  return createHash("sha256").update(secret).digest();
}

export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function openToken(sealed: string): string {
  const [iv, tag, body] = sealed
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString(
    "utf8",
  );
}
