import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import {
  createForm,
  formEditUrl,
  listResponses,
  readForm,
} from "../../lib/google/forms.js";
import { integrationEnabled } from "../../lib/platform/integration-settings.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { ProfilingFormModel } from "../../models/ProfilingFormModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";

export type ProfilingFormView = {
  formId: string;
  title: string;
  responderUri: string;
  editUrl: string;
  updatedById: string | null;
  updatedByName: string | null;
  updatedAt: string;
} | null;

const forms = () =>
  getDbSync().collection<{ _id: string }>(COLLECTIONS.profilingForm);

async function assertFormsEnabled(message: string): Promise<void> {
  if (!(await integrationEnabled("googleForms"))) {
    throw new ApiError("SERVICE_UNAVAILABLE", { message });
  }
}

export class ProfilingFormService {
  static async read(): Promise<ProfilingFormView> {
    const year = await AcademicYearModel.findActive();
    if (!year) return null;

    const form = await ProfilingFormModel.findByYear(String(year._id));
    if (!form?.formId) return null;
    const updatedBy = form.updatedById
      ? await getDbSync()
          .collection<{ _id: string; name: string }>(COLLECTIONS.user)
          .findOne(idIn([form.updatedById]) as never)
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

  static async create(
    actor: { id: string; email: string },
    title: string,
    audit: boolean,
  ): Promise<ProfilingFormView> {
    await assertFormsEnabled(
      "Google Forms is turned off — an admin can turn it back on under Integrations.",
    );
    const year = await AcademicYearService.activeOrThrow();
    const existing = await ProfilingFormModel.findByYear(String(year._id));
    if (existing?.formId) {
      throw new ApiError("CONFLICT", {
        message: "A Google Form is already linked — unlink it first.",
      });
    }

    const { formId, responderUri } = await createForm(title, actor.email);
    await forms().updateOne(
      { academicYearId: year._id } as never,
      {
        $set: {
          academicYearId: year._id,
          formId,
          title,
          responderUri,
          updatedById: actor.id,
          updatedAt: new Date(),
        },
        $unset: { fields: "", formUrl: "" },
        $setOnInsert: { _id: genId("form") },
      } as never,
      { upsert: true } as never,
    );

    if (audit) {
      await AdminActionLogModel.log(
        actor.id,
        "Created profiling Google Form",
        `${year.label} · ${year.semesterLabel}`,
      );
    }
    return ProfilingFormService.read();
  }

  static async remove(actorId: string, audit: boolean): Promise<{ ok: true }> {
    const year = await AcademicYearService.activeOrThrow();
    await forms().deleteMany({ academicYearId: year._id } as never);
    if (audit) {
      await AdminActionLogModel.log(
        actorId,
        "Unlinked profiling Google Form",
        `${year.label} · ${year.semesterLabel}`,
      );
    }
    return { ok: true };
  }

  static async responseRows(
    formId: string,
    email: string,
  ): Promise<{ label: string; value: string }[]> {
    await assertFormsEnabled(
      "Profiling is temporarily unavailable — try again later or ask the office.",
    );
    const [form, responses] = await Promise.all([
      readForm(formId),
      listResponses(formId),
    ]);
    const mine = responses
      .filter(
        (r) => r.respondentEmail?.toLowerCase() === email.toLowerCase(),
      )
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
}
