/**
 * The two data-integrity assertions, as direct Mongo queries.
 *
 * These are the real value of the gate. The HTTP side of a load test can only
 * report what the server chose to return; a 409 on `joinQueue` is what the
 * *server* believes. Whether the unique indexes actually held is a fact about
 * the collection, so it is asked of the collection — grouped, not inferred, and
 * printed with the offending ids so a failure is actionable.
 *
 *   - Zero duplicate `(studentProfileId, academicYearId)` in `enrollment_queue`
 *     (the Phase 1 unique index on that pair).
 *   - At most one `IN_PROGRESS` row per department per year (the partial unique
 *     index with `partialFilterExpression: { status: "IN_PROGRESS" }`).
 */

const VIOLATION_LIMIT = 25;

async function duplicateEntries(db, match) {
  return db
    .collection("enrollment_queue")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            studentProfileId: "$studentProfileId",
            academicYearId: "$academicYearId",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
          statuses: { $push: "$status" },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: VIOLATION_LIMIT },
    ])
    .toArray();
}

async function concurrentServing(db, match) {
  return db
    .collection("enrollment_queue")
    .aggregate([
      { $match: { ...match, status: "IN_PROGRESS" } },
      {
        $group: {
          _id: {
            departmentId: "$departmentId",
            academicYearId: "$academicYearId",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
          students: { $push: "$studentProfileId" },
          advisers: { $push: "$servedById" },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: VIOLATION_LIMIT },
    ])
    .toArray();
}

/**
 * @param scope 'year' checks the whole active academic year — the invariant as
 *   the app states it, and the stronger claim. 'seeded' narrows to the students
 *   this run created, which is the right scope when the database has known
 *   pre-existing violations the Phase 1 audit has not repaired yet.
 */
export async function checkIntegrity(db, { yearId, scope, profileIds }) {
  const match =
    scope === "seeded"
      ? { academicYearId: yearId, studentProfileId: { $in: profileIds } }
      : { academicYearId: yearId };

  const [duplicates, serving, inProgressTotal, totalRows] = await Promise.all([
    duplicateEntries(db, match),
    concurrentServing(db, match),
    db
      .collection("enrollment_queue")
      .countDocuments({ ...match, status: "IN_PROGRESS" }),
    db.collection("enrollment_queue").countDocuments(match),
  ]);

  return {
    scope,
    yearId,
    totalRows,
    inProgressTotal,
    duplicates: duplicates.map((d) => ({
      key: `${d._id.studentProfileId} / ${d._id.academicYearId}`,
      studentProfileId: d._id.studentProfileId,
      academicYearId: d._id.academicYearId,
      count: d.count,
      ids: d.ids,
      statuses: d.statuses,
    })),
    concurrentServing: serving.map((d) => ({
      key: `${d._id.departmentId} / ${d._id.academicYearId}`,
      departmentId: d._id.departmentId,
      academicYearId: d._id.academicYearId,
      count: d.count,
      ids: d.ids,
      students: d.students,
      advisers: d.advisers,
    })),
  };
}
