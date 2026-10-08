import type { Request, Response } from "express";
import type { z } from "zod";
import { ApiError } from "../config/errors.js";
import { currentTransaction } from "../lib/db/timestamp-ordering.js";

function withTs<T extends object>(body: T): T & { ts?: number } {
  const ts = currentTransaction()?.ts;
  return ts === undefined ? body : { ...body, ts };
}

export function parseBody<T extends z.ZodType>(
  schema: T,
  req: Request,
): z.output<T> {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", { message: parsed.error.message });
  }
  return parsed.data;
}

export function parseQuery<T extends z.ZodType>(
  schema: T,
  req: Request,
): z.output<T> {
  const parsed = schema.safeParse({ ...req.params, ...req.query });
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", { message: parsed.error.message });
  }
  return parsed.data;
}

export function parsePagination(
  req: Request,
  max = 200,
): { page: number; pageSize: number } {
  const query = req.query as Record<string, unknown>;
  const positive = (value: unknown, fallback: number): number => {
    const n =
      typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    page: positive(query.page, 1),
    pageSize: Math.min(positive(query.limit ?? query.pageSize, 50), max),
  };
}

export function okList(
  res: Response,
  rows: unknown[],
  page: number,
  pageSize: number,
  total?: number,
): void {
  res.json(
    withTs({ data: rows, page, pageSize, total: total ?? rows.length }),
  );
}

export function okOne(res: Response, data: unknown, status = 200): void {
  res.status(status).json(withTs({ data }));
}
