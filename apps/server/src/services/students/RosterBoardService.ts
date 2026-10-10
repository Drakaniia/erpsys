import { z } from "zod";
import { ReportsService } from "../reports/ReportsService.js";
import { rosterFilter } from "./roster-filter.js";
import { StudentListService } from "./StudentListService.js";

export const rosterBoardQuery = z.object({
  academicYearId: z.string().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  sort: z.string().default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(100).optional(),
  stepState: z.string().optional(),
  enrolled: z.string().optional(),
  unassigned: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RosterBoardInput = z.infer<typeof rosterBoardQuery>;

export class RosterBoardService {
  static async load(
    user: { id: string; role?: string },
    input: RosterBoardInput,
    query: Record<string, unknown>,
  ) {
    const scope = user.role === "ADMIN" ? "all" : input.scope;
    const [roster, stats] = await Promise.all([
      StudentListService.list(
        user,
        {
          q: input.q ?? "",
          page: 1,
          pageSize: input.limit,
          limit: input.limit,
          cursor: input.cursor,
          sort: input.sort,
          dir: input.dir,
          role: "ALL",
          outside: "ALL",
          academicYearId: input.academicYearId,
          scope,
          unassigned: input.unassigned,
          enrolled: input.enrolled,
          stepState: input.stepState,
        },
        { ...query, scope },
      ),
      ReportsService.rosterStats(user.id, rosterFilter({ ...input, scope }, query)),
    ]);
    return {
      roster: {
        data: roster.items,
        page: 1,
        pageSize: input.limit,
        total: roster.total,
      },
      stats,
    };
  }
}
