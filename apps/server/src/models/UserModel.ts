import { COLLECTIONS, getDbSync, idIn, refIn } from "../lib/db/db.js";

export type StudentProfile = {
  _id: string;
  studentNumber: string;
  academicYearId: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  readTs?: number;
  writeTs?: number;
};

export type StudentProfileRow = StudentProfile & { userId: string };

function profileOf(user: UserRow | null): StudentProfileRow | null {
  return user?.studentProfile
    ? { ...user.studentProfile, _id: String(user.studentProfile._id), academicYearId: String(user.studentProfile.academicYearId), userId: String(user._id) }
    : null;
}

export type UserRow = {
  _id: string;
  name?: string | null;
  email?: string;
  emailVerified?: boolean;
  image?: string | null;
  role?: string;
  isOutsideOrg?: boolean;
  blockedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  stampName?: string | null;
  stampGraphicUrl?: string | null;
  stampSignatureUrl?: string | null;
  studentProfile?: StudentProfile | null;
};

export class UserModel {
  static async findProfileById(id: string): Promise<StudentProfileRow | null> {
    return profileOf(await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .findOne({ "studentProfile._id": refIn([id]) } as never));
  }

  static async findProfileByUserId(userId: string): Promise<StudentProfileRow | null> {
    return profileOf(await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .findOne(idIn([userId]) as never));
  }

  static async findProfileByStudentNumber(studentNumber: string): Promise<StudentProfileRow | null> {
    return profileOf(await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .findOne({ "studentProfile.studentNumber": studentNumber } as never));
  }

  static async searchProfilesByStudentNumber(
    pattern: { $regex: string; $options: string }, limit = 500,
  ): Promise<Array<{ _id: string }>> {
    const users = await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .find({ "studentProfile.studentNumber": pattern } as never).limit(limit).toArray();
    return users.flatMap(user => user.studentProfile ? [{ _id: String(user.studentProfile._id) }] : []);
  }

  static async listProfilesByUserIds(userIds: string[], limit = 500): Promise<StudentProfileRow[]> {
    if (userIds.length === 0) return [];
    const users = await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .find({ ...idIn(userIds), "studentProfile._id": { $exists: true } } as never).limit(limit).toArray();
    return users.flatMap(user => profileOf(user) ?? []);
  }

  static async findProfilesByIds(ids: string[]): Promise<StudentProfileRow[]> {
    if (ids.length === 0) return [];
    const users = await getDbSync().collection<UserRow>(COLLECTIONS.user)
      .find({ "studentProfile._id": refIn([...new Set(ids)]) } as never).toArray();
    return users.flatMap(user => profileOf(user) ?? []);
  }

  static async listUnenrolledProfiles(enrolledIds: string[], qProfileIds?: string[] | null): Promise<StudentProfileRow[]> {
    const users = await getDbSync().collection<UserRow>(COLLECTIONS.user).find({
      "studentProfile._id": { $exists: true, $nin: refIn(enrolledIds).$in, ...(qProfileIds ? refIn(qProfileIds) : {}) },
    } as never).toArray();
    return users.flatMap(user => profileOf(user) ?? []);
  }

  static async countUnenrolledProfiles(enrolledIds: string[]): Promise<number> {
    return getDbSync().collection<UserRow>(COLLECTIONS.user).countDocuments({
      "studentProfile._id": { $exists: true, $nin: refIn(enrolledIds).$in },
    } as never);
  }

  static async insertProfile(row: StudentProfileRow): Promise<void> {
    const { userId, ...profile } = row;
    const now = new Date();
    const result = await getDbSync().collection<UserRow>(COLLECTIONS.user).updateOne({
      ...idIn([userId]), studentProfile: null,
    } as never, { $set: { studentProfile: { ...profile, createdAt: profile.createdAt ?? now, updatedAt: now } } } as never);
    if (!result.matchedCount) {
      const error = new Error("User is missing or already has a student profile.");
      Object.assign(error, { code: 11000 });
      throw error;
    }
  }


  static async findById(id: string): Promise<UserRow | null> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .findOne(idIn([id]) as never, {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          emailVerified: 1,
          role: 1,
          isOutsideOrg: 1,
          blockedAt: 1,
        },
      });
  }

  static async findByIds(ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async searchByName(
    pattern: { $regex: string; $options: string },
    limit = 500,
  ): Promise<Array<{ _id: string }>> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ $or: [{ name: pattern }, { email: pattern }] } as never, {
        projection: { _id: 1 },
      })
      .limit(limit)
      .toArray();
  }

  static async listForDirectory(
    filter: Record<string, unknown>,
    dir: "asc" | "desc",
    paging?: { page: number; pageSize: number },
  ): Promise<UserRow[]> {
    let query = getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find(filter as never)
      .sort({ createdAt: dir === "asc" ? 1 : -1 });
    if (paging) {
      query = query
        .skip((paging.page - 1) * paging.pageSize)
        .limit(paging.pageSize);
    }
    return query.toArray();
  }

  static async countForDirectory(
    filter: Record<string, unknown>,
  ): Promise<number> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .countDocuments(filter as never);
  }

  static async listByRole(role: string): Promise<UserRow[]> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ role } as never, { projection: { name: 1, email: 1, role: 1 } })
      .sort({ name: 1 })
      .toArray();
  }

  static async listActiveRoles(): Promise<Array<{ role?: string }>> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ blockedAt: null } as never, { projection: { role: 1 } })
      .toArray();
  }

  static async patchById(
    id: string,
    patch: Record<string, string | null>,
  ): Promise<boolean> {
    const result = await getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
    return result.matchedCount > 0;
  }
}
