import { genId } from "../../lib/db/ids.js";
import { env } from "../../lib/platform/env.js";
import { sendMail } from "../../lib/platform/mailer.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

const EMAILED_TYPES = new Set(["QUEUE_SERVING"]);

export async function notifyQueue(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await NotificationModel.insert({
    _id: genId("notification"),
    userId,
    type,
    title,
    body,
    createdAt: new Date(),
  });
  publishToUser(userId, "queue");
  if (EMAILED_TYPES.has(type)) void emailQueueTurn(userId, title, body);
}

/** Live-refresh every instructor console showing this department's line. */
export async function pingDepartmentAdvisers(
  departmentId: string,
): Promise<void> {
  for (const link of await AdviserDepartmentModel.listByDepartment(
    departmentId,
  )) {
    publishToUser(String(link.adviserId), "queue");
  }
}

/** Live-refresh a student's queue card without a notification row. */
export async function pingStudentQueue(studentProfileId: string): Promise<void> {
  const profile = await StudentProfileModel.findById(studentProfileId);
  if (profile) publishToUser(String(profile.userId), "queue");
}

async function emailQueueTurn(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const student = await UserModel.findById(userId);
    const email = student?.email?.trim();
    if (!email) return;
    const origin = env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL;
    await sendMail({
      to: email,
      subject: `${title} — ERPSYS queue`,
      text: `${body}\n\nOpen ERPSYS to see your place in line: ${origin}`,
    });
  } catch (error) {
    console.error("[queues] turn email failed", error);
  }
}

export function departmentNameOf(department: { name: string } | null): string {
  return department?.name ?? "department";
}
