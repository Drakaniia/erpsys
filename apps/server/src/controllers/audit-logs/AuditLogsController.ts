import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, parsePagination, parseQuery } from "../../middleware/http.js";
import {
  AUDITED_METHODS,
  AuditLogService,
} from "../../services/audit-logs/AuditLogService.js";

const filterQuery = z.object({
  role: z.string().trim().max(40).optional(),
  method: z.enum(AUDITED_METHODS).optional(),
  q: z.string().trim().max(200).optional(),
});

export class AuditLogsController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const filter = parseQuery(filterQuery, req);
    const { page, pageSize } = parsePagination(req);
    const { rows, total } = await AuditLogService.list(filter, {
      page,
      pageSize,
    });
    okList(res, rows, page, pageSize, total);
  });
}

export const auditLogsController = new AuditLogsController();
