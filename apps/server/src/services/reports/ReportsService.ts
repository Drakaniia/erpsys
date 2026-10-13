import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import {
  RosterService,
  type RosterFilter,
  type RosterSort,
} from "../students/RosterService.js";
import { UserDirectoryService } from "../users/UserDirectoryService.js";
import {
  SubmissionListService,
  type SubmissionFilterInput,
} from "../submissions/SubmissionListService.js";
import { REPORT_ROW_CAP, capRows } from "../../config/report.js";

function yearLabel(year: {
  _id: unknown;
  label: string;
  semesterLabel: string;
}) {
  return {
    id: String(year._id),
    label: year.label,
    semesterLabel: year.semesterLabel,
  };
}

export class ReportsService {
  static async roster(
    adviserId: string,
    filter: RosterFilter,
    sort: RosterSort,
    dir: "asc" | "desc",
  ) {
    const loaded = await RosterService.load(filter, adviserId);
    if (!loaded.year) {
      return {
        year: null,
        rows: [],
        stats: RosterService.stats([], loaded.unassignedTotal),
        matchedCount: 0,
        truncated: false,
      };
    }
    const capped = capRows(RosterService.sortRows(loaded.rows, sort, dir));
    return {
      year: yearLabel(loaded.year),
      rows: capped.rows,
      stats: RosterService.stats(capped.rows, loaded.unassignedTotal),
      matchedCount: capped.matchedCount,
      truncated: capped.truncated,
    };
  }

  static async rosterStats(adviserId: string, filter: RosterFilter) {
    const { year, rows, unassignedTotal } = await RosterService.load(
      { ...filter, buckets: undefined },
      adviserId,
    );
    return {
      year: year ? yearLabel(year) : null,
      stats: RosterService.stats(rows, unassignedTotal),
    };
  }

  static async stepRegister(input: SubmissionFilterInput, step: string) {
    return SubmissionListService.register(input, step);
  }

  static async userDirectory(
    input: Parameters<typeof UserDirectoryService.filter>[0] & {
      sort: "joined" | "studentNumber" | "name";
      dir: "asc" | "desc";
    },
  ) {
    const year = await AcademicYearService.resolve(input.academicYearId);
    const filter = await UserDirectoryService.filter(input, year);
    const [matchedCount, rows] = await Promise.all([
      UserDirectoryService.count(filter),
      UserDirectoryService.fetchRows(filter, input.dir, {
        page: 1,
        pageSize: REPORT_ROW_CAP,
      }),
    ]);
    const items = UserDirectoryService.sort(
      await UserDirectoryService.loadItems(rows, year),
      input.sort,
      input.dir,
    );
    return {
      year: year ? yearLabel(year) : null,
      rows: items,
      matchedCount,
      truncated: matchedCount > REPORT_ROW_CAP,
    };
  }
}
