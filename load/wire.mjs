export const LOAD_PATHS = {
  queue: "/api/v1/me/queue",
  departments: "/api/v1/me/departments",
};

export function encodeInput(input) {
  return JSON.stringify(input ?? {});
}

export function decodeResponse(status, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, malformed: true, message: text.slice(0, 300) };
  }
  if (status >= 200 && status < 300) {
    if (!parsed || typeof parsed !== "object" || !Object.hasOwn(parsed, "data")) {
      return { ok: false, malformed: true, message: "Expected a { data } response envelope" };
    }
    return { ok: true, value: parsed.data };
  }
  const payload = parsed && typeof parsed === "object" ? parsed : {};
  const error = payload.error && typeof payload.error === "object" ? payload.error : payload;
  return {
    ok: false,
    code: typeof error.code === "string" ? error.code : `HTTP_${status}`,
    message: typeof error.message === "string" ? error.message : typeof payload.error === "string" ? payload.error : "",
  };
}
