import type { ErrorRequestHandler } from "express";
import { env } from "../lib/platform/env.js";

const RETRY_AFTER_SECONDS = 5;

const POOL_EXHAUSTED_CODE = 43;

const POOL_EXHAUSTED_NAMES = new Set([
  "MongoPoolClearedError",
  "MongoWaitQueueTimeoutError",
]);

function numericCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function isPoolExhausted(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  if (
    typeof candidate.name === "string" &&
    POOL_EXHAUSTED_NAMES.has(candidate.name)
  ) {
    return true;
  }
  if (numericCode(candidate.code) === POOL_EXHAUSTED_CODE) return true;
  if (typeof candidate.message === "string") {
    const message = candidate.message.toLowerCase();
    if (message.includes("connection pool")) return true;
    if (message.includes("pool is closed")) return true;
  }
  return false;
}

type Described = { status: number; code: string };

function isApiError(error: object): boolean {
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status <= 599
  );
}

function describe(error: unknown): Described {
  if (error && typeof error === "object") {
    if (isPoolExhausted(error)) {
      return { status: 503, code: "POOL_EXHAUSTED" };
    }
    if (isApiError(error)) {
      const candidate = error as { code: string; status: number };
      return { status: candidate.status, code: candidate.code };
    }
    const status = numericCode(
      (error as { status?: unknown; statusCode?: unknown }).status ??
        (error as { statusCode?: unknown }).statusCode,
    );
    if (status && status >= 400 && status <= 599) {
      return { status, code: statusCodeName(status) };
    }
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}

function statusCodeName(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "REQUEST_FAILED";
}

function productionMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad request.";
    case 401:
      return "Unauthorized.";
    case 403:
      return "Forbidden.";
    case 404:
      return "Not found.";
    case 409:
      return "Conflict.";
    case 413:
      return "Payload too large.";
    case 429:
      return "Too many requests.";
    case 503:
      return "The service is busy. Please retry in a moment.";
    default:
      return status >= 500
        ? "Something went wrong on our end."
        : "Request failed.";
  }
}

function requestIdOf(res: Parameters<ErrorRequestHandler>[2]): string {
  const id = (res as { locals?: Record<string, unknown> }).locals?.requestId;
  return typeof id === "string" && id ? id : "-";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const described = describe(error);
  const production = env.NODE_ENV === "production";

  if (described.status !== 401) {
    console.error(
      `[error] rid=${requestIdOf(res)} status=${described.status} code=${described.code} ${describeError(error)}`,
    );
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  if (described.status === 503) {
    res.setHeader("Retry-After", String(RETRY_AFTER_SECONDS));
  }

  const message = production
    ? productionMessage(described.status)
    : ((error as { message?: unknown }).message ?? "Request failed.");

  const errorData = (error as { data?: unknown }).data;
  res.status(described.status).json({
    error: typeof message === "string" ? message : "Request failed.",
    ...(errorData === undefined ? {} : { data: errorData }),
  });
};
