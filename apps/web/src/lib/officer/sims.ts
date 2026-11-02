export const SIMS_URL = "https://sbo-sims.vercel.app/";
export const SIMS_TITLE = "SIMS";

const SIMS_WARM_KEY = "officer-sims-warm-v1";

export function isSimsWarm(): boolean {
  try {
    return localStorage.getItem(SIMS_WARM_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSimsWarm(): void {
  try {
    localStorage.setItem(SIMS_WARM_KEY, "1");
  } catch {
    return;
  }
}
