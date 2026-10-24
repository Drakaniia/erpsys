export function updateUrl(
  updates: Record<string, string | null>,
  replace = true,
): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (replace) window.history.replaceState(window.history.state, "", next);
  else window.history.pushState(window.history.state, "", next);
}
