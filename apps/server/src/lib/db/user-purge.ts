import type { Db } from "mongodb";
import { COLLECTIONS, idIn, refIn } from "./db.js";

export async function purgeUserById(db: Db, userId: string): Promise<void> {
  const user = await db
    .collection<{ _id: string; email?: string }>(COLLECTIONS.user)
    .findOne(idIn([userId]) as never, {
      projection: { _id: 1, email: 1 },
    });

  const profiles = await db
    .collection<{ _id: string }>(COLLECTIONS.studentProfile)
    .find({ userId: refIn([userId]) } as never, { projection: { _id: 1 } })
    .toArray();
  const profileIds = profiles.map((p) => p._id);

  const profileFilter = { studentProfileId: { $in: profileIds } };
  await db.collection(COLLECTIONS.stepVerification).deleteMany({
    $or: [
      profileFilter,
      { verifiedById: refIn([userId]) },
      { respondedById: refIn([userId]) },
      { revokedById: refIn([userId]) },
    ],
  } as never);
  await db.collection(COLLECTIONS.upload).deleteMany({
    $or: [profileFilter, { uploadedById: refIn([userId]) }],
  } as never);
  await db.collection(COLLECTIONS.enrollmentQueue).deleteMany({
    $or: [
      profileFilter,
      { servedById: refIn([userId]) },
      { movedToEndById: refIn([userId]) },
    ],
  } as never);
  await db
    .collection(COLLECTIONS.adviserDepartment)
    .deleteMany({ adviserId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.adviserAvailability)
    .deleteMany({ adviserId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.availabilityWindow)
    .deleteMany({ adviserId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.calendarConnection)
    .deleteMany({ userId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.notification)
    .deleteMany({ userId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.studentEnrollment)
    .deleteMany(profileFilter as never);
  await db
    .collection(COLLECTIONS.studentProfile)
    .deleteMany({ userId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.session)
    .deleteMany({ userId: refIn([userId]) } as never);
  await db
    .collection(COLLECTIONS.account)
    .deleteMany({ userId: refIn([userId]) } as never);
  if (user?.email) {
    await db
      .collection(COLLECTIONS.verification)
      .deleteMany({ identifier: user.email } as never);
  }
  await db.collection(COLLECTIONS.user).deleteOne(idIn([userId]) as never);
}
