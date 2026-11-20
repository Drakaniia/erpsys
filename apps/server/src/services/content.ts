import { ApiError } from "../config/errors.js";
import { formEditUrl, listResponses, readForm } from "../lib/google/forms.js";
import { integrationEnabled } from "../lib/platform/integration-settings.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";

import { ContentModel, type SocialLinkRow } from "../models/ContentModel.js";
import { UserModel } from "../models/UserModel.js";

export const socialLinkView = (
  row: Pick<SocialLinkRow, "_id" | "name" | "url" | "order">,
) => ({
  id: String(row._id),
  name: row.name,
  url: row.url,
  order: row.order,
});

export async function listSocialLinks() {
  return (await ContentModel.listActiveSocialLinks()).map(socialLinkView);
}

export async function assertFormsEnabled(message: string) {
  if (!(await integrationEnabled("googleForms"))) {
    throw new ApiError("SERVICE_UNAVAILABLE", { message });
  }
}

export async function readProfilingForm() {
  const year = await AcademicYearModel.findActive();
  if (!year) return null;
  const form = year.profilingForm;
  if (!form?.formId) return null;
  const updatedBy = form.updatedById
    ? await UserModel.findById(form.updatedById)
    : null;
  return {
    formId: form.formId,
    title: form.title ?? "",
    responderUri: form.responderUri ?? "",
    editUrl: formEditUrl(form.formId),
    updatedById: updatedBy ? String(updatedBy._id) : null,
    updatedByName: updatedBy?.name ?? null,
    updatedAt: (form.updatedAt ?? new Date()).toISOString(),
  };
}

export type ProfilingResponse = {
  status: "NOT_SUBMITTED" | "INCOMPLETE" | "COMPLETE" | "UNAVAILABLE";
  submittedAt: string | null;
  answers: { label: string; value: string }[];
  missingRequired: string[];
};

export async function profilingAnswers(
  formId: string,
  email: string,
): Promise<ProfilingResponse> {
  await assertFormsEnabled(
    "Profiling is temporarily unavailable — try again later or ask the office.",
  );
  const [form, responses] = await Promise.all([
    readForm(formId),
    listResponses(formId),
  ]);
  const mine = responses
    .filter((r) => r.respondentEmail?.toLowerCase() === email.toLowerCase())
    .sort((a, b) =>
      (b.lastSubmittedTime ?? "").localeCompare(a.lastSubmittedTime ?? ""),
    )[0];
  if (!mine) {
    return {
      status: "NOT_SUBMITTED",
      submittedAt: null,
      answers: [],
      missingRequired: [],
    };
  }
  const answers: ProfilingResponse["answers"] = [];
  const missingRequired: string[] = [];
  let destination: string | undefined;
  const visited = new Set<number>();
  for (let index = 0; index < form.items.length; index++) {
    if (visited.has(index)) break;
    visited.add(index);
    let item = form.items[index];
    if (item.pageBreakItem && destination) {
      if (destination === "SUBMIT_FORM") break;
      const next = form.items.findIndex(
        (section) => section.itemId === destination,
      );
      destination = undefined;
      if (next < 0)
        throw new ApiError("BAD_GATEWAY", {
          message: "Invalid Google Forms section destination.",
        });
      index = next;
      item = form.items[index];
    }
    const questions = item.questionItem?.question
      ? [item.questionItem.question]
      : (item.questionGroupItem?.questions ?? []);
    for (const question of questions) {
      const answer = question.questionId
        ? mine.answers?.[question.questionId]
        : undefined;
      const values = [
        ...(answer?.textAnswers?.answers ?? []).map(
          (a) => a.value?.trim() ?? "",
        ),
        ...(answer?.fileUploadAnswers?.answers ?? [])
          .filter((a) => a.fileId)
          .map((a) => a.fileName?.trim() || "Uploaded file"),
      ].filter(Boolean);
      const option = question.choiceQuestion?.options?.find((option) =>
        values.includes(option.value ?? ""),
      );
      if (option?.goToSectionId) destination = option.goToSectionId;
      else if (option?.goToAction === "SUBMIT_FORM")
        destination = "SUBMIT_FORM";
      const label =
        [item.title, question.rowQuestion?.title].filter(Boolean).join(" — ") ||
        "Question";
      if (question.required && values.length === 0) missingRequired.push(label);
      answers.push({ label, value: values.join(", ") });
    }
  }
  return {
    status:
      answers.some((answer) => answer.value) && missingRequired.length === 0
        ? "COMPLETE"
        : "INCOMPLETE",
    submittedAt: mine.lastSubmittedTime ?? null,
    answers,
    missingRequired,
  };
}
