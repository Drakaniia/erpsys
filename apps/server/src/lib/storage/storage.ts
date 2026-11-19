const STORAGE_ROUTE_SLUGS = [
  "evidenceImage",
  "mugshotCapture",
  "stampImage",
] as const;
export type StorageRoute = (typeof STORAGE_ROUTE_SLUGS)[number];


export const R2_KEY_PREFIX = "r2:";

export function buildR2FileKey(bucket: string, key: string): string {
  return `${R2_KEY_PREFIX}${bucket}:${key}`;
}

export function isR2FileKey(fileKey: string | null | undefined): boolean {
  return typeof fileKey === "string" && fileKey.startsWith(R2_KEY_PREFIX);
}

export function parseR2FileKey(
  fileKey: string | null | undefined,
): { bucket: string; key: string } | null {
  if (!isR2FileKey(fileKey)) return null;
  const rest = (fileKey as string).slice(R2_KEY_PREFIX.length);
  const at = rest.indexOf(":");
  if (at <= 0 || at === rest.length - 1) return null;
  return { bucket: rest.slice(0, at), key: rest.slice(at + 1) };
}

export type StorageCategory = "Evidence" | "Mugshot" | "Stamp";

export function storageCategoryForRoute(route: StorageRoute): StorageCategory {
  if (route === "mugshotCapture") return "Mugshot";
  if (route === "stampImage") return "Stamp";
  return "Evidence";
}

export function storageSurfaceForRoute(
  route: StorageRoute,
): "student" | "officer" {
  return route === "evidenceImage" ? "student" : "officer";
}
