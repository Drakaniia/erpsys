export function profilingFormUrl(formUrl: string, email: string): string {
  const url = new URL(formUrl);
  url.searchParams.set("authuser", email.trim());
  return url.toString();
}
