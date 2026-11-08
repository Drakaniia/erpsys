/**
 * REST wire helpers.
 *
 * The server exposes a resource-oriented REST surface
 * (`apps/server/src/routes/rest/catalog.ts`); there is no `/rpc` mount. The
 * enrollment-day scenario drives three of those resources:
 *
 *   POST /queues           body {departmentId} → {entryId, departmentName, position}
 *   GET  /departments/mine                     → the caller's department queue, or null
 *   GET  /queues/mine                          → the caller's queue status, or null
 *
 * Unlike the oRPC surface this replaces, there is no `{json: <output>}`
 * envelope. A success is the raw resource JSON (spec D7) and a failure is
 * `{error, code, requestId}` with the HTTP status carrying the meaning (spec
 * D8): 409 for a duplicate queue entry, 412 for a missing active year, 401/403
 * for auth. So the **status** decides success from failure here, and the body
 * only supplies the code and message for the report.
 *
 * Guessing any of this produces a load test that measures 400s, so it is
 * asserted in one place instead of being restated per call site.
 */

/** The exact bytes to POST for `input` — a bare JSON object, no envelope. */
export function encodeInput(input) {
  return JSON.stringify(input ?? {});
}

/**
 * Decode a response given its status and body text. Returns the raw resource
 * value on success, or a `{code, message}` on failure. Never throws on a
 * malformed body — a garbled response is a result the gate needs to report, not
 * an exception.
 */
export function decodeResponse(status, text) {
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    return { ok: false, malformed: true, message: text.slice(0, 300) };
  }

  if (status >= 200 && status < 300) {
    return { ok: true, value: parsed };
  }

  const payload = parsed && typeof parsed === "object" ? parsed : {};
  const code =
    typeof payload.code === "string" ? payload.code : `HTTP_${status}`;
  const message =
    typeof payload.error === "string"
      ? payload.error
      : typeof payload.message === "string"
        ? payload.message
        : "";
  return { ok: false, code, message };
}
