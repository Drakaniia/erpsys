export function genId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
