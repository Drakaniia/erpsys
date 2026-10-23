export const env = {
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "",
  /**
   * Standalone-API mode. Empty (default) means same-origin: the dev proxy or
   * the single-origin deploy serves `/api`. Set it to the API origin
   * (e.g. `https://api.example.edu.ph`) when the web app ships separately.
   */
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "",
};
