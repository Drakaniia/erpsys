import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cli = require
  .resolve("@remotion/cli/package.json")
  .replace(/package\.json$/, "remotion-cli.js");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(
  new URL("../../../docs/paper/screenshots/", import.meta.url),
);
const shots = [
  ["2-7-sign-in", "43-sign-in"],
  ["2-8-student-progress", "46-student-progress"],
  ["2-9-student-profiling", "48-student-profiling"],
  ["2-10-officer-submissions", "55-officer-submissions"],
  ["2-11-officer-review", "56-officer-review"],
  ["2-12-student-queue", "50-student-queue"],
  ["2-13-adviser-queue", "61-adviser-queue"],
  ["2-14-enrolled-roster", "59-enrolled-roster"],
  ["2-15-admin-overview", "65-admin-overview"],
  ["2-16-officer-overview", "54-officer-overview"],
  ["2-17-admin-activity", "65-admin-activity"],
  ["2-18-officer-activity", "2-18-officer-activity"],
];
await mkdir(output, { recursive: true });
const selected = process.argv[2];
if (selected && !shots.some(([, name]) => name === selected))
  throw Error(`Unknown screenshot: ${selected}`);
for (const [id, name] of shots.filter(
  ([, name]) => !selected || name === selected,
)) {
  console.log(`Capturing ${name}`);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        "still",
        "film/paper.tsx",
        id,
        `${output}${name}.png`,
        "--config=paper.config.ts",
        "--frame=0",
        "--log=error",
      ],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${id}: renderer exited ${code}`)),
    );
  });
}
console.log(`Captured ${shots.length} paper screenshots in ${output}`);
