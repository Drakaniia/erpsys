import { ROUTES } from "$lib/api-routes";

export const PDF_MIME = "application/pdf";

export function isPdfMime(mime: string | null | undefined): boolean {
  return mime === PDF_MIME;
}

export function isPdfName(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().endsWith(".pdf");
}

/** Rows whose bytes load via GET /uploads/:id/content (never a direct link). */
export function isProxyRow(item: {
  fileKey?: string | null;
  fileUrl?: string | null;
}): boolean {
  return !!item.fileKey?.startsWith("r2:");
}

export function isPdfItem(item: {
  fileKey?: string | null;
  fileUrl?: string | null;
  mime?: string | null;
  name?: string | null;
}): boolean {
  if (isPdfMime(item.mime)) return true;
  if (isProxyRow(item)) return isPdfName(item.name) || isPdfName(item.fileKey);
  return (
    isPdfMime(item.fileUrl?.split(";")[0].split("?")[0] as string) ||
    isPdfName(item.fileUrl)
  );
}

export function apiBase(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
  ).replace(/\/+$/, "");
}

export function contentUrl(uploadId: string, thumb = false): string {
  const route = thumb ? ROUTES.storage.getThumb : ROUTES.storage.getContent;
  return `${apiBase()}${route.path.replace(":id", encodeURIComponent(uploadId))}`;
}

export function parse409Fallback(body: unknown): string | null {
  if (body && typeof body === "object" && "fallbackUrl" in body) {
    const url = (body as { fallbackUrl: unknown }).fallbackUrl;
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  return null;
}
