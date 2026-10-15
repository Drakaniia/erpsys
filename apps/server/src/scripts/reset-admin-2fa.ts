import { COLLECTIONS, getDb, idIn, refIn } from "../lib/db/db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("usage: pnpm --filter @erpsys/server admin:reset-2fa <email>");
  process.exit(1);
}

const db = await getDb();
const user = await db
  .collection(COLLECTIONS.user)
  .findOne({ email } as never, { projection: { _id: 1 } });
if (!user) {
  console.error(`no user with email ${email}`);
  process.exit(1);
}
const userId = String(user._id);

await db.collection("twoFactor").deleteMany({ userId: refIn([userId]) } as never);
await db.collection(COLLECTIONS.adminStepUp).deleteMany({ _id: userId } as never);
await db
  .collection(COLLECTIONS.user)
  .updateOne(idIn([userId]) as never, { $set: { twoFactorEnabled: false } });

console.log(`reset authenticator for ${email}; set it up again on the next integration change`);
process.exit(0);
