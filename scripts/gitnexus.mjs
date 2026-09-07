// Project-local GitNexus: no shared registry, hooks, background watcher or LLM.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolRoot = path.join(root, "tools", "bin", "gitnexus");
const cli = path.join(toolRoot, "node_modules", "gitnexus", "dist", "cli", "index.js");
const args = process.argv.slice(2);

if (!existsSync(cli)) {
  console.error("GitNexus is not installed locally. See docs/operations/gitnexus.md.");
  process.exit(1);
}

const child = spawn(process.execPath, ["--max-old-space-size=4096", cli, ...args], {
  cwd: root,
  windowsHide: true,
  stdio: "inherit",
  env: {
    ...process.env,
    GITNEXUS_HOME: path.join(toolRoot, "state"),
    GITNEXUS_LBUG_BUFFER_POOL_SIZE: "536870912",
    GITNEXUS_PARSE_CHUNK_CONCURRENCY: "1",
    SCARF_ANALYTICS: "false",
    DO_NOT_TRACK: "1",
  },
});

child.on("error", (error) => {
  console.error(`GitNexus could not start: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
