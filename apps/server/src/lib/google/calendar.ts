import { env } from "../platform/env.js";

export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const CALENDAR_NAME = "ERPSYS Office Hours";

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class CalendarAuthError extends Error {}

export class CalendarHttpError extends Error {
  constructor(readonly status: number) {
    super(`Google Calendar answered ${status}.`);
  }
}

export type GoogleEvent = {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  reminders: { useDefault: false };
  extendedProperties: { private: Record<string, string> };
};

export type ListedEvent = {
  id: string;
  extendedProperties?: { private?: Record<string, string> };
};

const cache = new Map<string, { token: string; expiresAt: number }>();

async function tokenRequest(params: Record<string, string>): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new CalendarAuthError();
    throw new CalendarHttpError(res.status);
  }
  return body;
}

export function consentUrl(state: string, redirectUri: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${CALENDAR_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; scope: string; email: string | null }> {
  const body = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  let email: string | null = null;
  try {
    const claims = JSON.parse(
      Buffer.from(body.id_token!.split(".")[1]!, "base64url").toString(),
    ) as { email?: string };
    email = claims.email ?? null;
  } catch {
    email = null;
  }
  return {
    refreshToken: body.refresh_token ?? "",
    scope: body.scope ?? "",
    email,
  };
}

export async function accessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const body = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!body.access_token) throw new CalendarHttpError(502);
  cache.set(userId, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

export function forgetAccessToken(userId: string): void {
  cache.delete(userId);
}

async function call<T>(
  userId: string,
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) {
    forgetAccessToken(userId);
    throw new CalendarAuthError();
  }
  if (!res.ok) throw new CalendarHttpError(res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createCalendar(
  userId: string,
  token: string,
): Promise<string> {
  const made = await call<{ id: string }>(userId, token, "/calendars", "POST", {
    summary: CALENDAR_NAME,
    timeZone: "Asia/Manila",
  });
  return made.id;
}

export async function listEvents(
  userId: string,
  token: string,
  calendarId: string,
): Promise<ListedEvent[]> {
  const all: ListedEvent[] = [];
  let pageToken = "";
  do {
    const page = await call<{ items?: ListedEvent[]; nextPageToken?: string }>(
      userId,
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&privateExtendedProperty=erpsys%3D1${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    all.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return all;
}

export async function putEvent(
  userId: string,
  token: string,
  calendarId: string,
  event: GoogleEvent,
): Promise<void> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    await call(userId, token, `${base}?sendUpdates=none`, "POST", event);
  } catch (error) {
    if (!(error instanceof CalendarHttpError) || error.status !== 409) {
      throw error;
    }
    await call(
      userId,
      token,
      `${base}/${event.id}?sendUpdates=none`,
      "PUT",
      { ...event, status: "confirmed" },
    );
  }
}

export async function deleteEvent(
  userId: string,
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await call(
      userId,
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`,
      "DELETE",
    );
  } catch (error) {
    if (
      error instanceof CalendarHttpError &&
      (error.status === 404 || error.status === 410)
    ) {
      return;
    }
    throw error;
  }
}

export async function deleteCalendar(
  userId: string,
  token: string,
  calendarId: string,
): Promise<void> {
  await call(
    userId,
    token,
    `/calendars/${encodeURIComponent(calendarId)}`,
    "DELETE",
  );
}

export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });
}
