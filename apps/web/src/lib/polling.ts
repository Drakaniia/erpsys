export function intervalWhileVisible(ms: number) {
  return () =>
    typeof document === "undefined" || document.hidden ? false : ms;
}
