import { ApiError } from "../../config/errors.js";
import { env } from "../platform/env.js";

const FORMS = "https://forms.googleapis.com/v1/forms";

export type FormItem = {
  title?: string;
  questionItem?: { question?: { questionId?: string } };
};

export type FormResponse = {
  respondentEmail?: string;
  lastSubmittedTime?: string;
  answers?: Record<
    string,
    { textAnswers?: { answers?: { value?: string }[] } }
  >;
};

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const refreshToken = env.GOOGLE_FORMS_REFRESH_TOKEN.trim();
  if (!refreshToken) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Google Forms isn't connected — set GOOGLE_FORMS_REFRESH_TOKEN.",
    });
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !body.access_token) {
    throw new ApiError("BAD_GATEWAY", {
      message: "Google rejected the Forms credentials.",
    });
  }
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    if (res.status === 401) cached = null;
    throw new ApiError("BAD_GATEWAY", {
      message: `Google Forms answered ${res.status}.`,
    });
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const formEditUrl = (formId: string) =>
  `https://docs.google.com/forms/d/${formId}/edit`;

export async function createForm(
  title: string,
  editorEmail: string,
): Promise<{ formId: string; responderUri: string }> {
  const form = await call<{ formId: string; responderUri: string }>(
    FORMS,
    "POST",
    { info: { title, documentTitle: title } },
  );
  const base = `${FORMS}/${form.formId}`;
  await call(`${base}:batchUpdate`, "POST", {
    requests: [
      {
        updateSettings: {
          settings: { emailCollectionType: "VERIFIED" },
          updateMask: "emailCollectionType",
        },
      },
    ],
  });
  await call(`${base}:setPublishSettings`, "POST", {
    publishSettings: {
      publishState: { isPublished: true, isAcceptingResponses: true },
    },
    updateMask: "*",
  });
  await call(
    `https://www.googleapis.com/drive/v3/files/${form.formId}/permissions?sendNotificationEmail=false`,
    "POST",
    { role: "writer", type: "user", emailAddress: editorEmail },
  ).catch(() => undefined);
  return { formId: form.formId, responderUri: form.responderUri };
}

export async function readForm(formId: string): Promise<{ items: FormItem[] }> {
  const form = await call<{ items?: FormItem[] }>(`${FORMS}/${formId}`);
  return { items: form.items ?? [] };
}

export async function listResponses(formId: string): Promise<FormResponse[]> {
  const all: FormResponse[] = [];
  let pageToken = "";
  do {
    const page = await call<{
      responses?: FormResponse[];
      nextPageToken?: string;
    }>(
      `${FORMS}/${formId}/responses?pageSize=5000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    all.push(...(page.responses ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return all;
}
