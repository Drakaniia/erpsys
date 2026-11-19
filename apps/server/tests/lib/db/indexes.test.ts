import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ definitions: [] as Array<{ collection: string; indexes: Array<{ name: string; key: Record<string, number>; unique?: boolean; partialFilterExpression?: Record<string, unknown> }> }>, fail: "" }));
vi.mock("../../../src/lib/db/db.js", () => ({
  COLLECTIONS: { academicYear: "academic_year", user: "user", studentEnrollment: "student_enrollment", enrollmentQueue: "enrollment_queue", department: "department", adviserSchedule: "adviser_schedule", content: "content", calendarConnection: "calendar_connection", stepVerification: "step_verification", upload: "upload", notification: "notification", queueTransferRequest: "queue_transfer_request", integration: "integration", auditLog: "audit_log", chatUsage: "chat_usage", storageUsage: "storage_usage", adminStepUp: "admin_step_up", session: "session" },
  getDb: async () => ({ collection: (collection: string) => ({ createIndexes: async (indexes: (typeof state.definitions)[number]["indexes"]) => { state.definitions.push({ collection, indexes }); if (collection === state.fail) throw new Error("index conflict"); } }) }),
}));
import { ensureIndexes } from "../../../src/lib/db/indexes.js";

beforeEach(() => { state.definitions = []; state.fail = ""; });
describe("consolidated collection indexes", () => {
  it("keeps uniqueness scoped to presence, profiles and physical owners", async () => {
    await ensureIndexes();
    const schedule = state.definitions.find(row => row.collection === "adviser_schedule")!;
    expect(schedule.indexes.find(row => row.unique)).toMatchObject({ key: { adviserId: 1, departmentId: 1, academicYearId: 1 }, partialFilterExpression: { kind: "presence" } });
    const user = state.definitions.find(row => row.collection === "user")!;
    expect(user.indexes.filter(row => row.unique).map(row => row.key)).toEqual([{ "studentProfile.studentNumber": 1 }, { "studentProfile._id": 1 }]);
    expect(state.definitions.map(row => row.collection)).not.toEqual(expect.arrayContaining(["student_profile", "adviser_department", "availability_window", "adviser_availability", "step"]));
  });
  it("refuses startup if required profile indexes cannot be installed", async () => {
    state.fail = "user";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { await expect(ensureIndexes()).rejects.toThrow("index conflict"); } finally { log.mockRestore(); }
  });
});
