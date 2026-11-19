import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function previewEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const origin = new URL(source.BETTER_AUTH_URL?.trim() || "http://localhost:5173");
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    origin.username || origin.password || origin.pathname !== "/" ||
    origin.search || origin.hash
  ) {
    throw new Error("Preview requires BETTER_AUTH_URL to be a local HTTP origin, such as http://localhost:5173.");
  }
  const publicUrl = source.PUBLIC_SITE_URL?.trim();
  if (publicUrl && new URL(publicUrl).origin !== origin.origin) {
    throw new Error("Preview requires PUBLIC_SITE_URL to match BETTER_AUTH_URL so integration callbacks stay on the preview origin.");
  }
  return {
    ...source,
    NODE_ENV: "development",
    SERVE_WEB: "true",
    PORT: origin.port || "80",
    BETTER_AUTH_URL: origin.origin,
    PUBLIC_SITE_URL: origin.origin,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: new URL("../../../../.env", import.meta.url), quiet: true });
  if (!existsSync(new URL("../../../web/dist/index.html", import.meta.url))) {
    throw new Error("No built web app found. Run pnpm build from the repository root before pnpm preview.");
  }
  Object.assign(process.env, previewEnvironment(process.env));
  console.log(`[preview] Built app and API: ${process.env.BETTER_AUTH_URL} (local runtime, no watchers)`);
  await import("../index.js");
}
