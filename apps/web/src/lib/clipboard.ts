export async function copyText(text: string): Promise<boolean> {
  try {
    const nav = globalThis.navigator as unknown as
      | { clipboard?: { writeText: (t: string) => Promise<void> } }
      | undefined;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to fallback
  }

  try {
    const doc = globalThis.document as unknown as Document | undefined;
    if (!doc) return false;
    const textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    (textarea.style as unknown as { position: string }).position = "fixed";
    (textarea.style as unknown as { opacity: string }).opacity = "0";
    doc.body.appendChild(textarea);
    textarea.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
