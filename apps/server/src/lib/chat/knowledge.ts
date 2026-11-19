import { STEP_CODES } from "../../config/constants.js";
import { COLLECTIONS, getDbSync } from "../db/db.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";

export type StudentChatContext = {
  name: string | null;
  verified: string[];
  current: string | null;
  queueStatus: string | null;
};

export const OUT_OF_SCOPE_REPLY =
  "That's not in the SBO guide I have — for that one ask an SBO officer at the office. I can help with steps, requirements, and queueing — try rephrasing, e.g. 'What do I bring for step X?'";

let cachedContent: string | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateKnowledgeCache(): void {
  cachedContent = null;
  cacheTime = 0;
}

export async function getKnowledgeContent(): Promise<string> {
  const now = Date.now();
  if (cachedContent !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedContent;
  }
  const docs = await getDbSync()
    .collection<{ content: string }>(COLLECTIONS.chatbotKnowledge)
    .find({} as never)
    .sort({ updatedAt: -1 })
    .limit(1)
    .toArray();
  cachedContent = docs[0]?.content ?? "(No knowledge document uploaded yet.)";
  cacheTime = now;
  return cachedContent;
}

export function formatStudentContext(
  ctx: StudentChatContext | null | undefined,
): string {
  if (!ctx) return "";
  const verified =
    ctx.verified.length > 0 ? ctx.verified.join(", ") : "none yet";
  return [
    `STUDENT: ${ctx.name ?? "student"}`,
    `Verified steps: ${verified}`,
    `Current step: ${ctx.current ?? "all steps verified"}`,
    `Queue: ${ctx.queueStatus ?? "not in queue"}`,
  ].join("\n");
}

export function buildSystemPrompt(
  knowledgeContent: string,
  studentCtx?: StudentChatContext | null,
): string {
  const ctxBlock = formatStudentContext(studentCtx);
  const lines = [
    "You are the COT-SBO enrollment assistant for Bukidnon State University.",
    "Answer ONLY from the knowledge document below. Be concise and plain — short sentences, bullets for what-to-bring / where-to-go / what-next.",
    "Tailor next-step answers to the STUDENT block when present (their current step, verified steps, queue).",
    "If the question is not answered by the document, reply exactly:",
    `"${OUT_OF_SCOPE_REPLY}"`,
    "",
  ];
  if (ctxBlock) lines.push("--- STUDENT ---", ctxBlock, "");
  lines.push("--- KNOWLEDGE DOCUMENT ---", knowledgeContent);
  return lines.join("\n");
}

export async function getStudentChatContext(
  userId: string,
  userName?: string | null,
): Promise<StudentChatContext | null> {
  try {
    const profile = await StudentProfileModel.findByUserId(userId);
    if (!profile) return null;
    const name = userName ?? null;
    const year = await AcademicYearModel.findActive();
    if (!year) {
      return {
        name,
        verified: [],
        current: STEP_CODES[0] as string,
        queueStatus: null,
      };
    }
    const yearId = String(year._id);
    const db = getDbSync();
    const [steps, verifications, queue] = await Promise.all([
      db
        .collection<{ _id: string; code: string }>(COLLECTIONS.step)
        .find({} as never, { projection: { code: 1 } })
        .toArray(),
      db
        .collection<{ stepId: string; status?: string | null }>(
          COLLECTIONS.stepVerification,
        )
        .find(
          { studentProfileId: profile._id, academicYearId: yearId } as never,
          { projection: { stepId: 1, status: 1 } },
        )
        .toArray(),
      db
        .collection<{ status?: string | null }>(COLLECTIONS.enrollmentQueue)
        .findOne({
          studentProfileId: profile._id,
          academicYearId: yearId,
        } as never),
    ]);
    const codeById = new Map(
      steps.map((step) => [String(step._id), step.code]),
    );
    const verifiedSet = new Set(
      verifications
        .filter((row) => row.status === "VERIFIED")
        .map((row) => codeById.get(String(row.stepId)))
        .filter((code): code is string => Boolean(code)),
    );
    const order = STEP_CODES as readonly string[];
    return {
      name,
      verified: order.filter((code) => verifiedSet.has(code)),
      current: order.find((code) => !verifiedSet.has(code)) ?? null,
      queueStatus: queue?.status ?? null,
    };
  } catch {
    return null;
  }
}
