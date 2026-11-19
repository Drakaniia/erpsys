import { copyFile, writeFile } from "node:fs/promises";

const dist = new URL("../../apps/web/dist/", import.meta.url);
await copyFile(new URL("./pages-worker.mjs", import.meta.url), new URL("_worker.js", dist));
await writeFile(new URL("_routes.json", dist), JSON.stringify({ version: 1, include: ["/api", "/api/*"], exclude: [] }));
await writeFile(new URL("_redirects", dist), "/* /index.html 200\n");
console.log("Prepared Pages API proxy and SPA routing.");
