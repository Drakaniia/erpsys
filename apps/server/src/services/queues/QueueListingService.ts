import {
  PRE_ENROLLMENT_STEP_CODES,
  departmentAcceptsLevel,
  deriveDepartmentCode,
  normalizeYearLevels,
  stepLabel,
  type YearLevel,
} from "../../config/constants.js";
import { liveAvailabilityPairs, openByDepartment } from "../../config/queue.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import type { QueueEntryRow } from "../../models/EnrollmentQueueModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

const ENTRY_CAP = 200;

type ListedEntry = {
  yearLevel: YearLevel | null;
  locked: boolean;
  entryId: string;
  studentId: string;
  name: string;
  studentNumber: string | null;
  joinedAt: string;
  status: string;
  verifiedSteps: number;
  missingStepCodes: string[];
  missingStepNames: string[];
  servedById: string | null;
  servedByName: string | null;
  servedAt: string | null;
};

export class QueueListingService {
  static async myQueues(adviserId: string) {
    const year = await AcademicYearModel.findActive();
    if (!year) {
      return {
        hasActiveYear: false as const,
        yearLabel: null,
        label: null,
        semesterLabel: null,
        departments: [],
      };
    }
    const yearId = String(year._id);
    const links = await AdviserDepartmentModel.listForAdviser(adviserId);
    const departments = await DepartmentModel.findByIds(
      links.map((link) => link.departmentId),
    );
    const byName = [...departments].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const myLevelsByDept = new Map(
      links.map((link) => [
        link.departmentId,
        normalizeYearLevels(link.yearLevels ?? []),
      ]),
    );
    const deptIds = byName.map((dept) => String(dept._id));
    const header = {
      hasActiveYear: true as const,
      yearLabel: `${year.label} · ${year.semesterLabel}`,
      label: year.label,
      semesterLabel: year.semesterLabel,
    };
    if (deptIds.length === 0) return { ...header, departments: [] };

    const [openRows, myRows, waiting, serving] = await Promise.all([
      AdviserAvailabilityModel.listOpenByDepartments(deptIds, yearId),
      AdviserAvailabilityModel.listMineByDepartments(
        adviserId,
        deptIds,
        yearId,
      ),
      // Cap per department so one long line can't hide another's head.
      Promise.all(
        deptIds.map((id) =>
          EnrollmentQueueModel.listByStatus([id], yearId, "WAITING", ENTRY_CAP),
        ),
      ).then((rows) => rows.flat()),
      EnrollmentQueueModel.listByStatus(deptIds, yearId, "IN_PROGRESS"),
    ]);
    const waitingCounts = await Promise.all(
      byName.map((dept) =>
        EnrollmentQueueModel.countInLine({
          departmentId: String(dept._id),
          academicYearId: yearId,
          status: { $in: ["WAITING", "IN_PROGRESS"] },
        }),
      ),
    );

    const entries = [...waiting, ...serving].sort(
      (a, b) =>
        new Date(a.joinedAt ?? 0).getTime() -
          new Date(b.joinedAt ?? 0).getTime() ||
        String(a._id).localeCompare(String(b._id)),
    );
    const profileIds = [
      ...new Set(entries.map((entry) => String(entry.studentProfileId))),
    ];
    const [profiles, verifications, enrollments, stepRows] = await Promise.all([
      StudentProfileModel.findByIds(profileIds),
      StepVerificationModel.listByProfiles(profileIds, yearId),
      StudentEnrollmentModel.listByProfiles(profileIds, yearId),
      StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]),
    ]);

    const codeByStepId = new Map(stepRows.map((s) => [String(s._id), s.code]));
    const verifiedByProfile = new Map<string, Set<string>>();
    for (const row of verifications) {
      if (row.status !== "VERIFIED") continue;
      const code = codeByStepId.get(String(row.stepId));
      if (!code) continue;
      const set =
        verifiedByProfile.get(String(row.studentProfileId)) ?? new Set();
      set.add(code);
      verifiedByProfile.set(String(row.studentProfileId), set);
    }
    const yearLevelByProfile = new Map(
      enrollments.map((row) => [
        String(row.studentProfileId),
        row.yearLevel ?? null,
      ]),
    );
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const adviserIds = [
      ...new Set([
        adviserId,
        ...openRows.map((row) => String(row.adviserId)),
        ...myRows.map((row) => String(row.adviserId)),
        ...entries
          .filter((entry) => entry.servedById)
          .map((entry) => String(entry.servedById)),
      ]),
    ];
    const [students, advisers] = await Promise.all([
      UserModel.findByIds(profiles.map((p) => String(p.userId))),
      UserModel.findByIds(adviserIds),
    ]);
    const studentNameById = new Map(
      students.map((u) => [String(u._id), u.name]),
    );
    const adviserNameById = new Map(
      advisers.map((u) => [String(u._id), u.name]),
    );

    const servingRows = serving.map((entry) => ({
      departmentId: String(entry.departmentId),
      servedById: entry.servedById ? String(entry.servedById) : null,
    }));
    const openByDept = openByDepartment({
      availabilities: openRows.map((row) => ({
        adviserId: String(row.adviserId),
        departmentId: String(row.departmentId),
        isOpen: row.isOpen,
        lastActiveAt: row.lastActiveAt ?? null,
      })),
      serving: servingRows,
    });
    const liveMine = liveAvailabilityPairs({
      availabilities: myRows.map((row) => ({
        adviserId: String(row.adviserId),
        departmentId: String(row.departmentId),
        isOpen: row.isOpen,
        lastActiveAt: row.lastActiveAt ?? null,
      })),
      serving: servingRows,
    });
    const autoClosedByDept = new Map(
      myRows
        .filter((row) => row.autoClosedAt)
        .map((row) => [
          String(row.departmentId),
          new Date(row.autoClosedAt!).toISOString(),
        ]),
    );

    return {
      ...header,
      departments: byName.map((dept, index) => {
        const deptId = String(dept._id);
        const openAdviserId = openByDept.get(deptId);
        const myLevels = myLevelsByDept.get(deptId) ?? [];
        const deptEntries: ListedEntry[] = entries
          .filter((entry) => String(entry.departmentId) === deptId)
          .map((entry: QueueEntryRow) => {
            const profileId = String(entry.studentProfileId);
            const profile = profileById.get(profileId);
            const verified =
              verifiedByProfile.get(profileId) ?? new Set<string>();
            const missingCodes = [...PRE_ENROLLMENT_STEP_CODES].filter(
              (code) => !verified.has(code),
            );
            const yearLevel = yearLevelByProfile.get(profileId) ?? null;
            return {
              yearLevel,
              locked:
                yearLevel === null ||
                !departmentAcceptsLevel(myLevels, yearLevel),
              entryId: String(entry._id),
              studentId: profile ? String(profile.userId) : "",
              name: profile
                ? (studentNameById.get(String(profile.userId)) ?? "")
                : "",
              studentNumber: profile?.studentNumber ?? null,
              joinedAt: new Date(entry.joinedAt ?? 0).toISOString(),
              status: String(entry.status),
              verifiedSteps: verified.size,
              missingStepCodes: missingCodes,
              missingStepNames: missingCodes.map(stepLabel),
              servedById: entry.servedById ? String(entry.servedById) : null,
              servedByName: entry.servedById
                ? (adviserNameById.get(String(entry.servedById)) ?? null)
                : null,
              servedAt: entry.servedAt
                ? new Date(entry.servedAt).toISOString()
                : null,
            };
          });
        return {
          id: deptId,
          name: dept.name,
          code: deriveDepartmentCode(dept.name),
          yearLevels: normalizeYearLevels(dept.yearLevels ?? []),
          myYearLevels: myLevels,
          isOpen: Boolean(openAdviserId),
          openBy:
            openAdviserId && openAdviserId !== adviserId
              ? {
                  id: openAdviserId,
                  name: adviserNameById.get(openAdviserId) ?? "Instructor",
                }
              : null,
          myOpen: liveMine.has(`${adviserId}:${deptId}`),
          autoClosedAt: autoClosedByDept.get(deptId) ?? null,
          waitingCount: waitingCounts[index] ?? 0,
          entries: deptEntries,
          servingEntry:
            deptEntries.find((entry) => entry.status === "IN_PROGRESS") ?? null,
        };
      }),
    };
  }
}
