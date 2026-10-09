import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RequestHandler } from "express";
import { isApiPath } from "./notFound.js";

const DEFAULT_INDEX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../web/dist/index.html",
);

let indexPath = DEFAULT_INDEX_PATH;
let cachedIndex: string | null = null;

export function setSpaIndexPathForTest(nextPath: string | null): void {
  indexPath = nextPath ?? DEFAULT_INDEX_PATH;
  cachedIndex = null;
}

export function resetSpaCacheForTest(): void {
  cachedIndex = null;
}

export const spaFallback: RequestHandler = (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  if (isApiPath(req.path)) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-cache");

  if (cachedIndex !== null) {
    res.type("html").send(cachedIndex);
    return;
  }

  readFile(indexPath, "utf8")
    .then((html) => {
      cachedIndex = html;
      res.type("html").send(html);
    })
    .catch((error: NodeJS.ErrnoException) => {
      if (error?.code === "ENOENT") {
        res
          .status(503)
          .type("text/plain")
          .send(
            `[spa] no built web app at ${indexPath} — run \`pnpm --filter web build\` (or \`pnpm build\`) and reload.`,
          );
        return;
      }
      next(error);
    });
};
