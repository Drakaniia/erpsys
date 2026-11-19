import { ApiError } from "../config/errors.js";
import { formEditUrl, listResponses, readForm } from "../lib/google/forms.js";
import { integrationEnabled } from "../lib/platform/integration-settings.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";

import {
  ContentModel,
  type SocialLinkRow,
} from "../models/ContentModel.js";
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

export async function profilingAnswers(formId: string, email: string) {
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
    throw new ApiError("PRECONDITION_FAILED", {
      message: `No Google Form response from ${email} yet — submit the form signed in with that account, then try again.`,
    });
  }
  const rows: { label: string; value: string }[] = [];
  for (const item of form.items) {
    const id = item.questionItem?.question?.questionId;
    const values = (id ? mine.answers?.[id]?.textAnswers?.answers : [])
      ?.map((a) => a.value?.trim() ?? "")
      .filter(Boolean);
    if (values?.length) {
      rows.push({ label: item.title ?? "Question", value: values.join(", ") });
    }
  }
  return rows;
}
