import { pathToFileURL } from "node:url";

export async function loadStepCatalog() {
  const url = new URL("../apps/server/dist/config/constants.js", import.meta.url);
  try {
    const { listSteps } = await import(url.href);
    return listSteps();
  } catch (error) {
    throw new Error(`Build the server before running the load gate: pnpm --filter @erpsys/server build (${error.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const steps = await loadStepCatalog();
  process.stdout.write(`step-catalog: ${steps.length} server-defined steps; no database bootstrap is needed.\n`);
}
