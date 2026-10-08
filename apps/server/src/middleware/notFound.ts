import type { RequestHandler } from "express";

const apiPrefixes = new Set<string>();

export function registerApiPrefixes(prefixes: Iterable<string>): void {
  for (const prefix of prefixes) apiPrefixes.add(prefix);
}

export function isApiPath(path: string): boolean {
  if (path === "/api" || path.startsWith("/api/")) return true;
  for (const prefix of apiPrefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export const notFoundHandler: RequestHandler = (req, res, next) => {
  if (isApiPath(req.path)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
};
