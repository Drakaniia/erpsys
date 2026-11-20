import { resetAuthenticator } from "../config/auth/admin-gate.js";
import { COLLECTIONS, getDb } from "../lib/db/db.js";

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

await resetAuthenticator(String(user._id));

console.log(
  `reset authenticator for ${email}; set it up again on the next integration change`,
);
process.exit(0);
